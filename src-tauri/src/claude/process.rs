pub struct ClaudeProcess {
    // TODO: Manage Claude Code subprocess
}

impl ClaudeProcess {
    pub fn new(_working_dir: &str) -> Self {
        ClaudeProcess {}
    }

    pub async fn start(&self) -> Result<(), String> {
        // TODO: Spawn Claude Code process
        Ok(())
    }

    pub async fn send(&self, _message: &str) -> Result<String, String> {
        // TODO: Send message and stream response
        Ok("stub response".to_string())
    }

    pub async fn stop(&self) -> Result<(), String> {
        // TODO: Gracefully terminate
        Ok(())
    }
}
