use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::Emitter;

use crate::socket_proxy;

const SOCKET_NAME: &str = "api.sock";
const STARTUP_RETRY_DELAY: Duration = Duration::from_millis(500);
const STARTUP_RETRIES: u32 = 10;
const RECHECK_INTERVAL: Duration = Duration::from_secs(30);

/// Cached health state. Updated by the watcher thread (inotify + periodic recheck).
/// Read by the `get_cached_health` Tauri command — no socket I/O, just reads memory.
static HEALTH_CACHE: Mutex<Option<serde_json::Value>> = Mutex::new(None);

/// Tauri command: read cached daemon health from memory.
/// The watcher thread keeps this up-to-date via inotify + 30s recheck.
/// This never touches the Unix socket — it just reads what the watcher last saw.
#[tauri::command]
pub fn get_cached_health() -> Option<serde_json::Value> {
    HEALTH_CACHE.lock().ok().and_then(|cache| cache.clone())
}

fn update_cache(health: &Option<serde_json::Value>) {
    if let Ok(mut cache) = HEALTH_CACHE.lock() {
        *cache = health.clone();
    }
}

fn emit_health(app: &tauri::AppHandle, health: Option<serde_json::Value>) {
    update_cache(&health);
    match app.emit("daemon-health", &health) {
        Ok(_) => {
            let label = if health.is_some() { "connected" } else { "unavailable" };
            eprintln!("[watcher] health cache updated: {}", label);
        }
        Err(e) => eprintln!("[watcher] emit failed (cache still updated): {}", e),
    }
}

fn try_health_check() -> Option<serde_json::Value> {
    match socket_proxy::check_daemon_health() {
        Ok(v) => {
            eprintln!("[watcher] health check OK");
            Some(v)
        }
        Err(e) => {
            eprintln!("[watcher] health check FAILED: {}", e);
            None
        }
    }
}

fn wait_for_healthy(app: &tauri::AppHandle) {
    for attempt in 0..STARTUP_RETRIES {
        eprintln!("[watcher] wait_for_healthy attempt {}/{}", attempt + 1, STARTUP_RETRIES);
        if let Some(h) = try_health_check() {
            emit_health(app, Some(h));
            return;
        }
        if attempt < STARTUP_RETRIES - 1 {
            std::thread::sleep(STARTUP_RETRY_DELAY);
        }
    }
    eprintln!("[watcher] gave up waiting for healthy");
    emit_health(app, None);
}

fn socket_dir() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".hecate").join("hecate-daemon").join("sockets")
    } else {
        PathBuf::from("/run/hecate")
    }
}

fn socket_path() -> PathBuf {
    socket_dir().join(SOCKET_NAME)
}

pub fn start(app: tauri::AppHandle) {
    eprintln!("[watcher] starting daemon watcher");
    std::thread::spawn(move || {
        let dir = socket_dir();
        let sock = socket_path();
        eprintln!("[watcher] watching dir: {}", dir.display());

        std::fs::create_dir_all(&dir).ok();

        // Emit initial state
        if sock.exists() {
            eprintln!("[watcher] socket exists at startup");
            wait_for_healthy(&app);
        } else {
            eprintln!("[watcher] socket NOT found at startup");
            emit_health(&app, None);
        }

        // Set up inotify watcher
        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |res: Result<Event, _>| {
            if let Ok(event) = res {
                tx.send(event).ok();
            }
        }) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[watcher] failed to create watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(dir.as_path(), RecursiveMode::NonRecursive) {
            eprintln!("[watcher] failed to watch {}: {}", dir.display(), e);
            return;
        }
        eprintln!("[watcher] inotify watching {}", dir.display());

        // inotify for instant detection + 30s periodic recheck as safety net.
        // Covers stale sockets, daemon restarts that reuse the same path, etc.
        loop {
            match rx.recv_timeout(RECHECK_INTERVAL) {
                Ok(event) => {
                    let dominated = event
                        .paths
                        .iter()
                        .any(|p| p.file_name().map(|n| n == SOCKET_NAME).unwrap_or(false));

                    if !dominated {
                        continue;
                    }

                    eprintln!("[watcher] inotify event: {:?}", event.kind);

                    match event.kind {
                        EventKind::Create(_) | EventKind::Modify(_) => {
                            wait_for_healthy(&app);
                        }
                        EventKind::Remove(_) => {
                            emit_health(&app, None);
                        }
                        _ => {}
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if sock.exists() {
                        match try_health_check() {
                            Some(h) => emit_health(&app, Some(h)),
                            None => emit_health(&app, None),
                        }
                    }
                    // No socket = no log spam, just wait for inotify Create
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    eprintln!("[watcher] channel disconnected, exiting");
                    break;
                }
            }
        }
    });
}
