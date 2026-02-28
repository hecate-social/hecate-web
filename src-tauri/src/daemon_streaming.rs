//! Always-on SSE client that connects to the daemon's /api/events endpoint
//! and forwards domain state changes as Tauri events.
//!
//! Auto-reconnects on disconnect with a 3-second retry delay.
//! Uses the same Unix socket resolution as the rest of the app.

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::socket_proxy::resolve_socket_path;

const RECONNECT_DELAY: Duration = Duration::from_secs(3);
const STREAM_PATH: &str = "/api/events";

/// Start the background SSE streaming thread.
/// Runs forever, auto-reconnecting on disconnect.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        eprintln!("[daemon_streaming] starting SSE event stream");
        loop {
            match connect_and_stream(&app) {
                Ok(()) => {
                    eprintln!("[daemon_streaming] stream ended cleanly, reconnecting...");
                }
                Err(e) => {
                    eprintln!("[daemon_streaming] connection error: {}, retrying in 3s...", e);
                }
            }
            std::thread::sleep(RECONNECT_DELAY);
        }
    });
}

fn connect_and_stream(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let socket_path = resolve_socket_path();
    let mut stream = UnixStream::connect(&socket_path)?;
    stream.set_read_timeout(None)?;

    let http_req = format!(
        "GET {} HTTP/1.1\r\nHost: localhost\r\nAccept: text/event-stream\r\nConnection: keep-alive\r\n\r\n",
        STREAM_PATH
    );
    stream.write_all(http_req.as_bytes())?;

    let mut reader = BufReader::new(stream);

    // Read HTTP status line
    let mut status_line = String::new();
    reader.read_line(&mut status_line)?;
    let status_code = parse_status(&status_line);

    if status_code >= 400 {
        return Err(format!("daemon returned HTTP {}", status_code).into());
    }

    // Read headers, detect chunked transfer encoding
    let mut is_chunked = false;
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            return Err("connection closed during headers".into());
        }
        if line.trim().is_empty() {
            break;
        }
        let lower = line.to_lowercase();
        if lower.contains("transfer-encoding") && lower.contains("chunked") {
            is_chunked = true;
        }
    }

    eprintln!("[daemon_streaming] connected, chunked={}", is_chunked);

    if is_chunked {
        read_sse_chunked(app, &mut reader)
    } else {
        read_sse_direct(app, &mut reader)
    }
}

/// Read SSE from a chunked transfer-encoded stream (cowboy default).
fn read_sse_chunked(
    app: &AppHandle,
    reader: &mut BufReader<UnixStream>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut leftover = String::new();
    let mut current_event_type: Option<String> = None;
    let mut current_data: Option<String> = None;

    loop {
        // Read chunk size line
        let mut size_line = String::new();
        let bytes_read = reader.read_line(&mut size_line)?;
        if bytes_read == 0 {
            break;
        }

        let trimmed = size_line.trim();
        let size = match usize::from_str_radix(trimmed, 16) {
            Ok(s) => s,
            Err(_) => continue,
        };

        if size == 0 {
            break; // Final chunk
        }

        let mut chunk_buf = vec![0u8; size];
        std::io::Read::read_exact(reader, &mut chunk_buf)?;

        // Read trailing CRLF
        let mut _trail = String::new();
        let _ = reader.read_line(&mut _trail);

        let chunk_str = String::from_utf8_lossy(&chunk_buf);
        leftover.push_str(&chunk_str);

        // Process complete lines
        while let Some(newline_pos) = leftover.find('\n') {
            let line = leftover[..newline_pos].trim_end_matches('\r').to_string();
            leftover = leftover[newline_pos + 1..].to_string();

            process_sse_line(app, &line, &mut current_event_type, &mut current_data);
        }
    }

    Ok(())
}

/// Read SSE from a non-chunked stream (fallback).
fn read_sse_direct(
    app: &AppHandle,
    reader: &mut BufReader<UnixStream>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut current_event_type: Option<String> = None;
    let mut current_data: Option<String> = None;

    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            break;
        }
        let trimmed = line.trim_end_matches('\n').trim_end_matches('\r').to_string();
        process_sse_line(app, &trimmed, &mut current_event_type, &mut current_data);
    }

    Ok(())
}

/// Process a single SSE line per the SSE spec.
/// - `event: <type>` sets the event type
/// - `data: <payload>` sets the data
/// - Empty line dispatches the accumulated event
/// - `: comment` lines are ignored (heartbeats)
fn process_sse_line(
    app: &AppHandle,
    line: &str,
    current_event_type: &mut Option<String>,
    current_data: &mut Option<String>,
) {
    if line.is_empty() {
        // Blank line = dispatch event
        if let Some(data) = current_data.take() {
            let event_type = current_event_type.take().unwrap_or_default();
            dispatch_event(app, &event_type, &data);
        }
        *current_event_type = None;
    } else if let Some(comment) = line.strip_prefix(':') {
        // SSE comment (heartbeat, etc.) — ignore
        let _ = comment;
    } else if let Some(value) = line.strip_prefix("event: ") {
        *current_event_type = Some(value.trim().to_string());
    } else if let Some(value) = line.strip_prefix("event:") {
        *current_event_type = Some(value.trim().to_string());
    } else if let Some(value) = line.strip_prefix("data: ") {
        *current_data = Some(value.to_string());
    } else if let Some(value) = line.strip_prefix("data:") {
        *current_data = Some(value.trim().to_string());
    }
}

/// Map SSE event type to Tauri event name and emit.
fn dispatch_event(app: &AppHandle, event_type: &str, data: &str) {
    let tauri_event = match event_type {
        "realm_join_status" => "daemon-realm-join-status",
        "identity_changed" => "daemon-identity-changed",
        "settings_changed" => "daemon-settings-changed",
        other => {
            eprintln!("[daemon_streaming] unknown event type: {}", other);
            return;
        }
    };

    match serde_json::from_str::<serde_json::Value>(data) {
        Ok(value) => {
            if let Err(e) = app.emit(tauri_event, value) {
                eprintln!("[daemon_streaming] emit failed for {}: {}", tauri_event, e);
            }
        }
        Err(e) => {
            eprintln!("[daemon_streaming] JSON parse error for {}: {}", tauri_event, e);
        }
    }
}

fn parse_status(status_line: &str) -> u16 {
    status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(500)
}
