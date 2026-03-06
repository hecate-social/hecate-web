use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

use crate::socket_proxy;

const POLL_INTERVAL: Duration = Duration::from_secs(5);

/// Cached health state. Updated by the poller thread every 5s.
static HEALTH_CACHE: Mutex<Option<serde_json::Value>> = Mutex::new(None);

/// Tauri command: read cached daemon health from memory.
#[tauri::command]
pub fn get_cached_health() -> Result<serde_json::Value, String> {
    match HEALTH_CACHE.lock().ok().and_then(|cache| cache.clone()) {
        Some(v) => Ok(v),
        None => Err("no_health".into()),
    }
}

fn update_cache(health: &Option<serde_json::Value>) {
    if let Ok(mut cache) = HEALTH_CACHE.lock() {
        *cache = health.clone();
    }
}

fn emit_health(app: &tauri::AppHandle, health: Option<serde_json::Value>) {
    update_cache(&health);
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
