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

// --- Agent Prompts ---

#[derive(Debug, Serialize, Clone)]
pub struct AgentPrompt {
    pub id: String,
    pub name: String,
    pub role: String,
    pub icon: String,
    pub description: String,
    pub prompt: String,
}

fn parse_agent_file(content: &str) -> Option<AgentPrompt> {
    // Split on YAML frontmatter markers: ---\n...\n---
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }

    // Find the closing ---
    let after_first = &trimmed[3..].trim_start_matches('\r');
    let after_first = after_first.strip_prefix('\n')?;
    let end_idx = after_first.find("\n---")?;
    let frontmatter = &after_first[..end_idx];
    let body_start = end_idx + 4; // skip \n---
    let body = after_first[body_start..].trim_start_matches(['\r', '\n']);

    let mut id = String::new();
    let mut name = String::new();
    let mut role = String::new();
    let mut icon = String::new();
    let mut description = String::new();

    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = value.trim().trim_matches('"');
            match key {
                "id" => id = value.to_string(),
                "name" => name = value.to_string(),
                "role" => role = value.to_string(),
                "icon" => {
                    // Handle unicode escapes like \u25C7
                    icon = unescape_unicode(value);
                }
                "description" => description = value.to_string(),
                _ => {}
            }
        }
    }

    if id.is_empty() {
        return None;
    }

    Some(AgentPrompt {
        id,
        name,
        role,
        icon,
        description,
        prompt: body.to_string(),
    })
}

fn unescape_unicode(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('u') => {
                    let hex: String = chars.by_ref().take(4).collect();
                    if let Ok(code) = u32::from_str_radix(&hex, 16) {
                        if let Some(ch) = char::from_u32(code) {
                            result.push(ch);
                            continue;
                        }
                    }
                    result.push('\\');
                    result.push('u');
                    result.push_str(&hex);
                }
                Some(other) => {
                    result.push('\\');
                    result.push(other);
                }
                None => result.push('\\'),
            }
        } else {
            result.push(c);
        }
    }
    result
}

#[tauri::command]
pub fn load_agent_prompt(agent_path: String) -> Result<AgentPrompt, String> {
    let agents_dir = find_agents_dir()
        .ok_or_else(|| "hecate-agents not found".to_string())?;

    let file_path = agents_dir.join("agents").join(format!("{}.md", agent_path));
    let content = read_file(&file_path)
        .ok_or_else(|| format!("Agent file not found: agents/{}.md", agent_path))?;

    parse_agent_file(&content)
        .ok_or_else(|| format!("Failed to parse agent file: agents/{}.md", agent_path))
}

#[tauri::command]
pub fn load_agent_group(group_path: String) -> Result<Vec<AgentPrompt>, String> {
    let agents_dir = find_agents_dir()
        .ok_or_else(|| "hecate-agents not found".to_string())?;

    let group_dir = agents_dir.join("agents").join(&group_path);
    if !group_dir.is_dir() {
        return Err(format!("Agent group not found: agents/{}", group_path));
    }

    let mut agents: Vec<AgentPrompt> = Vec::new();

    let mut entries: Vec<_> = std::fs::read_dir(&group_dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension()
                .map(|ext| ext == "md")
                .unwrap_or(false)
        })
        .collect();

    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let path = entry.path();
        if let Some(content) = read_file(&path) {
            if let Some(agent) = parse_agent_file(&content) {
                agents.push(agent);
            }
        }
    }

    if agents.is_empty() {
        return Err(format!("No agent files found in: agents/{}", group_path));
    }

    Ok(agents)
}

#[tauri::command]
pub fn load_raw_prompt(agent_path: String) -> Result<String, String> {
    let agents_dir = find_agents_dir()
        .ok_or_else(|| "hecate-agents not found".to_string())?;

    let file_path = agents_dir.join("agents").join(format!("{}.md", agent_path));
    let content = read_file(&file_path)
        .ok_or_else(|| format!("Agent file not found: agents/{}.md", agent_path))?;

    // If it has frontmatter, extract just the body
    let trimmed = content.trim_start();
    if trimmed.starts_with("---") {
        if let Some(after_first) = trimmed[3..].trim_start_matches('\r').strip_prefix('\n') {
            if let Some(end_idx) = after_first.find("\n---") {
                let body = after_first[end_idx + 4..].trim_start_matches(['\r', '\n']);
                return Ok(body.to_string());
            }
        }
    }

    // No frontmatter — return as-is
    Ok(content)
}
