use serde::Serialize;
use std::path::PathBuf;

const AGENTS_PATHS: &[&str] = &[
    // Embedded in a torch project
    ".hecate/agents",
    // Development path (relative to home)
    "work/github.com/hecate-social/hecate-agents",
];

const PERSONALITY_FILE: &str = "PERSONALITY.md";
const ALC_FILE: &str = "philosophy/HECATE_ALC.md";

const ROLE_FILES: &[(&str, &str, &str)] = &[
    ("dna", "Discovery & Analysis", "philosophy/HECATE_DISCOVERY_N_ANALYSIS.md"),
    ("anp", "Architecture & Planning", "philosophy/HECATE_ARCHITECTURE_N_PLANNING.md"),
    ("tni", "Testing & Implementation", "philosophy/HECATE_TESTING_N_IMPLEMENTATION.md"),
    ("dno", "Deployment & Operations", "philosophy/HECATE_DEPLOYMENT_N_OPERATIONS.md"),
];

#[derive(Debug, Serialize, Clone)]
pub struct RoleInfo {
    pub code: String,
    pub name: String,
    pub available: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct PersonalityInfo {
    pub agents_path: Option<String>,
    pub personality_loaded: bool,
    pub alc_loaded: bool,
    pub active_role: Option<String>,
    pub roles: Vec<RoleInfo>,
}

fn find_agents_dir() -> Option<PathBuf> {
    let home = dirs::home_dir()?;

    for rel_path in AGENTS_PATHS {
        let candidate = home.join(rel_path);
        if candidate.join(PERSONALITY_FILE).exists() {
            return Some(candidate);
        }
    }

    // Also check current working directory
    if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join(".hecate/agents");
        if candidate.join(PERSONALITY_FILE).exists() {
            return Some(candidate);
        }
    }

    None
}

fn read_file(path: &PathBuf) -> Option<String> {
    std::fs::read_to_string(path).ok().filter(|s| !s.trim().is_empty())
}

#[tauri::command]
pub fn get_personality_info() -> PersonalityInfo {
    let agents_dir = find_agents_dir();

    let mut info = PersonalityInfo {
        agents_path: agents_dir.as_ref().map(|p| p.to_string_lossy().to_string()),
        personality_loaded: false,
        alc_loaded: false,
        active_role: None,
        roles: Vec::new(),
    };

    if let Some(dir) = &agents_dir {
        info.personality_loaded = dir.join(PERSONALITY_FILE).exists();
        info.alc_loaded = dir.join(ALC_FILE).exists();

        for (code, name, file) in ROLE_FILES {
            info.roles.push(RoleInfo {
                code: code.to_string(),
                name: name.to_string(),
                available: dir.join(file).exists(),
            });
        }
    }

    info
}

#[tauri::command]
pub fn build_system_prompt(role: Option<String>) -> Result<String, String> {
    let agents_dir = find_agents_dir()
        .ok_or_else(|| "hecate-agents not found".to_string())?;

    let mut parts: Vec<String> = Vec::new();

    // 1. Personality
    if let Some(personality) = read_file(&agents_dir.join(PERSONALITY_FILE)) {
        parts.push(personality);
    }

    // 2. ALC overview
    if let Some(alc) = read_file(&agents_dir.join(ALC_FILE)) {
        parts.push(alc);
    }

    // 3. Active role
    if let Some(role_code) = role {
        for (code, _, file) in ROLE_FILES {
            if *code == role_code {
                if let Some(role_content) = read_file(&agents_dir.join(file)) {
                    parts.push(role_content);
                }
                break;
            }
        }
    }

    if parts.is_empty() {
        return Err("No personality files found".to_string());
    }

    Ok(parts.join("\n\n---\n\n"))
}

#[tauri::command]
pub fn list_roles() -> Vec<RoleInfo> {
    let agents_dir = find_agents_dir();

    ROLE_FILES.iter().map(|(code, name, file)| {
        RoleInfo {
            code: code.to_string(),
            name: name.to_string(),
            available: agents_dir.as_ref()
                .map(|d| d.join(file).exists())
                .unwrap_or(false),
        }
    }).collect()
}
