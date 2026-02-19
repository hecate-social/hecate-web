use serde::{Deserialize, Serialize};
use std::io::Write;
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
pub struct AppUpdate {
    pub version: String,
    pub body: String,
    pub asset_url: String,
}

#[derive(Serialize, Clone)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn asset_name() -> String {
    let os = if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };
    let arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "amd64"
    };
    format!("hecate-web-{}-{}.tar.gz", os, arch)
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

#[tauri::command]
pub async fn check_app_update() -> Result<Option<AppUpdate>, String> {
    let client = reqwest::Client::builder()
        .user_agent("hecate-web")
        .build()
        .map_err(|e| e.to_string())?;

    let release: GithubRelease = client
        .get("https://api.github.com/repos/hecate-social/hecate-web/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let remote_version = release.tag_name.trim_start_matches('v');
    let local_version = current_version();

    if !is_newer(remote_version, local_version) {
        return Ok(None);
    }

    let target_asset = asset_name();
    let asset = release
        .assets
        .iter()
        .find(|a| a.name == target_asset)
        .ok_or_else(|| format!("No asset found for {}", target_asset))?;

    Ok(Some(AppUpdate {
        version: remote_version.to_string(),
        body: release.body.unwrap_or_default(),
        asset_url: asset.browser_download_url.clone(),
    }))
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle, url: String) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("hecate-web")
        .build()
        .map_err(|e| e.to_string())?;

    let mut response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let total = response.content_length();
    let mut downloaded: u64 = 0;

    // Download to temp file
    let tmp_dir = std::env::temp_dir().join(format!("hecate-update-{}", std::process::id()));
    std::fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let tmp_file = tmp_dir.join("update.tar.gz");
    let mut file =
        std::fs::File::create(&tmp_file).map_err(|e| format!("Failed to create temp file: {}", e))?;

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            "update-download-progress",
            DownloadProgress {
                downloaded,
                total,
            },
        );
    }
    file.flush()
        .map_err(|e| format!("Failed to flush file: {}", e))?;
    drop(file);

    // Signal extraction phase
    let _ = app.emit("update-installing", ());

    // Extract tar.gz
    let extract_dir = tmp_dir.join("extracted");
    std::fs::create_dir_all(&extract_dir)
        .map_err(|e| format!("Failed to create extract dir: {}", e))?;

    let output = std::process::Command::new("tar")
        .args([
            "-xzf",
            tmp_file.to_str().unwrap_or_default(),
            "-C",
            extract_dir.to_str().unwrap_or_default(),
        ])
        .output()
        .map_err(|e| format!("Failed to run tar: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(format!("tar extraction failed: {}", stderr));
    }

    // Find the binary in extracted files
    let new_binary = extract_dir.join("hecate-web");
    if !new_binary.exists() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err("hecate-web binary not found in archive".to_string());
    }

    // Replace current binary
    let current_exe =
        std::env::current_exe().map_err(|e| format!("Failed to detect current binary: {}", e))?;
    let backup = current_exe.with_extension("old");

    // Backup current binary
    std::fs::rename(&current_exe, &backup)
        .map_err(|e| format!("Failed to backup current binary: {}", e))?;

    // Copy new binary into place
    if let Err(e) = std::fs::copy(&new_binary, &current_exe) {
        // Restore backup on failure
        let _ = std::fs::rename(&backup, &current_exe);
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(format!("Failed to install new binary: {}", e));
    }

    // Set executable permission
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&current_exe, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    // Clean up
    let _ = std::fs::remove_file(&backup);
    let _ = std::fs::remove_dir_all(&tmp_dir);

    Ok(())
}
