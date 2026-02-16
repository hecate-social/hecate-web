use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::net::UnixStream;
use tauri::{AppHandle, Emitter};

use crate::socket_proxy::resolve_socket_path;

#[tauri::command]
pub async fn irc_stream(app: AppHandle, stream_id: String) -> Result<(), String> {
    let event_name = format!("irc-event-{}", stream_id);
    let error_event = format!("irc-error-{}", stream_id);

    eprintln!("[irc_stream] starting stream_id={}", stream_id);

    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            do_irc_stream(&app, &event_name)
        }));

        match result {
            Ok(Ok(())) => {
                eprintln!("[irc_stream] completed normally");
            }
            Ok(Err(e)) => {
                eprintln!("[irc_stream] error: {}", e);
                let _ = app.emit(
                    &error_event,
                    serde_json::json!({"type": "error", "error": e.to_string()}),
                );
            }
            Err(panic_info) => {
                let msg = if let Some(s) = panic_info.downcast_ref::<String>() {
                    s.clone()
                } else if let Some(s) = panic_info.downcast_ref::<&str>() {
                    s.to_string()
                } else {
                    "thread panicked".to_string()
                };
                eprintln!("[irc_stream] panic: {}", msg);
                let _ = app.emit(
                    &error_event,
                    serde_json::json!({"type": "error", "error": format!("Internal error: {}", msg)}),
                );
            }
        }
    });

    Ok(())
}

fn do_irc_stream(
    app: &AppHandle,
    event_name: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let socket_path = resolve_socket_path();
    let mut stream = UnixStream::connect(&socket_path)?;
    // No read timeout — SSE stream is long-lived, heartbeats keep it alive
    // Timeout causes WouldBlock on Linux which kills the stream
    stream.set_read_timeout(None)?;

    let http_req = "GET /api/irc/stream HTTP/1.1\r\n\
                    Host: localhost\r\n\
                    Accept: text/event-stream\r\n\
                    Connection: keep-alive\r\n\
                    \r\n";

    stream.write_all(http_req.as_bytes())?;

    let mut reader = BufReader::new(stream);

    // Read status line
    let mut status_line = String::new();
    reader.read_line(&mut status_line)?;
    let status_code = parse_status(&status_line);
    eprintln!("[irc_stream] status: {}", status_code);

    // Read headers — detect chunked transfer encoding
    let mut is_chunked = false;
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            eprintln!("[irc_stream] EOF reading headers");
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        eprintln!("[irc_stream] header: {}", trimmed);
        let lower = line.to_lowercase();
        if lower.contains("transfer-encoding") && lower.contains("chunked") {
            is_chunked = true;
        }
    }
    eprintln!("[irc_stream] chunked={}", is_chunked);

    if status_code >= 400 {
        return Err(format!("daemon returned {}", status_code).into());
    }

    // Cowboy always uses chunked encoding for stream_reply on HTTP/1.1
    if !is_chunked {
        eprintln!("[irc_stream] WARNING: chunked not detected, forcing chunked mode");
    }

    // Always use chunked reader — Cowboy stream_reply is always chunked
    read_sse_chunked(app, event_name, &mut reader)
}

fn read_sse_chunked(
    app: &AppHandle,
    event_name: &str,
    reader: &mut BufReader<UnixStream>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut leftover = String::new();

    loop {
        // Read chunk size line (hex)
        let mut size_line = String::new();
        let bytes_read = reader.read_line(&mut size_line)?;
        if bytes_read == 0 {
            eprintln!("[irc_stream] EOF reading chunk size");
            break;
        }

        let trimmed = size_line.trim();
        let size = match usize::from_str_radix(trimmed, 16) {
            Ok(s) => s,
            Err(_) => {
                eprintln!("[irc_stream] skip non-hex line: {:?}", trimmed);
                continue;
            }
        };

        if size == 0 {
            eprintln!("[irc_stream] terminal chunk (0)");
            break;
        }

        eprintln!("[irc_stream] chunk: {} bytes", size);

        // Read exactly `size` bytes of chunk data
        let mut chunk_buf = vec![0u8; size];
        reader.read_exact(&mut chunk_buf)?;

        // Read trailing CRLF after chunk data
        let mut _trail = String::new();
        let _ = reader.read_line(&mut _trail);

        // Decode chunk as UTF-8 and process SSE lines
        let chunk_str = String::from_utf8_lossy(&chunk_buf);
        leftover.push_str(&chunk_str);

        // Process complete lines from the buffer
        while let Some(newline_pos) = leftover.find('\n') {
            let line = leftover[..newline_pos].trim().to_string();
            leftover = leftover[newline_pos + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            process_sse_line(app, event_name, &line);
        }
    }

    Ok(())
}

fn process_sse_line(app: &AppHandle, event_name: &str, line: &str) {
    let json_str = line.strip_prefix("data: ").unwrap_or(line);

    if json_str == "[DONE]" {
        return;
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(json_str) {
        eprintln!("[irc_stream] event: {}", &json_str[..json_str.len().min(120)]);
        let _ = app.emit(event_name, value);
    }
}

fn parse_status(status_line: &str) -> u16 {
    status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(500)
}
