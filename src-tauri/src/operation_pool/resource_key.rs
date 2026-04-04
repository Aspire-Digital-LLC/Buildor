use serde_json::Value;

pub trait ResourceKeyed {
    fn resource_key(&self) -> String;
}

pub fn derive_resource_key(tool_name: &str, input: &Value) -> String {
    match tool_name {
        "Bash" => derive_bash_key(input),
        "Edit" | "Write" | "Read" => derive_fs_file_key(input),
        "Glob" | "Grep" => derive_fs_path_key(input),
        "WebFetch" => derive_api_key(input),
        _ => format!("tool/{}", tool_name),
    }
}

fn get_cwd(input: &Value) -> &str {
    input
        .get("cwd")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
}

fn extract_host(url: &str) -> Option<&str> {
    let rest = url.find("://").map(|i| &url[i + 3..])?;
    let end = rest.find('/').unwrap_or(rest.len());
    Some(&rest[..end])
}

fn derive_bash_key(input: &Value) -> String {
    let cwd = get_cwd(input);
    let command = input
        .get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let trimmed = command.trim_start();

    if trimmed.starts_with("git") {
        return format!("process/git/{}", cwd);
    }
    if trimmed.starts_with("npm") {
        return format!("process/npm/{}", cwd);
    }
    if trimmed.starts_with("cargo") {
        return format!("process/cargo/{}", cwd);
    }
    if trimmed.starts_with("curl") || trimmed.starts_with("wget") {
        if let Some(host) = extract_host_from_command(trimmed) {
            return format!("api/{}", host);
        }
    }

    format!("process/bash/{}", cwd)
}

fn extract_host_from_command(command: &str) -> Option<&str> {
    // Find any token containing :// and extract the host
    for token in command.split_whitespace() {
        if let Some(host) = extract_host(token) {
            return Some(host);
        }
    }
    None
}

fn derive_fs_file_key(input: &Value) -> String {
    let file_path = input
        .get("file_path")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    let parent = match file_path.rfind('/') {
        Some(i) => &file_path[..i],
        None => match file_path.rfind('\\') {
            Some(i) => &file_path[..i],
            None => file_path,
        },
    };

    format!("fs/{}", parent)
}

fn derive_fs_path_key(input: &Value) -> String {
    let path = input
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| get_cwd(input));

    format!("fs/{}", path)
}

fn derive_api_key(input: &Value) -> String {
    let url = input
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match extract_host(url) {
        Some(host) => format!("api/{}", host),
        None => "api/unknown".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn bash_git_command() {
        let input = json!({"command": "git status", "cwd": "/repo"});
        assert_eq!(derive_resource_key("Bash", &input), "process/git//repo");
    }

    #[test]
    fn bash_npm_command() {
        let input = json!({"command": "npm install", "cwd": "/app"});
        assert_eq!(derive_resource_key("Bash", &input), "process/npm//app");
    }

    #[test]
    fn bash_cargo_command() {
        let input = json!({"command": "cargo build", "cwd": "/proj"});
        assert_eq!(derive_resource_key("Bash", &input), "process/cargo//proj");
    }

    #[test]
    fn bash_curl_with_url() {
        let input = json!({"command": "curl https://api.example.com/data"});
        assert_eq!(derive_resource_key("Bash", &input), "api/api.example.com");
    }

    #[test]
    fn bash_wget_with_url() {
        let input = json!({"command": "wget http://files.example.com/file.tar.gz"});
        assert_eq!(derive_resource_key("Bash", &input), "api/files.example.com");
    }

    #[test]
    fn bash_fallback() {
        let input = json!({"command": "ls -la", "cwd": "/home"});
        assert_eq!(derive_resource_key("Bash", &input), "process/bash//home");
    }

    #[test]
    fn bash_no_cwd_defaults_unknown() {
        let input = json!({"command": "echo hello"});
        assert_eq!(derive_resource_key("Bash", &input), "process/bash/unknown");
    }

    #[test]
    fn edit_file() {
        let input = json!({"file_path": "/src/main.rs"});
        assert_eq!(derive_resource_key("Edit", &input), "fs//src");
    }

    #[test]
    fn write_file() {
        let input = json!({"file_path": "/src/lib/utils.ts"});
        assert_eq!(derive_resource_key("Write", &input), "fs//src/lib");
    }

    #[test]
    fn read_file() {
        let input = json!({"file_path": "README.md"});
        assert_eq!(derive_resource_key("Read", &input), "fs/README.md");
    }

    #[test]
    fn glob_with_path() {
        let input = json!({"path": "/src", "pattern": "*.rs"});
        assert_eq!(derive_resource_key("Glob", &input), "fs//src");
    }

    #[test]
    fn grep_falls_back_to_cwd() {
        let input = json!({"pattern": "TODO", "cwd": "/project"});
        assert_eq!(derive_resource_key("Grep", &input), "fs//project");
    }

    #[test]
    fn grep_no_path_no_cwd() {
        let input = json!({"pattern": "TODO"});
        assert_eq!(derive_resource_key("Grep", &input), "fs/unknown");
    }

    #[test]
    fn webfetch_url() {
        let input = json!({"url": "https://docs.rs/serde/latest"});
        assert_eq!(derive_resource_key("WebFetch", &input), "api/docs.rs");
    }

    #[test]
    fn webfetch_no_url() {
        let input = json!({});
        assert_eq!(derive_resource_key("WebFetch", &input), "api/unknown");
    }

    #[test]
    fn unknown_tool() {
        let input = json!({});
        assert_eq!(derive_resource_key("CustomTool", &input), "tool/CustomTool");
    }
}
