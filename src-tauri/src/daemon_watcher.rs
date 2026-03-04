use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

use crate::socket_proxy;

const POLL_INTERVAL: Duration = Duration::from_secs(5);

/// Cached health state. Updated by the poller thread every 5s.
/// Read by the `get_cached_health` Tauri command — no socket I/O, just reads memory.
static HEALTH_CACHE: Mutex<Option<serde_json::Value>> = Mutex::new(None);

/// Tauri command: read cached daemon health from memory.
/// The poller thread keeps this up-to-date every 5s.
/// This never touches the Unix socket — it just reads what the poller last saw.
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
    let _ = app.emit("daemon-health", &health);
}

fn try_health_check() -> Option<serde_json::Value> {
    socket_proxy::check_daemon_health().ok()
}

fn socket_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
            .join(".hecate")
            .join("hecate-daemon")
            .join("sockets")
            .join("api.sock")
    } else {
        PathBuf::from("/run/hecate/api.sock")
    }
}

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let sock = socket_path();

        loop {
            let health = if sock.exists() {
                try_health_check()
            } else {
                None
            };
            emit_health(&app, health);
            std::thread::sleep(POLL_INTERVAL);
        }
    });
}
