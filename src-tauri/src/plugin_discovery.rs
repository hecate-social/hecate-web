use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct PluginInfo {
    pub name: String,
    pub socket_exists: bool,
}

/// Scan ~/.hecate/ for plugin daemon directories (hecate-*d/).
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

        // Match hecate-*d/ directories (but not hecate-daemon itself)
        if !name_str.starts_with("hecate-") || !name_str.ends_with('d') {
            continue;
        }
        if name_str == "hecate-daemon" || name_str == "hecate-daemnd" {
            continue;
        }
        if !entry.path().is_dir() {
            continue;
        }

        // Extract plugin name: hecate-traderd -> trader
        let plugin_name = name_str
            .strip_prefix("hecate-")
            .and_then(|s| s.strip_suffix('d'))
            .unwrap_or("")
            .to_string();

        if plugin_name.is_empty() {
            continue;
        }

        let socket_path = entry.path().join("sockets").join("api.sock");
        let socket_exists = socket_path.exists();

        plugins.push(PluginInfo {
            name: plugin_name,
            socket_exists,
        });
    }

    plugins
}
