use std::cmp::{Ordering, Reverse};
use std::collections::HashMap;

use parking_lot::Mutex;
use priority_queue::PriorityQueue;
use uuid::Uuid;

use super::adaptive::AdaptiveLimit;
use super::pending_op::{PendingOp, Tier};

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct OpPriority {
    pub effective_priority: u32,
    pub insertion_order: Reverse<u64>,
}

impl Ord for OpPriority {
    fn cmp(&self, other: &Self) -> Ordering {
        self.effective_priority
            .cmp(&other.effective_priority)
            .then_with(|| self.insertion_order.cmp(&other.insertion_order))
    }
}

impl PartialOrd for OpPriority {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

pub struct Lane {
    pub key: String,
    pub tier1_queue: Mutex<PriorityQueue<Uuid, OpPriority>>,
    pub tier2_queue: Mutex<PriorityQueue<Uuid, OpPriority>>,
    pub ops: Mutex<HashMap<Uuid, PendingOp>>,
    pub concurrency: AdaptiveLimit,
    pub active_count: u32,
}

impl Lane {
    pub fn new(
        key: String,
        start_concurrency: u32,
        absolute_max: u32,
        probe_threshold: u32,
    ) -> Self {
        Self {
            key,
            tier1_queue: Mutex::new(PriorityQueue::new()),
            tier2_queue: Mutex::new(PriorityQueue::new()),
            ops: Mutex::new(HashMap::new()),
            concurrency: AdaptiveLimit::new(start_concurrency, absolute_max, probe_threshold),
            active_count: 0,
        }
    }

    pub fn enqueue(&self, mut op: PendingOp, max_queue_depth: usize) -> Result<(), String> {
        let total_depth = self.tier1_queue.lock().len() + self.tier2_queue.lock().len();
        if total_depth >= max_queue_depth {
            let err_msg = format!(
                "Queue overflow: lane '{}' has {} queued ops (max {})",
                self.key, total_depth, max_queue_depth
            );
            // Send error through the oneshot channel before dropping op
            if let Some(tx) = op.response_tx.take() {
                let _ = tx.send(Err(err_msg.clone()));
            }
            return Err(err_msg);
        }

        let priority = OpPriority {
            effective_priority: op.effective_priority(),
            insertion_order: Reverse(op.insertion_order),
        };
        let id = op.id;
        let tier = op.tier;

        self.ops.lock().insert(id, op);

        match tier {
            Tier::App | Tier::User => { self.tier1_queue.lock().push(id, priority); },
            Tier::Subagent => { self.tier2_queue.lock().push(id, priority); },
        }
        Ok(())
    }

    pub fn available_slots(&self) -> u32 {
        self.concurrency.current.saturating_sub(self.active_count)
    }

    pub fn select_candidates(&mut self, max: u32) -> Vec<PendingOp> {
        let mut result = Vec::new();
        let mut remaining = max;

        // Tier1 first
        {
            let mut q = self.tier1_queue.lock();
            let mut ops = self.ops.lock();
            while remaining > 0 {
                if let Some((id, _)) = q.pop() {
                    if let Some(op) = ops.remove(&id) {
                        result.push(op);
                        remaining -= 1;
                    }
                } else {
                    break;
                }
            }
        }

        // Then tier2
        {
            let mut q = self.tier2_queue.lock();
            let mut ops = self.ops.lock();
            while remaining > 0 {
                if let Some((id, _)) = q.pop() {
                    if let Some(op) = ops.remove(&id) {
                        result.push(op);
                        remaining -= 1;
                    }
                } else {
                    break;
                }
            }
        }

        self.active_count += result.len() as u32;
        result
    }

    pub fn age_all(&mut self, age_cap: u32) {
        let mut ops = self.ops.lock();
        let mut t1 = self.tier1_queue.lock();
        let mut t2 = self.tier2_queue.lock();

        for op in ops.values_mut() {
            op.age = (op.age + 1).min(age_cap);
            let new_priority = OpPriority {
                effective_priority: op.effective_priority(),
                insertion_order: Reverse(op.insertion_order),
            };
            let id = op.id;
            match op.tier {
                Tier::App | Tier::User => {
                    t1.change_priority(&id, new_priority);
                }
                Tier::Subagent => {
                    t2.change_priority(&id, new_priority);
                }
            }
        }
    }

    pub fn is_empty(&self) -> bool {
        self.tier1_queue.lock().is_empty()
            && self.tier2_queue.lock().is_empty()
            && self.active_count == 0
    }

    pub fn record_completion(&mut self, success: bool) {
        self.active_count = self.active_count.saturating_sub(1);
        if success {
            self.concurrency.record_success();
        } else {
            self.concurrency.record_failure();
        }
    }
}
