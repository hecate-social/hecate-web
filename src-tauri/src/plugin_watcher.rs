use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::mpsc;
use tauri::Emitter;

const SOCKET_NAME: &str = "api.sock";

#[derive(Serialize, Clone, Debug)]
pub struct PluginEvent {
    pub name: String,
    pub event_type: String,
}

fn hecate_base() -> PathBuf {
    crate::socket_proxy::hecate_home()
}

fn extract_plugin_name(dir_name: &str) -> Option<String> {
    dir_name
        .strip_prefix("hecate-app-")
        .and_then(|rest| rest.strip_suffix('d'))
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn is_plugin_dir(name: &str) -> bool {
    extract_plugin_name(name).is_some()
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
        Ok(_) => eprintln!("[plugin-watcher] emitted: {} {}", name, event_type),
        Err(e) => eprintln!("[plugin-watcher] emit FAILED: {}", e),
    }
}

/// Scan ~/.hecate/ for existing plugin directories.
fn scan_plugin_dirs(base: &PathBuf) -> Vec<(String, String)> {
    let entries = match std::fs::read_dir(base) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            extract_plugin_name(&name).map(|plugin| (plugin, name))
        })
        .collect()
}

/// Watches ~/.hecate/ for plugin socket changes.
/// Emits only socket_up / socket_down events.
/// Daemon API polling handles everything else.
pub fn start(app: tauri::AppHandle) {
    eprintln!("[plugin-watcher] starting");
    std::thread::spawn(move || {
        let base = hecate_base();
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

        // Scan existing plugins, watch their socket dirs, emit socket_up for live ones
        let mut watched_dirs: HashSet<String> = HashSet::new();

        for (plugin_name, dir_name) in &scan_plugin_dirs(&base) {
            watched_dirs.insert(dir_name.clone());
            let sock_dir = sockets_dir(&base, dir_name);
            if sock_dir.is_dir() {
                watcher.watch(sock_dir.as_path(), RecursiveMode::NonRecursive).ok();
                if sock_dir.join(SOCKET_NAME).exists() {
                    emit_plugin(&app, plugin_name, "socket_up");
                }
            }
        }

        // Main loop: react to filesystem events
        loop {
            match rx.recv() {
                Ok(event) => {
                    for path in &event.paths {
                        let Some(file_name) = path.file_name() else { continue };
                        let name_str = file_name.to_string_lossy().to_string();

                        // New plugin dir appeared — start watching its sockets/
                        if is_plugin_dir(&name_str) {
                            if let EventKind::Create(_) = event.kind {
                                if path.is_dir() && !watched_dirs.contains(&name_str) {
                                    watched_dirs.insert(name_str.clone());
                                    let sock_dir = sockets_dir(&base, &name_str);
                                    std::fs::create_dir_all(&sock_dir).ok();
                                    watcher.watch(sock_dir.as_path(), RecursiveMode::NonRecursive).ok();

                                    if sock_dir.join(SOCKET_NAME).exists() {
                                        if let Some(plugin) = extract_plugin_name(&name_str) {
                                            emit_plugin(&app, &plugin, "socket_up");
                                        }
                                    }
                                }
                            }
                            continue;
                        }

                        // Socket file event (api.sock created or removed)
                        if name_str == SOCKET_NAME {
                            if let Some(sockets_parent) = path.parent() {
                                if let Some(plugin_dir) = sockets_parent.parent() {
                                    if let Some(dir_name) = plugin_dir.file_name() {
                                        let dir_str = dir_name.to_string_lossy().to_string();
                                        if let Some(plugin_name) = extract_plugin_name(&dir_str) {
                                            match event.kind {
                                                EventKind::Create(_) | EventKind::Modify(_) => {
                                                    emit_plugin(&app, &plugin_name, "socket_up");
                                                }
                                                EventKind::Remove(_) => {
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
                Err(_) => {
                    eprintln!("[plugin-watcher] channel disconnected, exiting");
                    break;
                }
            }
        }
    });
}
