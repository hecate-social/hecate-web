use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::Emitter;

const CONFIG_FILE: &str = "sidebar.yaml";
const DEBOUNCE: Duration = Duration::from_millis(500);
const RECHECK_INTERVAL: Duration = Duration::from_secs(60);

fn config_dir() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".hecate").join("config")
    } else {
        PathBuf::from("/run/hecate/config")
    }
}

pub fn start(app: tauri::AppHandle) {
    eprintln!("[config-watcher] starting config watcher");
    std::thread::spawn(move || {
        let dir = config_dir();
        eprintln!("[config-watcher] watching dir: {}", dir.display());

        std::fs::create_dir_all(&dir).ok();

        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |res: Result<Event, _>| {
            if let Ok(event) = res {
                tx.send(event).ok();
            }
        }) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[config-watcher] failed to create watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(dir.as_path(), RecursiveMode::NonRecursive) {
            eprintln!("[config-watcher] failed to watch {}: {}", dir.display(), e);
            return;
        }
        eprintln!("[config-watcher] inotify watching {}", dir.display());

        let mut last_emit = Instant::now() - DEBOUNCE;

        loop {
            match rx.recv_timeout(RECHECK_INTERVAL) {
                Ok(event) => {
                    let dominated = event
                        .paths
                        .iter()
                        .any(|p| p.file_name().map(|n| n == CONFIG_FILE).unwrap_or(false));

                    if !dominated {
                        continue;
                    }

                    match event.kind {
                        EventKind::Create(_) | EventKind::Modify(_) => {
                            let now = Instant::now();
                            if now.duration_since(last_emit) < DEBOUNCE {
                                continue;
                            }
                            last_emit = now;
                            eprintln!("[config-watcher] sidebar.yaml changed, emitting event");
                            match app.emit("sidebar-config-changed", ()) {
                                Ok(_) => eprintln!("[config-watcher] emitted sidebar-config-changed"),
                                Err(e) => eprintln!("[config-watcher] emit FAILED: {}", e),
                            }
                        }
                        _ => {}
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // No periodic action needed — just keeps the thread alive
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    eprintln!("[config-watcher] channel disconnected, exiting");
                    break;
                }
            }
        }
    });
}
