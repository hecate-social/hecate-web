use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::net::UnixStream;
use std::path::Path;
use tauri::http::{Request, Response};

/// Tauri command: check daemon health directly via Unix socket.
/// Bypasses the custom URI scheme protocol entirely.
#[tauri::command]
pub fn check_daemon_health() -> Result<serde_json::Value, String> {
    let socket_path = resolve_socket_path();
    if !Path::new(&socket_path).exists() {
        return Err("socket_not_found".into());
    }

    let mut stream = UnixStream::connect(&socket_path).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(std::time::Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;

    let req = "GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;

    let mut reader = BufReader::new(stream);

    // Status line
    let mut status_line = String::new();
    reader.read_line(&mut status_line).map_err(|e| e.to_string())?;
    let status = parse_status_code(&status_line).map_err(|e| e.to_string())?;
    if status != 200 {
        return Err(format!("daemon returned {}", status));
    }

    // Headers
    let mut content_length: Option<usize> = None;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            if key.trim().eq_ignore_ascii_case("content-length") {
                content_length = value.trim().parse().ok();
            }
        }
    }

    // Body
    let body = if let Some(len) = content_length {
        let mut buf = vec![0u8; len];
        reader.read_exact(&mut buf).map_err(|e| e.to_string())?;
        buf
    } else {
        let mut buf = Vec::new();
        let _ = reader.read_to_end(&mut buf);
        buf
    };

    serde_json::from_slice(&body).map_err(|e| e.to_string())
}

/// Resolve the daemon socket path for the main hecate-daemon.
/// Priority: HECATE_SOCKET_PATH env > /run/hecate/ > $HOME/.hecate/hecate-daemon/sockets/
pub fn resolve_socket_path() -> String {
    if let Ok(p) = std::env::var("HECATE_SOCKET_PATH") {
        if !p.is_empty() && Path::new(&p).exists() {
            return p;
        }
    }
    let system = "/run/hecate/api.sock";
    if Path::new(system).exists() {
        return system.to_string();
    }
    // Local dev default: $HOME/.hecate/hecate-daemon/sockets/ (namespaced)
    if let Ok(home) = std::env::var("HOME") {
        let home_socket = Path::new(&home).join(".hecate").join("hecate-daemon").join("sockets").join("api.sock");
        if home_socket.exists() {
            return home_socket.to_string_lossy().to_string();
        }
        // Even if socket doesn't exist yet, prefer this path for connection attempts
        return home_socket.to_string_lossy().to_string();
    }
    "/run/hecate/api.sock".to_string()
}

/// Resolve socket path for a plugin daemon by name.
/// Tries new convention first: $HOME/.hecate/hecate-app-{name}d/sockets/api.sock
/// Falls back to legacy: $HOME/.hecate/hecate-{name}d/sockets/api.sock
fn resolve_plugin_socket_path(plugin_name: &str) -> String {
    if let Ok(home) = std::env::var("HOME") {
        let base = Path::new(&home).join(".hecate");

        // New convention: hecate-app-{name}d
        let new_path = base
            .join(format!("hecate-app-{}d", plugin_name))
            .join("sockets")
            .join("api.sock");
        if new_path.exists() {
            return new_path.to_string_lossy().to_string();
        }

        // Legacy convention: hecate-{name}d
        let legacy_path = base
            .join(format!("hecate-{}d", plugin_name))
            .join("sockets")
            .join("api.sock");
        // Return legacy if it exists, otherwise return new convention path
        // (new convention is the preferred default for new installs)
        if legacy_path.exists() {
            return legacy_path.to_string_lossy().to_string();
        }

        // Neither exists yet — prefer new convention
        return new_path.to_string_lossy().to_string();
    }
    format!("/run/hecate-app-{}d/api.sock", plugin_name)
}

/// Route a request path to the correct socket.
/// /plugin/trader/* -> hecate-traderd socket (path rewritten to /*)
/// Everything else  -> hecate-daemon socket (path unchanged)
fn resolve_socket_for_path(path: &str) -> (String, String) {
    if let Some(rest) = path.strip_prefix("/plugin/") {
        if let Some(slash_pos) = rest.find('/') {
            let plugin_name = &rest[..slash_pos];
            let rewritten_path = &rest[slash_pos..];
            return (resolve_plugin_socket_path(plugin_name), rewritten_path.to_string());
        }
        // /plugin/trader with no trailing path -> /
        let plugin_name = rest;
        return (resolve_plugin_socket_path(plugin_name), "/".to_string());
    }
    (resolve_socket_path(), path.to_string())
}

pub fn proxy_request(
    request: &Request<Vec<u8>>,
) -> Result<Response<Vec<u8>>, Box<dyn std::error::Error>> {
    let uri = request.uri();
    let path = uri.path();
    let query = uri.query().unwrap_or("");
    let method = request.method().as_str();

    let (socket_path, rewritten_path) = resolve_socket_for_path(path);
    let mut stream = UnixStream::connect(&socket_path)?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(30)))?;

    // Build the request path (using rewritten path for plugin routing)
    let full_path = if query.is_empty() {
        rewritten_path
    } else {
        format!("{}?{}", rewritten_path, query)
    };

    let body = request.body();

    // Build HTTP/1.1 request
    let mut http_req = format!(
        "{} {} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n",
        method, full_path
    );

    if !body.is_empty() {
        http_req += &format!(
            "Content-Type: application/json\r\nContent-Length: {}\r\n",
            body.len()
        );
    }

    // Forward Accept header if present
    if let Some(accept) = request.headers().get("accept") {
        if let Ok(v) = accept.to_str() {
            http_req += &format!("Accept: {}\r\n", v);
        }
    }

    http_req += "\r\n";

    stream.write_all(http_req.as_bytes())?;
    if !body.is_empty() {
        stream.write_all(body)?;
    }

    // Parse HTTP response
    let mut reader = BufReader::new(stream);

    // Read status line
    let mut status_line = String::new();
    reader.read_line(&mut status_line)?;
    let status_code = parse_status_code(&status_line)?;

    // Read headers
    let mut content_type = String::from("application/json");
    let mut content_length: Option<usize> = None;
    let mut is_chunked = false;

    loop {
        let mut line = String::new();
        reader.read_line(&mut line)?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some((key, value)) = trimmed.split_once(':') {
            let key_lower = key.trim().to_lowercase();
            let value_trimmed = value.trim();
            match key_lower.as_str() {
                "content-type" => content_type = value_trimmed.to_string(),
                "content-length" => content_length = value_trimmed.parse().ok(),
                "transfer-encoding" => is_chunked = value_trimmed.to_lowercase().contains("chunked"),
                _ => {}
            }
        }
    }

    // Read body
    let response_body = if let Some(len) = content_length {
        let mut buf = vec![0u8; len];
        reader.read_exact(&mut buf)?;
        buf
    } else if is_chunked {
        read_chunked_body(&mut reader)?
    } else {
        // Read until EOF
        let mut buf = Vec::new();
        let _ = reader.read_to_end(&mut buf);
        buf
    };

    Ok(Response::builder()
        .status(status_code)
        .header("Content-Type", &content_type)
        .header("Access-Control-Allow-Origin", "*")
        .body(response_body)?)
}

fn parse_status_code(status_line: &str) -> Result<u16, Box<dyn std::error::Error>> {
    // "HTTP/1.1 200 OK\r\n"
    let parts: Vec<&str> = status_line.split_whitespace().collect();
    if parts.len() < 2 {
        return Err(format!("invalid status line: {}", status_line).into());
    }
    Ok(parts[1].parse()?)
}

fn read_chunked_body(reader: &mut BufReader<UnixStream>) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut body = Vec::new();
    loop {
        let mut size_line = String::new();
        reader.read_line(&mut size_line)?;
        let size = usize::from_str_radix(size_line.trim(), 16)?;
        if size == 0 {
            // Read trailing \r\n
            let mut _trail = String::new();
            let _ = reader.read_line(&mut _trail);
            break;
        }
        let mut chunk = vec![0u8; size];
        reader.read_exact(&mut chunk)?;
        body.extend_from_slice(&chunk);
        // Read trailing \r\n after chunk
        let mut _trail = String::new();
        reader.read_line(&mut _trail)?;
    }
    Ok(body)
}
