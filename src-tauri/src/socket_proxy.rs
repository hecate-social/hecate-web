use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::net::UnixStream;
use std::path::Path;
use tauri::http::{Request, Response};

/// Resolve the daemon socket path.
/// Priority: HECATE_SOCKET_PATH env > /run/hecate/ > $HOME/.hecate/
pub fn resolve_socket_path() -> String {
    if let Ok(p) = std::env::var("HECATE_SOCKET_PATH") {
        if !p.is_empty() && Path::new(&p).exists() {
            return p;
        }
    }
    let system = "/run/hecate/daemon.sock";
    if Path::new(system).exists() {
        return system.to_string();
    }
    // Local dev default: $HOME/.hecate/ (multi-user safe, no root needed)
    if let Ok(home) = std::env::var("HOME") {
        let home_socket = Path::new(&home).join(".hecate").join("daemon.sock");
        if home_socket.exists() {
            return home_socket.to_string_lossy().to_string();
        }
        // Even if socket doesn't exist yet, prefer this path for connection attempts
        return home_socket.to_string_lossy().to_string();
    }
    "/run/hecate/daemon.sock".to_string()
}

pub fn proxy_request(
    request: &Request<Vec<u8>>,
) -> Result<Response<Vec<u8>>, Box<dyn std::error::Error>> {
    let uri = request.uri();
    let path = uri.path();
    let query = uri.query().unwrap_or("");
    let method = request.method().as_str();

    let socket_path = resolve_socket_path();
    let mut stream = UnixStream::connect(&socket_path)?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(30)))?;

    // Build the request path
    let full_path = if query.is_empty() {
        path.to_string()
    } else {
        format!("{}?{}", path, query)
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
