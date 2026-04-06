# Pool Telemetry Stream — Build Specification

## Purpose

Provide a real-time telemetry feed from the Operation Pool and Agent Mailbox that can be subscribed to by the active Claude session working on the Buildor codebase. This is a **development tool** — it exists so that when Claude is modifying or debugging the scheduling/agent systems, it can observe live behavior instead of guessing.

This is NOT a UI panel, NOT a log, NOT a production monitoring feature. It is a live event stream injected into the Claude session's stdin on demand.

## How Claude Receives Telemetry

Buildor runs Claude via `--print --input-format stream-json --output-format stream-json`. Claude's process has:
- **stdout** → Tauri reads this (JSON lines), emits as `claude-output-{sessionId}` Tauri events → frontend parses via `parseClaudeStream.ts`
- **stdin** → Tauri writes to this via `send_message()` in `src-tauri/src/commands/claude.rs`. Claude sees each write as a new user message.

Telemetry injection uses the **stdin path**. When telemetry is active, Buildor periodically writes a telemetry message to the subscribed session's stdin. Claude receives it as a user message and can read the data.

This is the same mechanism used for agent result injection (`sendClaudeMessage()` in `useAgentPool.ts` calls `send_message` Tauri command).

## Architecture

```
Pool tick loop (every 100ms)
  → Every 10th tick (~1s): format telemetry snapshot
  → Check TELEMETRY_SUBSCRIBERS (static HashMap<String, TelemetrySubscription>)
  → For each subscriber: write formatted line to that session's stdin via send_message()

Mailbox deposit / dependency check
  → Format event line
  → Write to all subscribers via send_message()
```

### Key Design Decisions

1. **Injection via `send_message()`** — reuses existing infrastructure. No new event channels, no new frontend code.
2. **Subscriber is a session ID** — the Claude session that called `subscribe_telemetry` receives the data.
3. **Every 10th tick** — 1 line per second. Includes idle ticks (all zeros) so Claude can see that the pool IS running but nothing is happening. This distinguishes "idle" from "broken."
4. **Compact single-line format** — Claude's context window is the bottleneck. 60 seconds of telemetry = 60 lines. Must be terse.
5. **No frontend changes** — telemetry messages arrive as user messages in Claude's stdin. `parseClaudeStream.ts` doesn't need to know about them. The ClaudeChat UI will show them as user messages, but that's fine for a dev tool — this is only used when Claude is working on the Buildor repo itself.

## Rust Implementation

### New file: `src-tauri/src/telemetry.rs`

This module owns the subscriber registry and formatting logic.

```rust
use std::collections::HashMap;
use std::sync::Mutex;

static TELEMETRY_SUBSCRIBERS: std::sync::OnceLock<Mutex<HashMap<String, TelemetrySubscription>>> =
    std::sync::OnceLock::new();

pub struct TelemetrySubscription {
    pub session_id: String,
    pub streams: Vec<String>,       // ["pool", "mailbox"] or subset
    pub subscribed_at: String,       // ISO timestamp
}

fn get_subscribers() -> &'static Mutex<HashMap<String, TelemetrySubscription>> {
    TELEMETRY_SUBSCRIBERS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn has_subscribers() -> bool {
    let subs = get_subscribers();
    match subs.lock() {
        Ok(map) => !map.is_empty(),
        Err(_) => false,
    }
}

pub fn get_pool_subscribers() -> Vec<String> {
    let subs = get_subscribers();
    match subs.lock() {
        Ok(map) => map.values()
            .filter(|s| s.streams.contains(&"pool".to_string()))
            .map(|s| s.session_id.clone())
            .collect(),
        Err(_) => Vec::new(),
    }
}

pub fn get_mailbox_subscribers() -> Vec<String> {
    let subs = get_subscribers();
    match subs.lock() {
        Ok(map) => map.values()
            .filter(|s| s.streams.contains(&"mailbox".to_string()))
            .map(|s| s.session_id.clone())
            .collect(),
        Err(_) => Vec::new(),
    }
}

pub fn subscribe(session_id: String, streams: Vec<String>) {
    let subs = get_subscribers();
    if let Ok(mut map) = subs.lock() {
        map.insert(session_id.clone(), TelemetrySubscription {
            session_id,
            streams,
            subscribed_at: chrono::Utc::now().to_rfc3339(),
        });
    }
}

pub fn unsubscribe(session_id: &str) {
    let subs = get_subscribers();
    if let Ok(mut map) = subs.lock() {
        map.remove(session_id);
    }
}

/// Remove subscriptions for sessions that no longer exist.
/// Called periodically or when a session exits.
pub fn cleanup_dead_subscribers() {
    let subs = get_subscribers();
    if let Ok(mut map) = subs.lock() {
        let active_sessions: Vec<String> = {
            let sessions = crate::commands::claude::get_sessions();
            match sessions.lock() {
                Ok(m) => m.keys().cloned().collect(),
                Err(_) => return,
            }
        };
        map.retain(|sid, _| active_sessions.contains(sid));
    }
}
```

**Note to implementer**: `get_sessions()` in `claude.rs` is currently private. You'll need to either:
- Make it `pub(crate)`, or
- Add a `pub fn session_exists(id: &str) -> bool` helper in `claude.rs`

The second option is cleaner — avoids exposing the full sessions map.

### New Tauri commands: `src-tauri/src/commands/telemetry.rs`

```rust
#[tauri::command]
pub async fn subscribe_telemetry(session_id: String, streams: Option<Vec<String>>) -> Result<(), String> {
    let streams = streams.unwrap_or_else(|| vec!["pool".to_string(), "mailbox".to_string()]);
    crate::telemetry::subscribe(session_id, streams);
    Ok(())
}

#[tauri::command]
pub async fn unsubscribe_telemetry(session_id: String) -> Result<(), String> {
    crate::telemetry::unsubscribe(&session_id);
    Ok(())
}
```

Register in `commands/mod.rs` and `lib.rs` alongside the other commands.

### Modify: `src-tauri/src/operation_pool/pool.rs` — tick loop

In `start_tick_loop`, after `tick_phase2`, add telemetry emission every 10th tick:

```rust
tick_count += 1;

// Telemetry emission (every 10 ticks = ~1s)
if tick_count % 10 == 0 && crate::telemetry::has_subscribers() {
    let snapshot = pool_ref.telemetry_snapshot(tick_count, &selected_count, &completed_count, &failure_count);
    for sid in crate::telemetry::get_pool_subscribers() {
        // Fire-and-forget — telemetry must never block the tick loop
        let msg = snapshot.clone();
        let sid_clone = sid.clone();
        tauri::async_runtime::spawn(async move {
            let _ = crate::commands::claude::send_message(sid_clone, msg).await;
        });
    }
}
```

The snapshot variables (`selected_count`, `completed_count`, `failure_count`) need to be captured from tick_phase1 and tick_phase2. Currently these are computed but not retained. The tick loop needs minor restructuring to capture them:

```rust
// In tick_phase1, return additional metadata:
struct TickPhase1Result {
    selected: Vec<PendingOp>,
    completions_drained: usize,
}

// In tick_phase2, track outcomes:
struct TickPhase2Result {
    executed: usize,
    failures: usize,
    timed_out: usize,
}
```

Add a `telemetry_snapshot` method to `OperationPool`:

```rust
impl OperationPool {
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
            // Shorten key for readability: "process/git/C:/Git/Buildor" -> "git/Buildor"
            let short_key = shorten_lane_key(key);
            lane_parts.push(format!(
                "{}:a{},q{}/{},c{}",
                short_key,
                lane.active_count,
                q1, q2,
                lane.concurrency.current,
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
}

fn shorten_lane_key(key: &str) -> String {
    // "process/git/C:/Git/Buildor" -> "git/Buildor"
    // "llm/agent-researcher" -> "llm/agent-researcher"
    // "fs//src/components" -> "fs/components"
    if let Some(rest) = key.strip_prefix("process/") {
        // "git/C:/Git/Buildor" -> take tool + last path segment
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
```

### Modify: `src-tauri/src/commands/mailbox.rs` — deposit and dependency events

In `deposit_result_internal`, after the `app.emit` call, add:

```rust
if crate::telemetry::has_subscribers() {
    let msg = format!(
        "[TELEMETRY:mailbox] deposit agent=\"{}\" parent={} status={} mailbox={}",
        &entry.name,
        entry.parent_session_id.as_deref().unwrap_or("none"),
        &entry.status,
        get_mailbox().lock().map(|m| m.len()).unwrap_or(0),
    );
    for sid in crate::telemetry::get_mailbox_subscribers() {
        let msg_clone = msg.clone();
        let sid_clone = sid.clone();
        tauri::async_runtime::spawn(async move {
            let _ = crate::commands::claude::send_message(sid_clone, msg_clone).await;
        });
    }
}
```

In `check_pending_spawns`, after spawning a ready agent:

```rust
// Inside the spawn thread, after successful spawn:
if crate::telemetry::has_subscribers() {
    let msg = format!(
        "[TELEMETRY:mailbox] deps-met agent=\"{}\" spawning deps=[{}] pending={}",
        name,
        ps.dependencies.join(","),
        get_pending().lock().map(|q| q.len()).unwrap_or(0),
    );
    for sid in crate::telemetry::get_mailbox_subscribers() {
        // ... send_message pattern
    }
}
```

And for abandoned spawns:

```rust
// After the agent-dependency-failed emit:
if crate::telemetry::has_subscribers() {
    let msg = format!(
        "[TELEMETRY:mailbox] abandoned agent=\"{}\" failed-dep=\"{}\" pending={}",
        ps.name,
        failed_dep,
        queue.len(), // still have the lock at this point
    );
    // ... send to subscribers
}
```

### Modify: `src-tauri/src/commands/claude.rs` — cleanup on session exit

When `stop_session` is called, clean up telemetry subscriptions:

```rust
pub async fn stop_session(session_id: String) -> Result<(), String> {
    // Existing code...
    crate::telemetry::unsubscribe(&session_id);
    // ... rest of existing code
}
```

Also in `stop_sessions_in_dir`, add cleanup for each removed session.

## Telemetry Line Format Reference

### Pool (every ~1s)

```
[TELEMETRY:pool] tick:1450 idle pool:3/4 sel:0 done:0 fail:0 | no-lanes
[TELEMETRY:pool] tick:1460 exec pool:3/4 sel:2 done:1 fail:0 | git/Buildor:a1,q0/0,c2 | llm/agent-x:a1,q0/0,c1
[TELEMETRY:pool] tick:1470 cleanup pool:2/4 sel:0 done:2 fail:1 | git/Buildor:a0,q0/0,c1
```

Field reference:
- `tick:N` — monotonic tick counter
- `idle`/`exec`/`cleanup` — pool state this tick
- `pool:current/maxSeen` — global adaptive pool size
- `sel:N` — ops dispatched this tick
- `done:N` — completions drained this tick
- `fail:N` — failures this tick
- Lane format: `shortKey:aN,qT1/T2,cN` where a=active, q=queued(tier1/tier2), c=concurrency limit

### Mailbox (on event)

```
[TELEMETRY:mailbox] deposit agent="researcher" parent=abc123 status=completed mailbox=3
[TELEMETRY:mailbox] deps-met agent="analyzer" spawning deps=[researcher,collector] pending=0
[TELEMETRY:mailbox] abandoned agent="writer" failed-dep="analyzer" pending=1
```

## Frontend Wiring

### New file: `src/utils/commands/telemetry.ts`

```typescript
import { invoke } from '@tauri-apps/api/core';

export async function subscribeTelemetry(
  sessionId: string,
  streams?: string[],
): Promise<void> {
  return invoke('subscribe_telemetry', { sessionId, streams });
}

export async function unsubscribeTelemetry(
  sessionId: string,
): Promise<void> {
  return invoke('unsubscribe_telemetry', { sessionId });
}
```

### No other frontend changes required

Telemetry messages arrive as user messages on Claude's stdin. They flow through the existing `claude-output-{sid}` → `parseStreamEvent` → chat messages pipeline. They will appear in the chat UI as user messages with the `[TELEMETRY:...]` prefix. This is acceptable for a dev tool.

## Registration

### `src-tauri/src/commands/mod.rs`
Add: `pub mod telemetry;`

### `src-tauri/src/lib.rs`
Add to module declarations: `mod telemetry;`
Add to `generate_handler![]`:
```rust
commands::telemetry::subscribe_telemetry,
commands::telemetry::unsubscribe_telemetry,
```

## Knowledge File for Claude

After building, create `claude_knowledge/telemetry.md` with the following content. This file teaches Claude (when working in the Buildor repo) how to use the telemetry system.

The knowledge file should contain:

1. **What it is**: A live stream of Operation Pool and Mailbox state, injected into your session as user messages.

2. **How to subscribe**: Call `subscribeTelemetry(sessionId, ["pool", "mailbox"])` via tool call. You need your own session ID — Buildor injects this as part of the chat context (available in the session metadata).

3. **How to unsubscribe**: Call `unsubscribeTelemetry(sessionId)`. Also auto-cleans up when your session exits.

4. **What healthy looks like**:
   - Pool ticks show `idle` with `sel:0 done:0` when nothing is happening
   - When you trigger a git operation, a lane appears, active goes to 1, then drops back to 0
   - Concurrency ramps: after 5 consecutive successes in a lane, `c` increments by 1
   - Mailbox deposits show `status=completed` and pending count drops

5. **Red flags**:
   - A lane with `a0,qN/0,c1` (queued ops but nothing active, concurrency=1) — ops are stuck
   - `fail:N` appearing repeatedly — something is failing and concurrency is halving
   - `pool:1/N` with `sel:0` but lanes have queued ops — pool size collapsed
   - Mailbox `pending=N` not decreasing — dependency deadlock or missing deposit
   - Same lane key appearing with active > concurrency — active_count leak (known gotcha, see `gotchas.md`)

6. **Testing patterns**:
   - Subscribe, then trigger a git status refresh (5s auto-poll) — should see `git/Buildor` lane pulse
   - Spawn an agent, watch `llm/agent-*` lane appear, active=1, then complete
   - Spawn two agents with dependency, watch first complete → mailbox deposit → second spawn
   - Trigger pool pressure: multiple git ops + agent spawn simultaneously, watch tier priority

7. **Context budget**: Each telemetry line is ~100-150 tokens. A 60-second subscription = ~60 lines = ~8k tokens. Subscribe only when actively testing, unsubscribe immediately after.

## Update mind-map.json

Add an entry to the files array:

```json
{
  "file": "telemetry.md",
  "description": "Pool telemetry stream — how to subscribe, read, and diagnose Operation Pool and Mailbox behavior in real-time during development",
  "keywords": ["telemetry", "pool", "mailbox", "subscribe", "monitor", "diagnose", "debug", "queue", "lane", "concurrency", "tick"]
}
```

Also add to `pool_telemetry_spec.md` entry:

```json
{
  "file": "pool_telemetry_spec.md",
  "description": "Build specification for the pool telemetry stream feature — implementation details for Rust backend, Tauri commands, and injection mechanism",
  "keywords": ["telemetry", "spec", "build", "implementation", "pool", "mailbox", "stream"]
}
```

## Scope Boundaries

**In scope:**
- `telemetry.rs` module (subscriber registry)
- `commands/telemetry.rs` (subscribe/unsubscribe Tauri commands)
- Tick loop modification in `pool.rs` (10-tick telemetry emission)
- Mailbox telemetry emission in `mailbox.rs` (deposit, deps-met, abandoned)
- `src/utils/commands/telemetry.ts` (frontend invoke wrappers)
- Session cleanup on exit
- `claude_knowledge/telemetry.md` (usage documentation)
- Mind-map update

**Out of scope:**
- UI panels or visual display of telemetry
- Telemetry persistence (no SQLite, no files)
- Auto-subscribe behavior
- Configurable tick interval for telemetry (hardcoded to every 10 ticks)
- Telemetry for agent health monitor events (future addition)

## File Checklist

| File | Action | Description |
|------|--------|-------------|
| `src-tauri/src/telemetry.rs` | Create | Subscriber registry, has_subscribers, get_*_subscribers, subscribe, unsubscribe, cleanup |
| `src-tauri/src/commands/telemetry.rs` | Create | subscribe_telemetry, unsubscribe_telemetry Tauri commands |
| `src-tauri/src/commands/mod.rs` | Modify | Add `pub mod telemetry;` |
| `src-tauri/src/lib.rs` | Modify | Add `mod telemetry;` at top, add both commands to generate_handler |
| `src-tauri/src/operation_pool/pool.rs` | Modify | Capture tick metrics, emit telemetry snapshot every 10th tick, add telemetry_snapshot method and shorten_lane_key helper |
| `src-tauri/src/commands/mailbox.rs` | Modify | Emit telemetry on deposit, deps-met, and abandoned events |
| `src-tauri/src/commands/claude.rs` | Modify | Add `pub fn session_exists(id: &str) -> bool` helper, add `unsubscribe` call in stop_session and stop_sessions_in_dir |
| `src/utils/commands/telemetry.ts` | Create | subscribeTelemetry, unsubscribeTelemetry invoke wrappers |
| `claude_knowledge/telemetry.md` | Create | Usage guide for Claude when working in Buildor repo |
| `claude_knowledge/mind-map.json` | Modify | Add entries for telemetry.md and pool_telemetry_spec.md |
