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
    eprintln!("[updater] checking (local: v{})", current_version());

    let client = reqwest::Client::builder()
        .user_agent("hecate-web")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get("https://api.github.com/repos/hecate-social/hecate-web/releases/latest")
        .send()
        .await
        .map_err(|e| {
            eprintln!("[updater] request failed: {}", e);
            e.to_string()
        })?;

    if !response.status().is_success() {
        eprintln!("[updater] GitHub returned {}", response.status());
        return Err(format!("GitHub API returned {}", response.status()));
    }

    let release: GithubRelease = response.json().await.map_err(|e| e.to_string())?;

    let remote_version = release.tag_name.trim_start_matches('v');
    let local_version = current_version();
    eprintln!("[updater] remote: v{}, local: v{}", remote_version, local_version);

    if !is_newer(remote_version, local_version) {
        return Ok(None);
    }

    let target_asset = asset_name();
    let asset = release
        .assets
        .iter()
        .find(|a| a.name == target_asset)
        .ok_or_else(|| format!("No asset found for {}", target_asset))?;

    eprintln!("[updater] update available: v{}", remote_version);
    Ok(Some(AppUpdate {
        version: remote_version.to_string(),
        body: release.body.unwrap_or_default(),
        asset_url: asset.browser_download_url.clone(),
    }))
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle, url: String) -> Result<(), String> {
    eprintln!("[updater] downloading update...");

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

    let _ = app.emit("update-installing", ());

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

    let new_binary = extract_dir.join("hecate-web");
    if !new_binary.exists() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err("hecate-web binary not found in archive".to_string());
    }

    // Save exe path BEFORE renaming — on Linux, /proc/self/exe follows the
    // inode so after rename current_exe() would resolve to the .old path.
    let exe_path =
        std::env::current_exe().map_err(|e| format!("Failed to detect current binary: {}", e))?;

    // Check write permission BEFORE attempting — system-installed binaries
    // (e.g., /usr/bin owned by root) cannot be replaced by the user process.
    // Fail early with a helpful message instead of crashing in a loop.
    // Test by trying to create a temp file in the same directory.
    let parent = exe_path.parent().unwrap_or(std::path::Path::new("/"));
    let probe = parent.join(".hecate-update-probe");
    match std::fs::File::create(&probe) {
        Ok(_) => { let _ = std::fs::remove_file(&probe); }
        Err(_) => {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return Err(format!(
                "Cannot update: {} is not writable. Use: hecate-web-update.sh",
                exe_path.display()
            ));
        }
    }

    let backup = exe_path.with_extension("old");

    eprintln!("[updater] replacing {}", exe_path.display());

    // Backup current → rename away
    std::fs::rename(&exe_path, &backup)
        .map_err(|e| format!("Failed to backup current binary: {}", e))?;

    // Copy new binary into place
    if let Err(e) = std::fs::copy(&new_binary, &exe_path) {
        let _ = std::fs::rename(&backup, &exe_path);
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(format!("Failed to install new binary: {}", e));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&exe_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    // Clean up
    let _ = std::fs::remove_file(&backup);
    let _ = std::fs::remove_dir_all(&tmp_dir);

    // Signal frontend before restarting
    let _ = app.emit("update-restarting", ());

    // Spawn the NEW binary from the saved path (not current_exe which follows
    // the old inode on Linux). Then exit this process.
    eprintln!("[updater] restarting...");
    let args: Vec<String> = std::env::args().skip(1).collect();
    match std::process::Command::new(&exe_path).args(&args).spawn() {
        Ok(_) => {
            std::process::exit(0);
        }
        Err(e) => Err(format!("Failed to restart: {}", e)),
    }
}
