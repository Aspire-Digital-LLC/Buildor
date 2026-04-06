// LOCK ORDERING (must always acquire in this order to prevent deadlocks):
//   1. self.lanes (outer RwLock on HashMap)
//   2. individual lane RwLock (inner, per-lane)
//   3. self.config (read-only at runtime)
//   4. self.persisted (read-only at runtime, except persist_limits)
//   5. self.pool_size
//   6. self.completions
// Never acquire a lower-numbered lock while holding a higher-numbered one.
// config and persisted are currently only read-locked during normal operation,
// but must be included in the ordering for future-proofing.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

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
    persisted: RwLock<PersistedLimits>,
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
            persisted: RwLock::new(persisted),
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

        if self.shutdown.load(Ordering::Acquire) {
            let _ = tx.send(Err("Operation pool is shutting down".to_string()));
            return rx;
        }

        // Each tier's base must exceed the next tier's base + age_cap (20)
        // so lower tiers can never age past higher tiers
        let base_priority = match tier {
            Tier::App => 200,      // Buildor UI operations — always first
            Tier::User => 100,     // Primary Claude session tool calls
            Tier::Subagent => 0,   // Sub-agent / background work
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

        let max_queue_depth = self.config.read().max_queue_depth;

        // Try read-lock first (fast path: lane already exists)
        {
            let lanes = self.lanes.read();
            if let Some(lane_lock) = lanes.get(&resource_key) {
                let lane = lane_lock.read();
                let _ = lane.enqueue(op, max_queue_depth);
                return rx;
            }
        }

        // Slow path: need write-lock to create lane
        {
            let mut lanes = self.lanes.write();
            // Double-check after acquiring write lock
            if let Some(lane_lock) = lanes.get(&resource_key) {
                let lane = lane_lock.read();
                let _ = lane.enqueue(op, max_queue_depth);
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

                // Finding #1: restore persisted lane limits
                {
                    let persisted = self.persisted.read();
                    if let Some(persisted_lane) = persisted.lanes.get(&resource_key) {
                        lane.concurrency.restore_from_persisted(persisted_lane.max_seen_healthy);
                    }
                }

                let _ = lane.enqueue(op, max_queue_depth);
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

                if pool_ref.shutdown.load(Ordering::Acquire) {
                    break;
                }

                // Wrap tick phases in catch_unwind to prevent panic from killing the pool
                let (selected, completions_drained, failures_drained) = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    pool_ref.tick_phase1()
                })) {
                    Ok(result) => result,
                    Err(_) => {
                        eprintln!("[operation_pool] tick_phase1 panicked, recovering");
                        // Reset active_count on all lanes to prevent stuck slots
                        // from candidates that were selected but never executed
                        let lanes = pool_ref.lanes.read();
                        for (_, lane_lock) in lanes.iter() {
                            let mut lane = lane_lock.write();
                            lane.active_count = 0;
                        }
                        continue;
                    }
                };

                let selected_count = selected.len();

                // Phase2 is async — wrap in a spawned task to catch panics
                let handle = tauri::async_runtime::spawn(async move {
                    pool_ref.tick_phase2(selected).await;
                });
                if let Err(_) = handle.await {
                    eprintln!("[operation_pool] tick_phase2 panicked, recovering");
                }

                tick_count += 1;
                if tick_count % 600 == 0 {
                    pool_ref.persist_limits();
                }

                // Telemetry emission every 10 ticks (~1s)
                if tick_count % 10 == 0 && crate::telemetry::has_subscribers() {
                    let snapshot = pool_ref.telemetry_snapshot(
                        tick_count,
                        selected_count,
                        completions_drained,
                        failures_drained,
                    );
                    for sid in crate::telemetry::get_pool_subscribers() {
                        let msg = snapshot.clone();
                        let sid_clone = sid.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = crate::commands::claude::send_message(sid_clone, msg).await;
                        });
                    }
                }
            }
        });
    }

    /// Phase 1: cleanup + candidate selection.
    /// Returns (selected_ops, completions_drained, failures_drained).
    fn tick_phase1(&self) -> (Vec<PendingOp>, usize, usize) {
        self.state.store(-1, Ordering::Relaxed);

        // Drain completions and route to lanes
        let completions: Vec<(String, bool)> = {
            let mut lock = self.completions.lock();
            std::mem::take(&mut *lock)
        };

        let completions_drained = completions.len();
        let failures_drained = completions.iter().filter(|(_, ok)| !ok).count();

        let age_cap = self.config.read().age_cap;

        // Finding #6: Remove empty lanes before processing
        {
            let mut lanes = self.lanes.write();
            lanes.retain(|_, lane_lock| {
                let lane = lane_lock.read();
                !lane.is_empty()
            });
        }

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
                    // Use usize::MAX since these are being returned, not new submissions
                    let _ = lane.enqueue(op, usize::MAX);
                }
            }

            taken
        };

        self.state.store(0, Ordering::Relaxed);
        (selected, completions_drained, failures_drained)
    }

    /// Phase 2: execute selected ops, await all completions
    async fn tick_phase2(&self, selected: Vec<PendingOp>) {
        if selected.is_empty() {
            return;
        }

        let tick_start = Instant::now();
        let config = self.config.read().clone();
        let op_timeout = Duration::from_secs(config.op_timeout_secs);

        self.state.store(1, Ordering::Relaxed);

        let mut handles = Vec::with_capacity(selected.len());

        for mut op in selected {
            let operation = op.operation.take();
            let response_tx = op.response_tx.take();
            let lane_key = op.resource_key.clone();

            if let (Some(func), Some(tx)) = (operation, response_tx) {
                let fallback_key = lane_key.clone();
                let handle = tauri::async_runtime::spawn_blocking(move || {
                    let result = func();
                    let success = result.is_ok();
                    let _ = tx.send(result);
                    (lane_key, success)
                });
                handles.push((handle, fallback_key, op_timeout));
            }
        }

        // Finding #3 & #4: Await all handles with per-op timeout
        let mut any_failure = false;
        for (handle, lane_key, timeout_dur) in handles {
            match tokio::time::timeout(timeout_dur, handle).await {
                Ok(Ok((lane_key, success))) => {
                    if !success {
                        any_failure = true;
                    }
                    self.completions.lock().push((lane_key, success));
                }
                Ok(Err(_join_err)) => {
                    // spawn_blocking task panicked
                    any_failure = true;
                    self.completions.lock().push((lane_key, false));
                }
                Err(_timeout) => {
                    // Finding #4: timeout elapsed — record failure
                    any_failure = true;
                    self.completions.lock().push((lane_key, false));
                }
            }
        }

        // Finding #2: Adapt global pool size based on tick outcome
        let tick_duration = tick_start.elapsed();
        let tick_timed_out = tick_duration.as_secs() > config.tick_timeout_secs;

        if any_failure || tick_timed_out {
            self.pool_size.write().record_failure();
        } else {
            self.pool_size.write().record_success();
        }

        self.state.store(-1, Ordering::Relaxed);
    }

    /// Get a reference to completions that can be moved into spawned tasks.
    /// SAFETY: OperationPool lives in a static OnceLock, so this pointer is always valid.
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
        let lanes = self.lanes.read();
        let pool_size = self.pool_size.read();

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

    /// Format a compact telemetry snapshot for injection into Claude's stdin.
    pub fn telemetry_snapshot(
        &self,
        tick: u64,
        selected: usize,
        completed: usize,
        failures: usize,
    ) -> String {
        let state = self.state.load(Ordering::Relaxed);
        let state_label = match state {
            -1 => "cleanup",
            0 => "idle",
            1 => "exec",
            _ => "?",
        };
        let pool_size = self.pool_size.read();
        let lanes = self.lanes.read();

        let mut lane_parts: Vec<String> = Vec::new();
        for (key, lane_lock) in lanes.iter() {
            let lane = lane_lock.read();
            let q1 = lane.tier1_queue.lock().len();
            let q2 = lane.tier2_queue.lock().len();
            let short_key = shorten_lane_key(key);
            lane_parts.push(format!(
                "{}:a{},q{}/{},c{}",
                short_key, lane.active_count, q1, q2, lane.concurrency.current,
            ));
        }

        let lane_str = if lane_parts.is_empty() {
            "no-lanes".to_string()
        } else {
            lane_parts.join(" | ")
        };

        format!(
            "[TELEMETRY:pool] tick:{} {} pool:{}/{} sel:{} done:{} fail:{} | {}",
            tick,
            state_label,
            pool_size.current,
            pool_size.max_seen_healthy,
            selected,
            completed,
            failures,
            lane_str,
        )
    }

    pub fn shutdown(&self) {
        self.persist_limits();
        self.shutdown.store(true, Ordering::Release);

        // Finding #7: Graceful shutdown
        // Step 1: Drop all Tier 2 ops (their oneshot senders drop, callers get RecvError)
        {
            let lanes = self.lanes.read();
            for (_key, lane_lock) in lanes.iter() {
                let mut lane = lane_lock.write();
                let tier2_ids: Vec<Uuid> = {
                    let q = lane.tier2_queue.lock();
                    q.iter().map(|(id, _)| *id).collect()
                };
                lane.tier2_queue.lock().clear();
                let mut ops = lane.ops.lock();
                for id in tier2_ids {
                    ops.remove(&id); // drops PendingOp including oneshot sender
                }
            }
        }

        // Step 2: Execute remaining queued Tier 1 ops
        {
            let lanes = self.lanes.read();
            for (_key, lane_lock) in lanes.iter() {
                let mut lane = lane_lock.write();
                // Collect remaining Tier 1 ops
                let tier1_ids: Vec<Uuid> = {
                    let mut q = lane.tier1_queue.lock();
                    let ids: Vec<Uuid> = q.iter().map(|(id, _)| *id).collect();
                    q.clear();
                    ids
                };
                // Extract ops then execute them inline
                let mut extracted_ops: Vec<PendingOp> = Vec::new();
                {
                    let mut ops = lane.ops.lock();
                    for id in tier1_ids {
                        if let Some(op) = ops.remove(&id) {
                            extracted_ops.push(op);
                        }
                    }
                }
                for mut op in extracted_ops {
                    if let (Some(func), Some(tx)) = (op.operation.take(), op.response_tx.take()) {
                        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(func)) {
                            Ok(result) => {
                                let success = result.is_ok();
                                let _ = tx.send(result);
                                lane.record_completion(success);
                            }
                            Err(_) => {
                                let _ = tx.send(Err("Operation panicked during shutdown drain".to_string()));
                                lane.record_completion(false);
                            }
                        }
                    }
                }
            }
        }

        // Step 3: Wait for in-flight ops to complete (poll with timeout)
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let has_active = {
                let lanes = self.lanes.read();
                lanes.iter().any(|(_, lane_lock)| {
                    let lane = lane_lock.read();
                    lane.active_count > 0
                })
            };
            if !has_active || Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }

        // Step 4: Drop remaining ops
        {
            let mut lanes = self.lanes.write();
            lanes.clear();
        }
    }
}

fn shorten_lane_key(key: &str) -> String {
    // "process/git/C:/Git/Buildor" -> "git/Buildor"
    // "llm/agent-researcher" -> "llm/agent-researcher"
    // "fs//src/components" -> "fs/components"
    if let Some(rest) = key.strip_prefix("process/") {
        if let Some(slash_pos) = rest.find('/') {
            let tool = &rest[..slash_pos];
            let path = &rest[slash_pos + 1..];
            let last_seg = path.rsplit(['/', '\\']).next().unwrap_or(path);
            return format!("{}/{}", tool, last_seg);
        }
        return rest.to_string();
    }
    if let Some(rest) = key.strip_prefix("fs/") {
        let last_seg = rest.rsplit(['/', '\\']).next().unwrap_or(rest);
        return format!("fs/{}", last_seg);
    }
    // llm/, api/, tool/ — keep as-is
    key.to_string()
}
