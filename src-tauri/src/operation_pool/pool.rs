// LOCK ORDERING (must always acquire in this order to prevent deadlocks):
//   1. self.lanes (outer RwLock on HashMap)
//   2. individual lane RwLock (inner, per-lane)
//   3. self.pool_size
//   4. self.completions
// Never acquire a lower-numbered lock while holding a higher-numbered one.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use tokio::sync::oneshot;
use uuid::Uuid;

use super::adaptive::AdaptiveLimit;
use super::config::PoolConfig;
use super::lane::Lane;
use super::pending_op::{PendingOp, Tier};
use super::persistence::{PersistedLaneLimit, PersistedLimits};

pub static OPERATION_POOL: OnceLock<OperationPool> = OnceLock::new();

pub struct OperationPool {
    /// -1 = cleanup, 0 = scheduled/idle, +1 = executing
    state: AtomicI32,
    insertion_counter: AtomicU64,
    pool_size: RwLock<AdaptiveLimit>,
    lanes: RwLock<HashMap<String, RwLock<Lane>>>,
    config: RwLock<PoolConfig>,
    completions: Mutex<Vec<(String, bool)>>,
    shutdown: AtomicBool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PoolStatus {
    pub state: i32,
    pub lane_count: usize,
    pub pool_size_current: u32,
    pub pool_size_max_seen: u32,
    pub lanes: Vec<LaneStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaneStatus {
    pub key: String,
    pub active_count: u32,
    pub queue_depth: usize,
    pub concurrency_current: u32,
}

impl OperationPool {
    pub fn new(config: PoolConfig, persisted: PersistedLimits) -> Self {
        let start = persisted
            .pool_max_threads
            .unwrap_or(config.pool_size_start);

        let pool_size = AdaptiveLimit::new(
            start,
            config.pool_absolute_max,
            config.probe_threshold,
        );

        Self {
            state: AtomicI32::new(0),
            insertion_counter: AtomicU64::new(0),
            pool_size: RwLock::new(pool_size),
            lanes: RwLock::new(HashMap::new()),
            config: RwLock::new(config),
            completions: Mutex::new(Vec::new()),
            shutdown: AtomicBool::new(false),
        }
    }

    pub async fn submit<F>(
        &self,
        resource_key: String,
        tier: Tier,
        operation: F,
    ) -> oneshot::Receiver<Result<String, String>>
    where
        F: FnOnce() -> Result<String, String> + Send + 'static,
    {
        let (tx, rx) = oneshot::channel();

        let base_priority = match tier {
            Tier::User => 10,
            Tier::Subagent => 1,
        };

        let op = PendingOp {
            id: Uuid::new_v4(),
            resource_key: resource_key.clone(),
            tier,
            base_priority,
            age: 0,
            insertion_order: self.insertion_counter.fetch_add(1, Ordering::Relaxed),
            operation: Some(Box::new(operation)),
            response_tx: Some(tx),
        };

        // Try read-lock first (fast path: lane already exists)
        {
            let lanes = self.lanes.read();
            if let Some(lane_lock) = lanes.get(&resource_key) {
                lane_lock.write().enqueue(op);
                return rx;
            }
        }

        // Slow path: need write-lock to create lane
        {
            let mut lanes = self.lanes.write();
            // Double-check after acquiring write lock
            if let Some(lane_lock) = lanes.get(&resource_key) {
                lane_lock.write().enqueue(op);
            } else {
                let config = self.config.read();
                let override_max = config
                    .lane_overrides
                    .get(&resource_key)
                    .and_then(|o| o.absolute_max)
                    .unwrap_or(config.lane_absolute_max);

                let mut lane = Lane::new(
                    resource_key.clone(),
                    config.lane_start_concurrency,
                    override_max,
                    config.probe_threshold,
                );
                lane.enqueue(op);
                lanes.insert(resource_key, RwLock::new(lane));
            }
        }

        rx
    }

    pub fn start_tick_loop(&self) {
        let tick_interval_ms = self.config.read().tick_interval_ms;
        let pool = self as *const OperationPool;

        // SAFETY: OperationPool lives in a static OnceLock so it is valid for 'static.
        let pool_ref: &'static OperationPool = unsafe { &*pool };

        tauri::async_runtime::spawn(async move {
            let mut interval =
                tokio::time::interval(Duration::from_millis(tick_interval_ms));
            let mut tick_count: u64 = 0;

            loop {
                interval.tick().await;

                if pool_ref.shutdown.load(Ordering::Relaxed) {
                    break;
                }

                let selected = pool_ref.tick_phase1();
                pool_ref.tick_phase2(selected);

                tick_count += 1;
                if tick_count % 600 == 0 {
                    pool_ref.persist_limits();
                }
            }
        });
    }

    /// Phase 1: cleanup + candidate selection
    fn tick_phase1(&self) -> Vec<PendingOp> {
        self.state.store(-1, Ordering::Relaxed);

        // Drain completions and route to lanes
        let completions: Vec<(String, bool)> = {
            let mut lock = self.completions.lock();
            std::mem::take(&mut *lock)
        };

        let age_cap = self.config.read().age_cap;

        let lanes = self.lanes.read();

        // Route completions to their lanes
        for (lane_key, success) in &completions {
            if let Some(lane_lock) = lanes.get(lane_key) {
                lane_lock.write().record_completion(*success);
            }
        }

        // Age all ops and collect candidates from each lane
        // We track candidates with their lane key for potential return-to-lane
        let mut all_candidates: Vec<(String, PendingOp)> = Vec::new();

        for (key, lane_lock) in lanes.iter() {
            let mut lane = lane_lock.write();
            lane.age_all(age_cap);
            let slots = lane.available_slots();
            if slots > 0 {
                let candidates = lane.select_candidates(slots);
                for op in candidates {
                    all_candidates.push((key.clone(), op));
                }
            }
        }

        let pool_max = self.pool_size.read().current as usize;

        let selected = if all_candidates.len() <= pool_max {
            // All fit — take them all
            all_candidates
                .into_iter()
                .map(|(_, op)| op)
                .collect()
        } else {
            // Cross-lane selection: sort by effective_priority desc, insertion_order asc
            all_candidates.sort_by(|a, b| {
                b.1.effective_priority()
                    .cmp(&a.1.effective_priority())
                    .then_with(|| a.1.insertion_order.cmp(&b.1.insertion_order))
            });

            let mut taken = Vec::with_capacity(pool_max);
            let mut returned: Vec<(String, PendingOp)> = Vec::new();

            for (i, item) in all_candidates.into_iter().enumerate() {
                if i < pool_max {
                    taken.push(item.1);
                } else {
                    returned.push(item);
                }
            }

            // Return excess candidates back to their lanes
            for (lane_key, op) in returned {
                if let Some(lane_lock) = lanes.get(&lane_key) {
                    let mut lane = lane_lock.write();
                    // Decrement active_count since select_candidates incremented it
                    lane.active_count = lane.active_count.saturating_sub(1);
                    lane.enqueue(op);
                }
            }

            taken
        };

        self.state.store(0, Ordering::Relaxed);
        selected
    }

    /// Phase 2: execute selected ops
    fn tick_phase2(&self, selected: Vec<PendingOp>) {
        if selected.is_empty() {
            return;
        }

        self.state.store(1, Ordering::Relaxed);

        for mut op in selected {
            let operation = op.operation.take();
            let response_tx = op.response_tx.take();
            let lane_key = op.resource_key.clone();
            let completions = self.completions_ref();

            if let (Some(func), Some(tx)) = (operation, response_tx) {
                tauri::async_runtime::spawn_blocking(move || {
                    let result = func();
                    let success = result.is_ok();
                    let _ = tx.send(result);
                    completions.lock().push((lane_key, success));
                });
            }
        }

        self.state.store(-1, Ordering::Relaxed);
    }

    /// Get a reference to completions that can be moved into spawned tasks.
    /// SAFETY: OperationPool lives in a static OnceLock, so this pointer is always valid.
    fn completions_ref(&self) -> &'static Mutex<Vec<(String, bool)>> {
        let ptr = &self.completions as *const Mutex<Vec<(String, bool)>>;
        unsafe { &*ptr }
    }

    pub fn persist_limits(&self) {
        let lanes = self.lanes.read();
        let mut persisted = PersistedLimits {
            pool_max_threads: Some(self.pool_size.read().max_seen_healthy),
            lanes: HashMap::new(),
        };

        for (key, lane_lock) in lanes.iter() {
            let lane = lane_lock.read();
            persisted.lanes.insert(
                key.clone(),
                PersistedLaneLimit {
                    max_seen_healthy: lane.concurrency.max_seen_healthy,
                },
            );
        }

        let _ = persisted.save();
    }

    pub fn status(&self) -> PoolStatus {
        let state = self.state.load(Ordering::Relaxed);
        let pool_size = self.pool_size.read();
        let lanes = self.lanes.read();

        let lane_statuses: Vec<LaneStatus> = lanes
            .iter()
            .map(|(key, lane_lock)| {
                let lane = lane_lock.read();
                let queue_depth = lane.tier1_queue.lock().len()
                    + lane.tier2_queue.lock().len();
                let active_count = lane.active_count;
                let concurrency_current = lane.concurrency.current;
                drop(lane);
                LaneStatus {
                    key: key.clone(),
                    active_count,
                    queue_depth,
                    concurrency_current,
                }
            })
            .collect();

        PoolStatus {
            state,
            lane_count: lanes.len(),
            pool_size_current: pool_size.current,
            pool_size_max_seen: pool_size.max_seen_healthy,
            lanes: lane_statuses,
        }
    }

    pub fn shutdown(&self) {
        self.persist_limits();
        self.shutdown.store(true, Ordering::Relaxed);
    }
}
