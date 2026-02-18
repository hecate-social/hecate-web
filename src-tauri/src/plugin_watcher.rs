use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;
use tauri::Emitter;

const SOCKET_NAME: &str = "api.sock";
const RECHECK_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Serialize, Clone, Debug)]
pub struct PluginEvent {
    pub name: String,
    pub event_type: String,
}

fn hecate_base() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".hecate")
    } else {
        PathBuf::from("/run/hecate")
    }
}

fn is_plugin_dir(name: &str) -> bool {
    name.starts_with("hecate-")
        && name.ends_with('d')
        && name != "hecate-daemon"
        && name != "hecate-daemnd"
}

fn extract_plugin_name(dir_name: &str) -> Option<String> {
    dir_name
        .strip_prefix("hecate-")
        .and_then(|s| s.strip_suffix('d'))
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn sockets_dir(base: &PathBuf, dir_name: &str) -> PathBuf {
    base.join(dir_name).join("sockets")
}

fn emit_plugin(app: &tauri::AppHandle, name: &str, event_type: &str) {
    let payload = PluginEvent {
        name: name.to_string(),
        event_type: event_type.to_string(),
    };
    match app.emit("plugin-changed", &payload) {
        Ok(_) => eprintln!("[plugin-watcher] emitted plugin-changed: {} {}", name, event_type),
        Err(e) => eprintln!("[plugin-watcher] emit FAILED: {}", e),
    }
}

fn scan_existing_plugins(base: &PathBuf) -> Vec<(String, String)> {
    let entries = match std::fs::read_dir(base) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut results = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy().to_string();

        if !is_plugin_dir(&name_str) || !entry.path().is_dir() {
            continue;
        }

        if let Some(plugin_name) = extract_plugin_name(&name_str) {
            results.push((plugin_name, name_str));
        }
    }

    results
}

pub fn start(app: tauri::AppHandle) {
    eprintln!("[plugin-watcher] starting plugin watcher");
    std::thread::spawn(move || {
        let base = hecate_base();
        eprintln!("[plugin-watcher] watching base: {}", base.display());

        std::fs::create_dir_all(&base).ok();

        let (tx, rx) = mpsc::channel();

        let tx_clone = tx.clone();
        let mut watcher = match notify::recommended_watcher(move |res: Result<Event, _>| {
            if let Ok(event) = res {
                tx_clone.send(event).ok();
            }
        }) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[plugin-watcher] failed to create watcher: {}", e);
                return;
            }
        };

        // Watch ~/.hecate/ for new plugin dirs
        if let Err(e) = watcher.watch(base.as_path(), RecursiveMode::NonRecursive) {
            eprintln!("[plugin-watcher] failed to watch {}: {}", base.display(), e);
            return;
        }
        eprintln!("[plugin-watcher] inotify watching {}", base.display());

        // Scan existing plugins, emit initial state, set up socket watches
        let mut watched: HashSet<String> = HashSet::new();

        let existing = scan_existing_plugins(&base);
        for (plugin_name, dir_name) in &existing {
            emit_plugin(&app, plugin_name, "appeared");
            watched.insert(dir_name.clone());

            let sock_dir = sockets_dir(&base, dir_name);
            if sock_dir.is_dir() {
                if let Err(e) = watcher.watch(sock_dir.as_path(), RecursiveMode::NonRecursive) {
                    eprintln!("[plugin-watcher] failed to watch {}: {}", sock_dir.display(), e);
                } else {
                    eprintln!("[plugin-watcher] watching sockets dir: {}", sock_dir.display());
                }

                if sock_dir.join(SOCKET_NAME).exists() {
                    emit_plugin(&app, plugin_name, "socket_up");
                }
            }
        }

        // Emit rescan so frontend does a full initial load
        app.emit("plugin-changed", &PluginEvent {
            name: String::new(),
            event_type: "rescan".to_string(),
        }).ok();

        loop {
            match rx.recv_timeout(RECHECK_INTERVAL) {
                Ok(event) => {
                    for path in &event.paths {
                        // Check if this is a plugin dir event under ~/.hecate/
                        if let Some(file_name) = path.file_name() {
                            let name_str = file_name.to_string_lossy().to_string();

                            // Event on a plugin dir itself (hecate-*d)
                            if is_plugin_dir(&name_str) {
                                if let Some(plugin_name) = extract_plugin_name(&name_str) {
                                    match event.kind {
                                        EventKind::Create(_) => {
                                            if path.is_dir() && !watched.contains(&name_str) {
                                                eprintln!("[plugin-watcher] new plugin dir: {}", name_str);
                                                emit_plugin(&app, &plugin_name, "appeared");
                                                watched.insert(name_str.clone());

                                                let sock_dir = sockets_dir(&base, &name_str);
                                                std::fs::create_dir_all(&sock_dir).ok();
                                                if let Err(e) = watcher.watch(sock_dir.as_path(), RecursiveMode::NonRecursive) {
                                                    eprintln!("[plugin-watcher] failed to watch {}: {}", sock_dir.display(), e);
                                                } else {
                                                    eprintln!("[plugin-watcher] watching sockets dir: {}", sock_dir.display());
                                                }

                                                if sock_dir.join(SOCKET_NAME).exists() {
                                                    emit_plugin(&app, &plugin_name, "socket_up");
                                                }
                                            }
                                        }
                                        EventKind::Remove(_) => {
                                            if watched.contains(&name_str) {
                                                eprintln!("[plugin-watcher] plugin dir removed: {}", name_str);
                                                emit_plugin(&app, &plugin_name, "disappeared");
                                                watched.remove(&name_str);

                                                let sock_dir = sockets_dir(&base, &name_str);
                                                watcher.unwatch(sock_dir.as_path()).ok();
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                                continue;
                            }

                            // Event on api.sock inside a sockets/ dir
                            if name_str == SOCKET_NAME {
                                if let Some(sockets_parent) = path.parent() {
                                    if let Some(plugin_dir) = sockets_parent.parent() {
                                        if let Some(dir_name) = plugin_dir.file_name() {
                                            let dir_str = dir_name.to_string_lossy().to_string();
                                            if let Some(plugin_name) = extract_plugin_name(&dir_str) {
                                                match event.kind {
                                                    EventKind::Create(_) | EventKind::Modify(_) => {
                                                        eprintln!("[plugin-watcher] socket up: {}", plugin_name);
                                                        emit_plugin(&app, &plugin_name, "socket_up");
                                                    }
                                                    EventKind::Remove(_) => {
                                                        eprintln!("[plugin-watcher] socket down: {}", plugin_name);
                                                        emit_plugin(&app, &plugin_name, "socket_down");
                                                    }
                                                    _ => {}
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    eprintln!("[plugin-watcher] periodic rescan");

                    // Re-check for new/removed plugin dirs
                    let current = scan_existing_plugins(&base);
                    let current_dirs: HashSet<String> = current.iter().map(|(_, d)| d.clone()).collect();

                    // New plugins
                    for (plugin_name, dir_name) in &current {
                        if !watched.contains(dir_name) {
                            eprintln!("[plugin-watcher] rescan found new plugin: {}", plugin_name);
                            emit_plugin(&app, plugin_name, "appeared");
                            watched.insert(dir_name.clone());

                            let sock_dir = sockets_dir(&base, dir_name);
                            if sock_dir.is_dir() {
                                watcher.watch(sock_dir.as_path(), RecursiveMode::NonRecursive).ok();
                            }

                            if sock_dir.join(SOCKET_NAME).exists() {
                                emit_plugin(&app, plugin_name, "socket_up");
                            }
                        }
                    }

                    // Removed plugins
                    let removed: Vec<String> = watched.iter()
                        .filter(|d| !current_dirs.contains(*d))
                        .cloned()
                        .collect();
                    for dir_name in removed {
                        if let Some(plugin_name) = extract_plugin_name(&dir_name) {
                            eprintln!("[plugin-watcher] rescan: plugin gone: {}", plugin_name);
                            emit_plugin(&app, &plugin_name, "disappeared");
                        }
                        watched.remove(&dir_name);
                    }

                    // Emit rescan for frontend full refresh
                    app.emit("plugin-changed", &PluginEvent {
                        name: String::new(),
                        event_type: "rescan".to_string(),
                    }).ok();
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    eprintln!("[plugin-watcher] channel disconnected, exiting");
                    break;
                }
            }
        }
    });
}
