use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;
use tauri::Emitter;

use crate::socket_proxy;

const SOCKET_NAME: &str = "api.sock";
const RECHECK_INTERVAL: Duration = Duration::from_secs(5);
const STARTUP_RETRY_DELAY: Duration = Duration::from_millis(500);
const STARTUP_RETRIES: u32 = 10;

fn emit_health(app: &tauri::AppHandle, health: Option<serde_json::Value>) {
    match app.emit("daemon-health", &health) {
        Ok(_) => {
            let label = if health.is_some() { "connected" } else { "unavailable" };
            eprintln!("[watcher] emitted daemon-health: {}", label);
        }
        Err(e) => eprintln!("[watcher] emit FAILED: {}", e),
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
                    eprintln!("[watcher] periodic recheck (socket exists: {})", sock.exists());
                    if sock.exists() {
                        match try_health_check() {
                            Some(h) => emit_health(&app, Some(h)),
                            None => emit_health(&app, None),
                        }
                    } else {
                        emit_health(&app, None);
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    eprintln!("[watcher] channel disconnected, exiting");
                    break;
                }
            }
        }
    });
}
