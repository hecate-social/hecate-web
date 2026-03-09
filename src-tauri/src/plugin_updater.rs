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

/// Parsed OCI image reference from a .container file.
struct ContainerImage {
    /// Full image without tag, e.g. "ghcr.io/hecate-apps/hecate-app-scribed"
    image_base: String,
    /// GitHub org, e.g. "hecate-apps"
    github_org: String,
    /// GitHub repo name, e.g. "hecate-app-scribe" (without trailing 'd')
    github_repo: String,
    /// Installed version tag, e.g. "0.1.0"
    version: String,
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
    Some(crate::socket_proxy::hecate_home().join("gitops").join("apps"))
}

/// Parse the Image= line from a .container file.
/// Extracts org, repo name, and version from OCI image references like:
///   ghcr.io/hecate-apps/hecate-app-scribed:0.1.0
///   ghcr.io/hecate-social/hecate-app-marthad:0.1.1
fn parse_container_image(container_path: &PathBuf) -> Option<ContainerImage> {
    let content = std::fs::read_to_string(container_path).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("Image=") {
            continue;
        }
        // Image=ghcr.io/hecate-apps/hecate-app-scribed:0.1.0
        let image_ref = trimmed.strip_prefix("Image=")?;
        let colon_pos = image_ref.rfind(':')?;
        let image_base = &image_ref[..colon_pos];
        let version = &image_ref[colon_pos + 1..];

        // Parse: ghcr.io/{org}/{image_name}
        let parts: Vec<&str> = image_base.split('/').collect();
        if parts.len() < 3 {
            continue;
        }
        let org = parts[1];
        let image_name = parts[2]; // e.g. "hecate-app-scribed"

        // Derive GitHub repo: strip trailing 'd' from daemon image name
        // hecate-app-scribed -> hecate-app-scribe
        let github_repo = image_name.strip_suffix('d')
            .unwrap_or(image_name)
            .to_string();

        return Some(ContainerImage {
            image_base: image_base.to_string(),
            github_org: org.to_string(),
            github_repo,
            version: version.to_string(),
        });
    }
    None
}

/// Discover plugin names from hecate-app-*d directories.
fn discover_plugin_names() -> Result<Vec<String>, String> {
    let hecate_dir = crate::socket_proxy::hecate_home();
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

        let image = match parse_container_image(&container_file) {
            Some(img) => img,
            None => {
                eprintln!(
                    "[plugin-updater] No .container file or parseable Image= for {}",
                    name
                );
                continue;
            }
        };

        // Query GitHub releases API using org derived from OCI image
        let repo = format!("{}/{}", image.github_org, image.github_repo);
        let url = format!(
            "https://api.github.com/repos/{}/releases/latest",
            repo
        );

        eprintln!("[plugin-updater] checking {} (local: {})", repo, image.version);

        let response = match client.get(&url).send().await {
            Ok(r) => r,
            Err(e) => {
                eprintln!(
                    "[plugin-updater] GitHub request failed for {}: {}",
                    repo, e
                );
                continue;
            }
        };

        if !response.status().is_success() {
            eprintln!(
                "[plugin-updater] GitHub returned {} for {}",
                response.status(),
                repo
            );
            continue;
        }

        let release: GithubRelease = match response.json().await {
            Ok(r) => r,
            Err(e) => {
                eprintln!(
                    "[plugin-updater] Failed to parse release for {}: {}",
                    repo, e
                );
                continue;
            }
        };

        let remote_version = release.tag_name.trim_start_matches('v').to_string();

        if is_newer(&remote_version, &image.version) {
            eprintln!(
                "[plugin-updater] Update available for {}: {} -> {}",
                name, image.version, remote_version
            );
            updates.push(PluginUpdate {
                name: name.clone(),
                installed_version: image.version,
                latest_version: remote_version,
                body: release.body.unwrap_or_default(),
            });
        } else {
            eprintln!(
                "[plugin-updater] {} is up to date ({})",
                name, image.version
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

    let image = parse_container_image(&container_file)
        .ok_or_else(|| format!("Cannot parse Image= from .container file for {}", name))?;

    let new_image_ref = format!("{}:{}", image.image_base, version);
    let service_name = format!("hecate-app-{}d", name);

    // Read current .container file
    let content =
        std::fs::read_to_string(&container_file).map_err(|e| format!("Failed to read .container file: {}", e))?;

    // Replace Image= line with new version
    let new_image_line = format!("Image={}", new_image_ref);

    let mut found = false;
    let updated: Vec<String> = content
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("Image=") && trimmed.contains(&format!("hecate-app-{}d:", name)) {
                found = true;
                new_image_line.clone()
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
    eprintln!("[plugin-updater] Pulling image {}...", new_image_ref);

    let pull_image = new_image_ref.clone();
    let pull_output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("podman")
            .args(["pull", &pull_image])
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
