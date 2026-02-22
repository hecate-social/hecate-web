use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::net::UnixStream;
use tauri::{AppHandle, Emitter};

use crate::socket_proxy::{resolve_socket_path, resolve_plugin_socket_path};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamChunk {
    pub content: String,
    pub done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_use: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Usage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
}

#[tauri::command]
pub async fn chat_stream(
    app: AppHandle,
    stream_id: String,
    model: String,
    messages: Vec<ChatMessage>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    tools: Option<serde_json::Value>,
    plugin: Option<String>,
) -> Result<(), String> {
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });

    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }
    if let Some(max) = max_tokens {
        body["max_tokens"] = serde_json::json!(max);
    }
    if let Some(t) = tools {
        body["tools"] = t;
    }

    let body_bytes = serde_json::to_vec(&body).map_err(|e| e.to_string())?;

    let chunk_event = format!("chat-chunk-{}", stream_id);
    let done_event = format!("chat-done-{}", stream_id);
    let error_event = format!("chat-error-{}", stream_id);

    eprintln!("[stream] starting stream_id={} model={}", stream_id, model);

    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            do_stream(&app, &chunk_event, &done_event, &body_bytes, plugin.as_deref())
        }));

        match result {
            Ok(Ok(())) => {
                eprintln!("[stream] completed normally");
            }
            Ok(Err(e)) => {
                eprintln!("[stream] error: {}", e);
                let _ = app.emit(
                    &error_event,
                    StreamChunk {
                        content: String::new(),
                        done: true,
                        model: None,
                        usage: None,
                        tool_use: None,
                        error: Some(e.to_string()),
                    },
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
                eprintln!("[stream] panic: {}", msg);
                let _ = app.emit(
                    &error_event,
                    StreamChunk {
                        content: String::new(),
                        done: true,
                        model: None,
                        usage: None,
                        tool_use: None,
                        error: Some(format!("Internal error: {}", msg)),
                    },
                );
            }
        }
    });

    Ok(())
}

fn do_stream(
    app: &AppHandle,
    chunk_event: &str,
    done_event: &str,
    body: &[u8],
    plugin: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    let socket_path = match plugin {
        Some(name) => resolve_plugin_socket_path(name),
        None => resolve_socket_path(),
    };
    let mut stream = UnixStream::connect(&socket_path)?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(120)))?;

    let http_req = format!(
        "POST /api/llm/chat HTTP/1.1\r\n\
         Host: localhost\r\n\
         Content-Type: application/json\r\n\
         Accept: text/event-stream\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n",
        body.len()
    );

    stream.write_all(http_req.as_bytes())?;
    stream.write_all(body)?;

    let mut reader = BufReader::new(stream);

    // Read status line
    let mut status_line = String::new();
    reader.read_line(&mut status_line)?;
    let status_code = parse_status(&status_line);
    eprintln!("[stream] status: {}", status_code);

    // Read headers — detect chunked transfer encoding
    let mut is_chunked = false;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line)?;
        if line.trim().is_empty() {
            break;
        }
        let lower = line.to_lowercase();
        if lower.starts_with("transfer-encoding:") && lower.contains("chunked") {
            is_chunked = true;
        }
    }
    eprintln!("[stream] chunked={}", is_chunked);

    // Handle error status
    if status_code >= 400 {
        let error_body = if is_chunked {
            read_all_chunked(&mut reader)?
        } else {
            let mut buf = String::new();
            let _ = reader.read_to_string(&mut buf);
            buf
        };
        return Err(format!("daemon returned {}: {}", status_code, error_body).into());
    }

    // Read SSE stream — decode chunked encoding if needed
    if is_chunked {
        read_sse_chunked(app, chunk_event, done_event, &mut reader)?;
    } else {
        read_sse_plain(app, chunk_event, done_event, &mut reader)?;
    }

    Ok(())
}

/// Read SSE from a chunked transfer-encoded stream.
fn read_sse_chunked(
    app: &AppHandle,
    chunk_event: &str,
    done_event: &str,
    reader: &mut BufReader<UnixStream>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut leftover = String::new();
    let mut chunk_count = 0u32;

    loop {
        // Read chunk size line (hex)
        let mut size_line = String::new();
        let bytes_read = reader.read_line(&mut size_line)?;
        if bytes_read == 0 {
            eprintln!("[stream] EOF reading chunk size");
            let _ = app.emit(
                done_event,
                StreamChunk {
                    content: String::new(),
                    done: true,
                    model: None,
                    usage: None,
                    tool_use: None,
                    error: None,
                },
            );
            break;
        }

        let size = match usize::from_str_radix(size_line.trim(), 16) {
            Ok(s) => s,
            Err(_) => {
                eprintln!("[stream] malformed chunk size: {:?}", size_line.trim());
                continue;
            }
        };

        if size == 0 {
            eprintln!("[stream] terminal chunk (0), done after {} chunks", chunk_count);
            // Terminal chunk — stream is done
            let mut _trail = String::new();
            let _ = reader.read_line(&mut _trail);

            let _ = app.emit(
                done_event,
                StreamChunk {
                    content: String::new(),
                    done: true,
                    model: None,
                    usage: None,
                    tool_use: None,
                    error: None,
                },
            );
            break;
        }

        chunk_count += 1;

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

            if line.is_empty() {
                continue;
            }

            eprintln!("[stream] SSE line: {}", &line[..line.len().min(80)]);

            if process_sse_line(app, chunk_event, done_event, &line)? {
                return Ok(()); // done or error — stop
            }
        }
    }

    Ok(())
}

/// Read SSE from a plain (non-chunked) stream.
fn read_sse_plain(
    app: &AppHandle,
    chunk_event: &str,
    done_event: &str,
    reader: &mut BufReader<UnixStream>,
) -> Result<(), Box<dyn std::error::Error>> {
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Err(e) => return Err(e.into()),
            Ok(_) => {}
        }

        let trimmed = line.trim().to_string();
        if trimmed.is_empty() {
            continue;
        }

        if process_sse_line(app, chunk_event, done_event, &trimmed)? {
            break;
        }
    }
    Ok(())
}

/// Process a single SSE line. Returns true if the stream should stop.
fn process_sse_line(
    app: &AppHandle,
    chunk_event: &str,
    done_event: &str,
    line: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    // Skip SSE comments
    if line.starts_with(':') {
        return Ok(false);
    }

    // Handle [DONE]
    if line == "data: [DONE]" || line == "[DONE]" {
        eprintln!("[stream] received [DONE]");
        let _ = app.emit(
            done_event,
            StreamChunk {
                content: String::new(),
                done: true,
                model: None,
                usage: None,
                tool_use: None,
                error: None,
            },
        );
        return Ok(true);
    }

    // Strip "data: " prefix
    let json_str = line.strip_prefix("data: ").unwrap_or(line);

    // Parse JSON
    let chunk: serde_json::Value = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(_) => return Ok(false), // skip non-JSON lines
    };

    // Check for error
    if let Some(error) = chunk.get("error").and_then(|e| e.as_str()) {
        let _ = app.emit(
            done_event,
            StreamChunk {
                content: String::new(),
                done: true,
                model: None,
                usage: None,
                tool_use: None,
                error: Some(error.to_string()),
            },
        );
        return Ok(true);
    }

    let content = chunk
        .get("content")
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    let done = chunk
        .get("done")
        .and_then(|d| d.as_bool())
        .unwrap_or(false);

    let model = chunk
        .get("model")
        .and_then(|m| m.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let usage = if done {
        extract_usage(&chunk)
    } else {
        None
    };

    let tool_use = chunk.get("tool_use").cloned();

    let event_name = if done { done_event } else { chunk_event };
    let emit_result = app.emit(
        event_name,
        StreamChunk {
            content,
            done,
            model,
            usage,
            tool_use,
            error: None,
        },
    );
    if let Err(e) = emit_result {
        eprintln!("[stream] emit error: {}", e);
    }

    Ok(done)
}

fn extract_usage(chunk: &serde_json::Value) -> Option<Usage> {
    let prompt_tokens = chunk
        .get("usage")
        .and_then(|u| u.get("prompt_tokens"))
        .and_then(|t| t.as_u64())
        .map(|t| t as u32)
        .or_else(|| {
            chunk
                .get("prompt_eval_count")
                .and_then(|t| t.as_u64())
                .map(|t| t as u32)
        });

    let completion_tokens = chunk
        .get("usage")
        .and_then(|u| u.get("completion_tokens"))
        .and_then(|t| t.as_u64())
        .map(|t| t as u32)
        .or_else(|| {
            chunk
                .get("eval_count")
                .and_then(|t| t.as_u64())
                .map(|t| t as u32)
        });

    if prompt_tokens.is_some() || completion_tokens.is_some() {
        Some(Usage {
            prompt_tokens,
            completion_tokens,
        })
    } else {
        None
    }
}

/// Read all content from a chunked response into a string (for error bodies).
fn read_all_chunked(
    reader: &mut BufReader<UnixStream>,
) -> Result<String, Box<dyn std::error::Error>> {
    let mut body = Vec::new();
    loop {
        let mut size_line = String::new();
        reader.read_line(&mut size_line)?;
        let size = usize::from_str_radix(size_line.trim(), 16).unwrap_or(0);
        if size == 0 {
            break;
        }
        let mut chunk = vec![0u8; size];
        reader.read_exact(&mut chunk)?;
        body.extend_from_slice(&chunk);
        let mut _trail = String::new();
        let _ = reader.read_line(&mut _trail);
    }
    Ok(String::from_utf8_lossy(&body).to_string())
}

fn parse_status(status_line: &str) -> u16 {
    status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(500)
}
