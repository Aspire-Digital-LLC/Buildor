# Operation Pool — Design Specification

## Problem Statement

Buildor spawns concurrent operations against shared external resources (git CLI, GitHub API, bash subprocesses, future MCP endpoints). When multiple subagents or UI actions hammer the same resource simultaneously — e.g., 10 subagents all calling `git log` on the same repo — Windows chokes on process spawning, `git.exe` fails to start, error dialogs flood the screen, and the application crashes.

This is not a git-specific problem. It is a **process spawning and resource contention** problem that applies to any external resource: CLI tools, HTTP APIs, MCP servers, file I/O. The bottleneck varies by machine — a 6-core laptop has different limits than a 32-core workstation.

## Commander's Intent

Build an **app-global, self-tuning operation scheduler** that prevents resource saturation while maximizing throughput. Any operation that touches an external resource must route through this pool. The system must:

- Be invisible to callers (submit and await a result)
- Guarantee user-initiated work is never starved by background work
- Learn the limits of each machine and each resource type automatically
- Persist learned limits so it doesn't re-learn after restart
- Require zero configuration to work, but allow overrides

## Non-Negotiables

1. **App-global singleton** — one pool for the entire application, across all projects, repos, and sessions
2. **Resource-type lanes** — operations are grouped into lanes by a hierarchical resource key. Lanes are dynamic: created on first request, destroyed when drained
3. **Per-lane concurrency** — each lane has a learned concurrency limit (how many ops of that type can run simultaneously). Defaults to 1, adapts upward on sustained success, backs off on failure
4. **Two-tier scheduling** — Tier 1 (user/top-level agent) always takes precedence over Tier 2 (subagent/background) within a lane. Tier 2 ops never age past Tier 1 ops
5. **Priority aging** — every operation enters at base priority 0. Each tick an operation is skipped, its priority increments. Aging is capped. Starvation is impossible within a tier
6. **Adaptive thread pool** — pool size starts at `num_cpus / 2`, adapts using the same slow-start algorithm as lanes. Global ceiling prevents overloading the machine
7. **Non-preemptive** — once an operation starts executing, it runs to completion. Scheduling decisions only affect the next slot
8. **Callers await results** — submitting an operation returns a future/oneshot. The caller blocks on it transparently. No behavioral changes needed upstream
9. **Persisted learning** — learned concurrency limits (per lane) and pool size are saved to `~/.buildor/pool_limits.json` and restored on startup

---

## Hierarchical Resource Keys

The pool groups operations into lanes by **resource key** — a path-like string that represents the contention boundary. The pool doesn't interpret the key; it just groups by exact string match. Intelligence lives at the call site.

### The `ResourceKeyed` Trait

Each integration point builds its own key:

```rust
trait ResourceKeyed {
    fn resource_key(&self) -> String;
}
```

### Default Key Strategies

| Resource | Default Key Pattern | Rationale |
|----------|-------------------|-----------|
| Git | `process/git/{repo_path}` | Same repo can't handle concurrent git (lock file), different repos are fine |
| Bash/CLI | `process/{tool_name}` | Two different tools are fine, two `npm install`s will fight |
| GitHub API | `api/github.com/{owner}/{repo}` | Rate limits per-token, abuse detection per-repo |
| Generic HTTP | `api/{host}` | Most APIs rate-limit per host |
| MCP | `mcp/{server_name}` | Each MCP server is a single process |
| File I/O | `fs/{absolute_dir}` | Same-directory writes can conflict |
| Claude/LLM | `llm/{session_id}` | Each session is serial by nature |

### Granularity Control

Callers can coarsen or refine their key to match actual contention:

- `process/git` — serialize ALL git ops globally (nuclear, for emergencies)
- `process/git/{repo}` — serialize per-repo (default, handles lock file contention)
- `api/github.com` — serialize all GitHub (conservative)
- `api/github.com/{owner}/{repo}` — per-repo (default, handles rate limits)
- `api/github.com/search` vs `api/github.com/repos` — per-endpoint group (loose)

New integration? Implement `resource_key()` and submit to the pool. The lane creates itself.

---

## Adaptive Concurrency (TCP Slow Start Model)

The same algorithm operates at **two levels**: per-lane concurrency and global pool size. Both are independent instances of the same logic.

### Per-Lane Adaptive Concurrency

Each lane tracks:

```
current_concurrency: u32     // how many ops can run simultaneously (starts at 1)
max_seen_healthy: u32        // highest concurrency that ran clean
consecutive_successes: u32   // healthy op completions in a row
consecutive_failures: u32    // failures in a row
absolute_max: u32            // hard ceiling (from config, default 10)
```

Algorithm:

```
On success:
  consecutive_failures = 0
  consecutive_successes += 1
  if consecutive_successes >= probe_threshold (e.g., 5):
    current_concurrency = min(current_concurrency + 1, absolute_max)
    consecutive_successes = 0

On failure (spawn error, timeout, process crash):
  consecutive_successes = 0
  consecutive_failures += 1
  current_concurrency = max(1, current_concurrency / 2)  // multiplicative decrease
```

- **Additive increase** on sustained success (slow, safe probing)
- **Multiplicative decrease** on failure (fast backoff)
- Never exceeds `absolute_max`
- Never drops below 1

### Global Pool Size Adaptation

Same algorithm, different signals:

```
Starting pool size: num_cpus / 2
Signals:
  - Success: tick completes within expected time, no spawn failures
  - Failure: any process spawn failure, tick timeout, excessive join time
```

The pool size is the **global thread ceiling**. Lane concurrency is the **per-resource ceiling**. Actual ops per tick = min of what lanes want and what the pool allows.

### Persistence

Learned limits saved to `~/.buildor/pool_limits.json`:

```json
{
  "pool_max_threads": 8,
  "lanes": {
    "process/git/C:/projects/buildor": { "max_seen_healthy": 4 },
    "process/npm": { "max_seen_healthy": 1 },
    "api/github.com/user/repo": { "max_seen_healthy": 6 }
  }
}
```

On startup, each lane initializes `current_concurrency` to its persisted `max_seen_healthy` (or 1 if unseen). Pool size initializes to persisted value (or `num_cpus / 2` on first run). The system doesn't re-learn from scratch.

---

## Architecture

### Thread Safety Model

All mutable shared state uses **per-lane `RwLock`** synchronization. Fields that are semantically coupled (e.g., `current_concurrency` + `consecutive_failures`) live behind the same lock to prevent torn reads/inconsistent state. Only truly independent, single-value fields use lock-free atomics.

#### Lock Hierarchy

```
OperationPool
├── state: AtomicI32                                    // lock-free — standalone, single value
├── insertion_counter: AtomicU64                         // lock-free — standalone, monotonic
├── pool_size: RwLock<AdaptiveLimit>                     // read: scheduling reads current size
│                                                        // write: tick cleanup updates adaptive state
├── lanes: RwLock<HashMap<String, RwLock<Lane>>>         // OUTER RwLock: add/remove lanes (rare write)
│                                                        //   read: access existing lanes (common)
│                                                        //   write: create new lane or drain empty lanes
│   └── per-lane RwLock<Lane>                            // INNER RwLock: per-lane operations
│                                                        //   read: enqueue ops, read queue state
│                                                        //   write: pop ops, update adaptive limits, age ops
└── config: RwLock<PoolConfig>                           // read: scheduling reads config values
                                                         // write: hot-reload from config file
```

#### Contention Analysis

| Operation | Outer lanes lock | Inner lane lock | pool_size lock | Frequency |
|-----------|-----------------|-----------------|----------------|-----------|
| Enqueue (existing lane) | Read | Read* | — | Very high |
| Enqueue (new lane) | Write | — | — | Rare |
| Tick: cleanup + schedule | Write (briefly, to drain) | Write (per lane) | Write | Once per tick |
| Tick: execute | — | — | Read | Once per tick |
| Read pool status | Read | Read | Read | On demand |
| Config hot-reload | — | — | — | Rare |

*Enqueue takes a **read** lock on the lane because appending to a queue behind a `Mutex<VecDeque>` or using a concurrent queue within the lane. The `RwLock<Lane>` protects the lane's structural fields (adaptive limits, selection state). The queues themselves use an inner `Mutex` for push/pop. This means enqueuers never block each other across different lanes, and multiple enqueuers to the same lane only contend on the queue mutex (very brief).

#### Lock Ordering (Deadlock Prevention)

Locks must always be acquired in this order — never reversed:

1. `lanes` (outer) — RwLock on the HashMap
2. `lanes[key]` (inner) — RwLock on a specific Lane
3. `pool_size` — RwLock on AdaptiveLimit
4. `lane.queue_mutex` — Mutex on a lane's operation queue

No code path may acquire lock N then lock N-1. This is enforced by convention and code review.

### Data Structures

```
OperationPool (global singleton — LazyLock or Tauri managed state)
├── state: AtomicI32 (-1 = cleanup, 0 = scheduled, +1 = executing)
├── insertion_counter: AtomicU64 (monotonic, lock-free)
├── pool_size: RwLock<AdaptiveLimit>
├── lanes: RwLock<HashMap<String, RwLock<Lane>>>
├── config: RwLock<PoolConfig>
└── learned_limits: PersistedLimits (loaded from pool_limits.json on startup)

Lane
├── key: String (resource key, immutable after creation)
├── tier1_queue: Mutex<PriorityQueue<PendingOp>>
├── tier2_queue: Mutex<PriorityQueue<PendingOp>>
└── concurrency: AdaptiveLimit (protected by parent RwLock<Lane>)

AdaptiveLimit
├── current: u32
├── max_seen_healthy: u32
├── consecutive_successes: u32
├── consecutive_failures: u32
├── absolute_max: u32
└── probe_threshold: u32

PendingOp
├── id: Uuid
├── resource_key: String (lane key)
├── tier: Tier (User | Subagent)
├── base_priority: u32 (default 0, can be set higher for urgent ops)
├── age: u32 (incremented each skipped tick, capped at age_cap)
├── effective_priority: u32 (base_priority + age)
├── insertion_order: u64 (monotonic, for tie-breaking)
├── operation: Box<dyn FnOnce() -> Result + Send>
└── response_channel: oneshot::Sender<Result>
```

### Tick Cycle

Two-phase loop gated by atomic state flag. Lock acquisition follows the defined ordering.

#### Phase 1: Cleanup + Schedule (state -1 → 0)

```
Locks acquired: lanes(write, briefly) → lanes(read) → each lane(write) → pool_size(write)
```

1. Take **write** lock on `lanes` — drain empty lanes from the HashMap. Release write lock.
2. Take **read** lock on `lanes` — iterate all lanes:
   a. Take **write** lock on each lane:
      - Remove completed operations, record success/failure, update lane's `AdaptiveLimit`
      - Increment `age` on all remaining ops (capped at `age_cap`)
      - **Intra-lane selection**: select up to M candidates (M = lane's `concurrency.current`)
        - Tier 1 first: highest `effective_priority`, ties broken by `insertion_order`
        - If Tier 1 exhausted and slots remain: pick from Tier 2, same rules
   b. Release lane write lock
3. Take **write** lock on `pool_size` — update pool-level adaptive limit from tick results
4. **Cross-lane selection**: from all lane candidates, if total > `pool_size.current`, pick top N by `effective_priority` (ties by `insertion_order`). Unpicked candidates return to queues, age next tick
5. Transition state → `0`

#### Phase 2: Execute + Join (state 0 → +1 → -1)

```
Locks acquired: none during execution (selected ops already extracted)
```

1. Transition state → `+1`
2. Spawn one task per selected operation (tokio::JoinSet)
3. Await all tasks (join), with per-op timeout
4. Send results back through each operation's `response_channel`
5. Collect success/failure results for next cleanup phase
6. Transition state → `-1`

Note: no locks held during execution. Selected ops are moved out of the queues during Phase 1. This means the execute phase never blocks enqueuers.

### Atomic State Flag

```
AtomicI32:
  -1  Cleanup/Write phase — queue mutation, scheduling, aging (locks held)
   0  Scheduled/Ready — batch selected, about to spawn (no locks)
  +1  Executing — threads running, awaiting join (no locks)
```

- **Enqueuers** can safely add to the queue during states `0` and `+1` (read locks only)
- **Enqueuers** must wait during state `-1` (write locks held by tick loop)
- Transitions: -1 → 0 → +1 → -1 (strictly linear)
- State changes via `compare_and_swap`

### Enqueue Path (caller-facing)

```rust
fn submit(resource_key: String, tier: Tier, operation: F) -> oneshot::Receiver<Result>
where F: FnOnce() -> Result + Send + 'static
{
    // 1. Create oneshot channel (tx, rx)
    // 2. Build PendingOp: tier, priority 0, age 0, next insertion_order (AtomicU64 fetch_add)
    // 3. Spin/yield if state == -1 (write phase in progress)
    // 4. Take READ lock on lanes HashMap
    //    a. If lane exists: take lane's queue Mutex, push op, release
    //    b. If lane doesn't exist: release read lock, take WRITE lock on lanes HashMap,
    //       double-check (another thread may have created it), create lane + push op, release
    // 5. Return rx (caller awaits this)
}
```

The enqueue path never takes a write lock on a Lane — only the queue Mutex for push. This means enqueuers and the tick loop's lane-level write lock are the only contention point, and only during Phase 1.

---

## Scheduling Summary

**Two-class, non-preemptive, multilevel priority queue with aging, partitioned by hierarchical resource keys, with adaptive per-lane concurrency and adaptive global pool sizing. Both adaptation layers use TCP slow-start (additive increase / multiplicative decrease) and persist learned limits across restarts.**

Selection happens at two levels using the same priority algorithm:
1. **Intra-lane**: which ops get selected from this lane (up to M = lane concurrency)
2. **Inter-lane**: which candidates get thread pool slots (up to N = pool size)

---

## Configuration

### Defaults (zero-config)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `pool_size` | `num_cpus / 2` | Starting global thread pool size |
| `pool_absolute_max` | `num_cpus` | Hard ceiling for pool size |
| `lane_start_concurrency` | 1 | Starting concurrency for new lanes |
| `lane_absolute_max` | 10 | Hard ceiling for any lane |
| `probe_threshold` | 5 | Consecutive successes before probing higher |
| `age_cap` | 20 | Max aging increment |
| `tick_timeout` | 30s | Max time for a tick's threads to join |
| `op_timeout` | 60s | Max time for a single operation |

### Override File (`~/.buildor/pool_config.json`)

Optional manual overrides for specific lanes:

```json
{
  "pool_absolute_max": 12,
  "lane_overrides": {
    "process/git": { "absolute_max": 4 },
    "process/npm": { "absolute_max": 1 },
    "api/github.com": { "absolute_max": 8 }
  }
}
```

Config sets ceilings. Adaptive finds the sweet spot within them.

---

## Integration: How Operations Enter the Pool

There are two categories of operations. Both route through the same pool via a **unified permission pipeline**.

### Unified Permission Pipeline

By default, Claude Code auto-approves certain tools (Read, Glob, Grep) without emitting a permission request. This creates a blind spot — Buildor can't intercept what it can't see.

**Solution**: configure a `PreToolUse` hook that returns `permissionDecision: "ask"` for all tools. This forces every tool call — including Read, Glob, and Grep — through the permission system. Now every agent operation flows through the same pipeline.

```json
// .claude/settings.json (managed by Buildor per session)
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"hookSpecificOutput\":{\"permissionDecision\":\"ask\"}}'"
          }
        ]
      }
    ]
  }
}
```

With this in place, **every tool call** produces a permission request that Buildor intercepts. No special cases, no hook-based blocking, no IPC. One pipeline for everything.

### Category 1: Buildor-Initiated Operations

Operations triggered by Buildor's own backend — git status polling, worktree management, API calls, subagent spawning, etc.

**Interception**: direct. Existing call sites are refactored to call `OperationPool::submit()` instead of spawning processes directly.

```
Before:  Command::new("git").args(["status"]).output()
After:   pool.submit("process/git/{repo}", Tier::Subagent, || Command::new("git")...)
```

### Category 2: Claude Agent-Initiated Operations (All Tools)

Operations triggered by Claude Code sessions — Bash, Edit, Write, Read, Glob, Grep, WebFetch, any tool. Because the PreToolUse hook forces all tools to `"ask"`, Buildor receives a permission request for every single tool call.

**Interception**: the permission system. Buildor sits between every agent and every tool call. This is the universal hook.

**Flow:**

```
1. Claude agent requests tool use (any tool — Bash, Read, Glob, Edit, etc.)
2. PreToolUse hook forces permission request (even for normally auto-approved tools)
3. Buildor receives the permission request
4. IF not auto-approved by Buildor's rules:
   a. Show permission card to user
   b. User approves (or denies → stop here)
5. On approval (explicit or Buildor auto-approved):
   a. Derive resource key from tool request
   b. Submit to OperationPool with appropriate tier
   c. Await pool slot
6. Pool grants slot → Buildor sends tool approval to Claude agent
7. Agent executes the tool, result flows back normally
8. On completion → pool records success/failure for adaptive learning
```

**Key insight**: the user decides **what** is authorized. The pool decides **when** it runs. From the agent's perspective, it's just a normal permission wait — potentially slightly longer under load.

**"Always Allow" rules in Buildor** become **"Always Route Through Pool"** — the user never sees a permission card, but the operation is still queued and scheduled. Buildor auto-approves the permission but still gates on the pool (skips step 4, still does steps 5-8).

**Note**: the PreToolUse `"ask"` hook is what forces Claude Code to emit permission requests. Buildor's own auto-approve logic is separate — it decides which of those requests to show the user vs silently approve. Both paths route through the pool.

**Resource key derivation** from tool requests:

| Tool | Command/Args | Derived Resource Key |
|------|-------------|---------------------|
| Bash | `git log --oneline` | `process/git/{cwd}` |
| Bash | `npm install` | `process/npm/{cwd}` |
| Bash | `cargo build` | `process/cargo/{cwd}` |
| Bash | `curl https://api.github.com/...` | `api/github.com` |
| Edit | (file path) | `fs/{parent_dir}` |
| Read | (file path) | `fs/{parent_dir}` |
| Glob | (pattern) | `fs/{base_dir}` |
| Grep | (pattern + path) | `fs/{search_dir}` |
| Write | (file path) | `fs/{parent_dir}` |
| WebFetch | `https://docs.rs/...` | `api/docs.rs` |

Derivation is pattern-matched from the tool name + first argument/command. A simple rule set, not AI inference. Unknown patterns fall back to a generic lane (e.g., `tool/{tool_name}`).

### Tier Assignment

| Source | Tier |
|--------|------|
| User clicks a UI button (commit, push, stage) | Tier 1 |
| Top-level Claude agent (direct user conversation) | Tier 1 |
| Subagent (spawned by another agent) | Tier 2 |
| Background Buildor operations (status polling, refresh) | Tier 2 |

### Other Integration Points

- Pool is a `LazyLock<OperationPool>` or Tauri managed state global
- Frontend is unaware — IPC commands behave the same, may just take longer under load
- Resource key derivation is a pure function — testable, no side effects

---

## Edge Cases

- **Queue overflow**: max queue depth per lane with backpressure — reject with "resource busy" if exceeded
- **Operation timeout**: per-op timeout prevents a hung process from blocking a lane forever. Timeout counts as failure for adaptive purposes
- **Graceful shutdown**: drain Tier 1 ops, cancel Tier 2 ops, join all threads, persist learned limits
- **Cold start**: first run on a new machine starts conservative (concurrency 1 everywhere), learns quickly under normal workload
- **Environment changes**: if a machine gets more/less RAM or the user upgrades, the adaptive system re-converges naturally. Multiplicative decrease handles degradation fast; additive increase probes improvements safely
- **Persisted limits stale**: if `pool_limits.json` was learned on a different machine (roaming profile), the system will hit failures and back off quickly — self-correcting
