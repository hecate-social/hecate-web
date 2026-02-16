use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::net::UnixStream;
use tauri::{AppHandle, Emitter};

use crate::socket_proxy::resolve_socket_path;

#[tauri::command]
pub async fn snake_duel_stream(
    app: AppHandle,
    stream_id: String,
    match_id: String,
) -> Result<(), String> {
    let state_event = format!("snake-duel-state-{}", stream_id);
    let done_event = format!("snake-duel-done-{}", stream_id);
    let error_event = format!("snake-duel-error-{}", stream_id);

    eprintln!(
        "[snake_duel_stream] starting stream_id={} match_id={}",
        stream_id, match_id
    );

    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            do_snake_duel_stream(&app, &state_event, &match_id)
        }));

        match result {
            Ok(Ok(())) => {
                eprintln!("[snake_duel_stream] completed normally");
                let _ = app.emit(&done_event, serde_json::json!({"type": "done"}));
            }
            Ok(Err(e)) => {
                eprintln!("[snake_duel_stream] error: {}", e);
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
                eprintln!("[snake_duel_stream] panic: {}", msg);
                let _ = app.emit(
                    &error_event,
                    serde_json::json!({"type": "error", "error": format!("Internal error: {}", msg)}),
                );
            }
        }
    });

    Ok(())
}

fn do_snake_duel_stream(
    app: &AppHandle,
    state_event: &str,
    match_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let socket_path = resolve_socket_path();
    let mut stream = UnixStream::connect(&socket_path)?;
    // No read timeout — SSE stream is long-lived, heartbeats keep it alive
    stream.set_read_timeout(None)?;

    let http_req = format!(
        "GET /api/arcade/snake-duel/matches/{}/stream HTTP/1.1\r\n\
         Host: localhost\r\n\
         Accept: text/event-stream\r\n\
         Connection: keep-alive\r\n\
         \r\n",
        match_id
    );

    stream.write_all(http_req.as_bytes())?;

    let mut reader = BufReader::new(stream);

    // Read status line
    let mut status_line = String::new();
    reader.read_line(&mut status_line)?;
    let status_code = parse_status(&status_line);
    eprintln!("[snake_duel_stream] status: {}", status_code);

    // Read headers — detect chunked transfer encoding
    let mut is_chunked = false;
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        let lower = line.to_lowercase();
        if lower.contains("transfer-encoding") && lower.contains("chunked") {
            is_chunked = true;
        }
    }

    if status_code >= 400 {
        return Err(format!("daemon returned {}", status_code).into());
    }

    if !is_chunked {
        eprintln!("[snake_duel_stream] WARNING: chunked not detected, forcing chunked mode");
    }

    // Cowboy stream_reply is always chunked
    read_sse_chunked(app, state_event, &mut reader)
}

fn read_sse_chunked(
    app: &AppHandle,
    state_event: &str,
    reader: &mut BufReader<UnixStream>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut leftover = String::new();

    loop {
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
            break;
        }

        let mut chunk_buf = vec![0u8; size];
        reader.read_exact(&mut chunk_buf)?;

        // Read trailing CRLF after chunk data
        let mut _trail = String::new();
        let _ = reader.read_line(&mut _trail);

        let chunk_str = String::from_utf8_lossy(&chunk_buf);
        leftover.push_str(&chunk_str);

        while let Some(newline_pos) = leftover.find('\n') {
            let line = leftover[..newline_pos].trim().to_string();
            leftover = leftover[newline_pos + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            process_sse_line(app, state_event, &line);
        }
    }

    Ok(())
}

fn process_sse_line(app: &AppHandle, state_event: &str, line: &str) {
    let json_str = line.strip_prefix("data: ").unwrap_or(line);

    if json_str == "[DONE]" {
        return;
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(json_str) {
        let _ = app.emit(state_event, value);
    }
}

fn parse_status(status_line: &str) -> u16 {
    status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(500)
}
