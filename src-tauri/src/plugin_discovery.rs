use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct PluginInfo {
    pub name: String,
    pub socket_exists: bool,
}

/// Extract plugin name from a daemon directory name.
/// Only supports: hecate-app-{name}d -> {name}
/// Returns None for non-plugin dirs.
fn extract_plugin_name(dir_name: &str) -> Option<String> {
    dir_name
        .strip_prefix("hecate-app-")
        .and_then(|rest| rest.strip_suffix('d'))
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// Scan ~/.hecate/ for plugin daemon directories.
/// Matches hecate-app-*d directories.
/// Returns a list of discovered plugins with their socket status.
#[tauri::command]
pub fn discover_plugins() -> Vec<PluginInfo> {
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return Vec::new(),
    };

    let hecate_dir = Path::new(&home).join(".hecate");
    let entries = match std::fs::read_dir(&hecate_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut plugins = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if !entry.path().is_dir() {
            continue;
        }

        let plugin_name = match extract_plugin_name(&name_str) {
            Some(n) => n,
            None => continue,
        };

        let socket_path = entry.path().join("sockets").join("api.sock");
        let socket_exists = socket_path.exists();

        plugins.push(PluginInfo {
            name: plugin_name,
            socket_exists,
        });
    }

    plugins
}
