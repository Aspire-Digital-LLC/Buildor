use std::cmp::Ordering;
use std::hash::{Hash, Hasher};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tier {
    User,
    Subagent,
}

pub struct PendingOp {
    pub id: Uuid,
    pub resource_key: String,
    pub tier: Tier,
    pub base_priority: u32,
    pub age: u32,
    pub insertion_order: u64,
    pub operation: Option<Box<dyn FnOnce() -> Result<String, String> + Send + 'static>>,
    pub response_tx: Option<tokio::sync::oneshot::Sender<Result<String, String>>>,
}

impl PendingOp {
    pub fn effective_priority(&self) -> u32 {
        self.base_priority + self.age
    }
}

impl PartialEq for PendingOp {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Eq for PendingOp {}

impl Hash for PendingOp {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.id.hash(state);
    }
}

impl Ord for PendingOp {
    fn cmp(&self, other: &Self) -> Ordering {
        // Higher effective_priority first (descending)
        other
            .effective_priority()
            .cmp(&self.effective_priority())
            // Lower insertion_order first for tie-breaking (ascending)
            .then_with(|| self.insertion_order.cmp(&other.insertion_order))
    }
}

impl PartialOrd for PendingOp {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
