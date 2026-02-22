use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
pub struct PluginUpdate {
    pub name: String,
    pub installed_version: String,
    pub latest_version: String,
    pub body: String,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
}

fn is_newer(remote: &str, local: &str) -> bool {
    let parse = |v: &str| -> (u32, u32, u32) {
        let parts: Vec<u32> = v.split('.').filter_map(|p| p.parse().ok()).collect();
        (
            parts.first().copied().unwrap_or(0),
            parts.get(1).copied().unwrap_or(0),
            parts.get(2).copied().unwrap_or(0),
        )
    };
    parse(remote) > parse(local)
}

fn gitops_apps_dir() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".hecate").join("gitops").join("apps"))
}

fn parse_installed_version(container_path: &PathBuf) -> Option<String> {
    let content = std::fs::read_to_string(container_path).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Image=") {
            // Image=ghcr.io/hecate-social/hecate-app-marthad:0.1.1
            if let Some(colon_pos) = trimmed.rfind(':') {
                return Some(trimmed[colon_pos + 1..].to_string());
            }
        }
    }
    None
}

/// Discover plugin names from ~/.hecate/hecate-app-*d directories.
fn discover_plugin_names() -> Result<Vec<String>, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let hecate_dir = PathBuf::from(&home).join(".hecate");
    let entries = std::fs::read_dir(&hecate_dir).map_err(|e| e.to_string())?;

    let mut plugins = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy().to_string();

        if !entry.path().is_dir() {
            continue;
        }

        if let Some(plugin_name) = name_str
            .strip_prefix("hecate-app-")
            .and_then(|rest| rest.strip_suffix('d'))
            .filter(|s| !s.is_empty())
        {
            plugins.push(plugin_name.to_string());
        }
    }

    Ok(plugins)
}

#[tauri::command]
pub async fn check_plugin_updates() -> Result<Vec<PluginUpdate>, String> {
    let apps_dir = gitops_apps_dir().ok_or("Cannot determine gitops apps directory")?;
    let plugin_names = discover_plugin_names()?;

    let client = reqwest::Client::builder()
        .user_agent("hecate-web")
        .build()
        .map_err(|e| e.to_string())?;

    let mut updates = Vec::new();

    for name in &plugin_names {
        let container_file = apps_dir.join(format!("hecate-app-{}d.container", name));

        let installed = match parse_installed_version(&container_file) {
            Some(v) => v,
            None => {
                eprintln!(
                    "[plugin-updater] No .container file or version for {}",
                    name
                );
                continue;
            }
        };

        // Query GitHub releases API
        let repo = format!("hecate-social/hecate-app-{}", name);
        let url = format!(
            "https://api.github.com/repos/{}/releases/latest",
            repo
        );

        eprintln!("[plugin-updater] checking {} (local: {})", repo, installed);

        let response = match client.get(&url).send().await {
            Ok(r) => r,
            Err(e) => {
                eprintln!(
                    "[plugin-updater] GitHub request failed for {}: {}",
                    name, e
                );
                continue;
            }
        };

        if !response.status().is_success() {
            eprintln!(
                "[plugin-updater] GitHub returned {} for {}",
                response.status(),
                name
            );
            continue;
        }

        let release: GithubRelease = match response.json().await {
            Ok(r) => r,
            Err(e) => {
                eprintln!(
                    "[plugin-updater] Failed to parse release for {}: {}",
                    name, e
                );
                continue;
            }
        };

        let remote_version = release.tag_name.trim_start_matches('v').to_string();

        if is_newer(&remote_version, &installed) {
            eprintln!(
                "[plugin-updater] Update available for {}: {} -> {}",
                name, installed, remote_version
            );
            updates.push(PluginUpdate {
                name: name.clone(),
                installed_version: installed,
                latest_version: remote_version,
                body: release.body.unwrap_or_default(),
            });
        } else {
            eprintln!(
                "[plugin-updater] {} is up to date ({})",
                name, installed
            );
        }
    }

    Ok(updates)
}

#[tauri::command]
pub async fn install_plugin_update(
    app: AppHandle,
    name: String,
    version: String,
) -> Result<(), String> {
    let apps_dir = gitops_apps_dir().ok_or("Cannot determine gitops apps directory")?;

    let container_file = apps_dir.join(format!("hecate-app-{}d.container", name));
    if !container_file.exists() {
        return Err(format!("No .container file found for plugin {}", name));
    }

    let image_prefix = format!("ghcr.io/hecate-social/hecate-app-{}d:", name);
    let service_name = format!("hecate-app-{}d", name);

    // Read current .container file
    let content =
        std::fs::read_to_string(&container_file).map_err(|e| format!("Failed to read .container file: {}", e))?;

    // Replace Image= line with new version
    let new_image = format!("Image={}{}", image_prefix, version);

    let mut found = false;
    let updated: Vec<String> = content
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("Image=") && trimmed.contains(&format!("hecate-app-{}d:", name)) {
                found = true;
                new_image.clone()
            } else {
                line.to_string()
            }
        })
        .collect();

    if !found {
        return Err(format!("No Image= line found for plugin {} in .container file", name));
    }

    let updated_content = updated.join("\n");
    // Preserve trailing newline if original had one
    let updated_content = if content.ends_with('\n') && !updated_content.ends_with('\n') {
        updated_content + "\n"
    } else {
        updated_content
    };

    std::fs::write(&container_file, &updated_content)
        .map_err(|e| format!("Failed to write .container file: {}", e))?;

    eprintln!(
        "[plugin-updater] Updated {} .container to version {}",
        name, version
    );

    // Pull new image
    let _ = app.emit("plugin-update-pulling", &name);
    eprintln!("[plugin-updater] Pulling image for {}...", name);

    let pull_image = format!("{}{}", image_prefix, version);
    let pull_image_clone = pull_image.clone();
    let pull_output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("podman")
            .args(["pull", &pull_image_clone])
            .output()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to run podman pull: {}", e))?;

    if !pull_output.status.success() {
        let stderr = String::from_utf8_lossy(&pull_output.stderr);
        return Err(format!("podman pull failed: {}", stderr));
    }

    // Restart systemd service
    let _ = app.emit("plugin-update-restarting", &name);
    eprintln!("[plugin-updater] Restarting {}...", service_name);

    let service_name_clone = service_name.clone();
    let restart_output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("systemctl")
            .args(["--user", "restart", &service_name_clone])
            .output()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to run systemctl restart: {}", e))?;

    if !restart_output.status.success() {
        let stderr = String::from_utf8_lossy(&restart_output.stderr);
        return Err(format!("systemctl restart failed: {}", stderr));
    }

    let _ = app.emit("plugin-update-done", &name);
    eprintln!("[plugin-updater] {} updated to v{} successfully", name, version);

    Ok(())
}
