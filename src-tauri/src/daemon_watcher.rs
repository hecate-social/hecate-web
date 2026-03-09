use std::path::PathBuf;
use std::time::Duration;
use tauri::Emitter;

use crate::socket_proxy;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);

fn emit_health(app: &tauri::AppHandle, health: Option<serde_json::Value>) {
    match &health {
        Some(v) => { let _ = app.emit("daemon-health", v); }
        None => { let _ = app.emit("daemon-health", serde_json::Value::Null); }
    }
}

fn try_health_check() -> Option<serde_json::Value> {
    socket_proxy::check_daemon_health().ok()
}

fn socket_path() -> PathBuf {
    PathBuf::from(socket_proxy::resolve_socket_path())
}

/// Heartbeat loop: checks daemon health via Unix socket every 5s
/// and pushes the result as a Tauri event. The frontend only listens.
pub fn start(app: tauri::AppHandle) {
    eprintln!("[daemon-watcher] starting heartbeat loop");
    std::thread::spawn(move || {
        let sock = socket_path();
        eprintln!("[daemon-watcher] socket path: {}", sock.display());

        loop {
            let exists = sock.exists();
            let health = if exists {
                try_health_check()
            } else {
                None
            };
            eprintln!("[daemon-watcher] sock_exists={} health={}", exists, health.is_some());
            emit_health(&app, health);
            std::thread::sleep(HEARTBEAT_INTERVAL);
        }
    });
}
