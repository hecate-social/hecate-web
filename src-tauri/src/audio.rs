use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use std::io::Cursor;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

/// Shared recording buffer — the cpal stream writes samples here.
static RECORDING_SAMPLES: std::sync::LazyLock<Arc<Mutex<Vec<f32>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(Vec::new())));

static RECORDING_CONFIG: std::sync::LazyLock<Mutex<Option<(u16, u32)>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

/// Selected PulseAudio source name (set by user via device picker).
static SELECTED_SOURCE: std::sync::LazyLock<Mutex<Option<String>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

/// Channel to signal the recording thread to stop.
/// The recording thread owns the cpal::Stream and drops it on its own thread.
static STOP_SIGNAL: std::sync::LazyLock<Mutex<Option<mpsc::Sender<()>>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

/// Tracks whether a recording thread is active.
static RECORDING_ACTIVE: std::sync::LazyLock<std::sync::atomic::AtomicBool> =
    std::sync::LazyLock::new(|| std::sync::atomic::AtomicBool::new(false));

#[derive(Serialize)]
pub struct AudioDevice {
    /// PulseAudio source name (e.g. "alsa_input.pci-0000_00_1f.3.analog-stereo")
    id: String,
    /// Human-readable description (e.g. "Built-in Audio Analog Stereo")
    name: String,
}

/// List audio input devices via PulseAudio/PipeWire (pactl).
/// Returns human-readable device names that users actually recognize.
#[tauri::command]
pub fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    let output = Command::new("pactl")
        .args(["--format=json", "list", "sources"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| format!("Failed to run pactl: {}", e))?;

    if !output.status.success() {
        return list_audio_devices_fallback();
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Failed to parse pactl JSON: {}", e))?;

    let sources = json.as_array().ok_or("Expected array from pactl")?;
    let mut devices = Vec::new();

    for source in sources {
        let name = source
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let description = source
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or(&name)
            .to_string();

        // Skip monitor sources (they capture output audio, not mic input)
        if name.contains(".monitor") {
            continue;
        }

        devices.push(AudioDevice {
            id: name,
            name: description,
        });
    }

    Ok(devices)
}

/// Fallback: use pactl without JSON if --format=json isn't supported.
fn list_audio_devices_fallback() -> Result<Vec<AudioDevice>, String> {
    let output = Command::new("pactl")
        .args(["list", "sources"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| format!("Failed to run pactl: {}", e))?;

    let text = String::from_utf8_lossy(&output.stdout);
    let mut devices = Vec::new();
    let mut current_name = String::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(n) = trimmed.strip_prefix("Name: ") {
            current_name = n.to_string();
        }
        if let Some(desc) = trimmed.strip_prefix("Description: ") {
            if !current_name.contains(".monitor") && !current_name.is_empty() {
                devices.push(AudioDevice {
                    id: current_name.clone(),
                    name: desc.to_string(),
                });
            }
        }
    }

    Ok(devices)
}

/// Select a PulseAudio source for recording.
/// When set, recording uses this source via PULSE_SOURCE env var.
#[tauri::command]
pub fn select_audio_device(device_id: Option<String>) -> Result<(), String> {
    let mut guard = SELECTED_SOURCE.lock().map_err(|e| e.to_string())?;
    *guard = device_id;
    Ok(())
}

/// Start recording audio. Returns immediately, recording runs in background.
/// Uses the selected PulseAudio source (or system default).
///
/// The cpal::Stream is created and owned by a dedicated thread so it is
/// always dropped on the same thread that created it (cpal::Stream is !Send).
#[tauri::command]
pub fn start_audio_recording() -> Result<(), String> {
    // Stop any existing recording
    {
        let mut sig = STOP_SIGNAL.lock().map_err(|e| e.to_string())?;
        if let Some(tx) = sig.take() {
            let _ = tx.send(());
            // Give the recording thread a moment to clean up
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }

    // Clear sample buffer
    {
        let mut samples = RECORDING_SAMPLES.lock().map_err(|e| e.to_string())?;
        samples.clear();
    }

    // Read selected source name before spawning thread
    let source_name = {
        let source = SELECTED_SOURCE.lock().map_err(|e| e.to_string())?;
        source.clone()
    };

    let (tx, rx) = mpsc::channel::<()>();
    {
        let mut sig = STOP_SIGNAL.lock().map_err(|e| e.to_string())?;
        *sig = Some(tx);
    }

    // Use a oneshot channel to report errors from the recording thread
    let (err_tx, err_rx) = mpsc::channel::<Result<(), String>>();

    std::thread::spawn(move || {
        // Set PULSE_SOURCE env var on THIS thread (affects cpal device selection)
        match &source_name {
            Some(name) => std::env::set_var("PULSE_SOURCE", name),
            None => std::env::remove_var("PULSE_SOURCE"),
        }

        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                let _ = err_tx.send(Err("No default input device".to_string()));
                return;
            }
        };

        let config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                let _ = err_tx.send(Err(format!("No default input config: {}", e)));
                return;
            }
        };

        // Store config for WAV encoding later
        {
            if let Ok(mut cfg) = RECORDING_CONFIG.lock() {
                *cfg = Some((config.channels(), config.sample_rate().0));
            }
        }

        let samples_ref = RECORDING_SAMPLES.clone();

        let err_fn = |err: cpal::StreamError| {
            eprintln!("[audio] Recording error: {}", err);
        };

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if let Ok(mut buf) = samples_ref.lock() {
                        buf.extend_from_slice(data);
                    }
                },
                err_fn,
                None,
            ),
            cpal::SampleFormat::I16 => {
                let sr = RECORDING_SAMPLES.clone();
                device.build_input_stream(
                    &config.into(),
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut buf) = sr.lock() {
                            buf.extend(data.iter().map(|&s| s as f32 / i16::MAX as f32));
                        }
                    },
                    err_fn,
                    None,
                )
            }
            cpal::SampleFormat::U16 => {
                let sr = RECORDING_SAMPLES.clone();
                device.build_input_stream(
                    &config.into(),
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut buf) = sr.lock() {
                            buf.extend(
                                data.iter()
                                    .map(|&s| (s as f32 - 32768.0) / 32768.0),
                            );
                        }
                    },
                    err_fn,
                    None,
                )
            }
            _ => {
                let _ = err_tx.send(Err("Unsupported sample format".to_string()));
                return;
            }
        };

        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                let _ = err_tx.send(Err(format!("Failed to build input stream: {}", e)));
                return;
            }
        };

        if let Err(e) = stream.play() {
            let _ = err_tx.send(Err(format!("Failed to start recording: {}", e)));
            return;
        }

        RECORDING_ACTIVE.store(true, std::sync::atomic::Ordering::SeqCst);

        // Signal success to the caller
        let _ = err_tx.send(Ok(()));

        // Block this thread until stop signal received.
        // The stream lives on this thread and will be dropped here.
        let _ = rx.recv();

        // Pause the stream first so the audio callback stops firing,
        // then wait for any in-flight callback to finish before dropping.
        let _ = stream.pause();
        std::thread::sleep(std::time::Duration::from_millis(50));

        // Stream is dropped here, on the same thread that created it.
        drop(stream);

        // Extra settle time after drop for backend cleanup
        std::thread::sleep(std::time::Duration::from_millis(50));
        RECORDING_ACTIVE.store(false, std::sync::atomic::Ordering::SeqCst);
    });

    // Wait for the recording thread to report success or error
    match err_rx.recv() {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Recording thread died unexpectedly".to_string()),
    }
}

/// Stop recording and return the audio as base64-encoded WAV.
#[tauri::command]
pub fn stop_audio_recording() -> Result<String, String> {
    eprintln!("[audio] stop_audio_recording called");

    // Signal the recording thread to stop (it will drop the stream on its own thread)
    {
        let mut sig = STOP_SIGNAL.lock().map_err(|e| e.to_string())?;
        if let Some(tx) = sig.take() {
            let _ = tx.send(());
        }
    }

    eprintln!("[audio] waiting for recording thread to finish");

    // Wait for the recording thread to finish dropping the stream
    for _ in 0..50 {
        if !RECORDING_ACTIVE.load(std::sync::atomic::Ordering::SeqCst) {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    let sample_count = {
        let guard = RECORDING_SAMPLES.lock().map_err(|e| e.to_string())?;
        guard.len()
    };

    eprintln!("[audio] recorded {} samples", sample_count);

    if sample_count == 0 {
        return Err("Recording is empty".to_string());
    }

    let samples = {
        let guard = RECORDING_SAMPLES.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };

    let (channels, sample_rate) = {
        let cfg = RECORDING_CONFIG.lock().map_err(|e| e.to_string())?;
        cfg.ok_or("No recording config")?
    };

    eprintln!("[audio] encoding WAV: channels={}, sample_rate={}, samples={}", channels, sample_rate, samples.len());

    // Encode to WAV in memory
    let mut wav_buf = Cursor::new(Vec::new());
    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer =
        hound::WavWriter::new(&mut wav_buf, spec).map_err(|e| format!("WAV encode error: {}", e))?;

    for &sample in &samples {
        let s16 = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        writer
            .write_sample(s16)
            .map_err(|e| format!("WAV write error: {}", e))?;
    }
    writer
        .finalize()
        .map_err(|e| format!("WAV finalize error: {}", e))?;

    let wav_bytes = wav_buf.into_inner();
    eprintln!("[audio] WAV encoded: {} bytes", wav_bytes.len());

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);
    eprintln!("[audio] base64 encoded: {} chars, returning to frontend", b64.len());

    Ok(b64)
}

/// Get current audio input level (0.0 - 1.0) for visualization.
/// Computes RMS of the most recent samples in the buffer.
#[tauri::command]
pub fn get_audio_level() -> Result<f32, String> {
    if !RECORDING_ACTIVE.load(std::sync::atomic::Ordering::SeqCst) {
        return Ok(0.0);
    }

    let guard = RECORDING_SAMPLES.lock().map_err(|e| e.to_string())?;
    if guard.is_empty() {
        return Ok(0.0);
    }

    // Use last 2048 samples (~42ms at 48kHz) for responsive level metering
    let window = 2048.min(guard.len());
    let start = guard.len() - window;
    let slice = &guard[start..];

    let sum_sq: f32 = slice.iter().map(|s| s * s).sum();
    let rms = (sum_sq / window as f32).sqrt();

    // Scale to 0.0-1.0 range with some headroom compression
    // RMS of ~0.1 is moderate speech, ~0.3 is loud
    let level = (rms * 5.0).min(1.0);

    Ok(level)
}
