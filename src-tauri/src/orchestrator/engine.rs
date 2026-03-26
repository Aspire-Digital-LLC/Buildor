use super::types::Flow;

pub struct FlowEngine {
    // TODO: Flow execution state
}

impl FlowEngine {
    pub fn new() -> Self {
        FlowEngine {}
    }

    pub async fn execute(&self, _flow: &Flow) -> Result<(), String> {
        // TODO: Implement flow orchestration
        // 1. Read flow stages
        // 2. Resolve dependencies and parallel groups
        // 3. Execute stages in order, spawning Claude Code per stage
        // 4. Manage context files between stages
        Ok(())
    }
}
