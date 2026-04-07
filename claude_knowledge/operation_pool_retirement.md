# Operation Pool — Retirement Record

## What It Was

The Operation Pool was an app-global, self-tuning concurrency scheduler built in Rust (~1500 lines). It managed all operations that spawned or communicated with Claude Code processes.

### Architecture
- **Adaptive concurrency**: TCP slow-start inspired algorithm. Started at `physical_cores / 2`, grew on success, shrank on failure, capped at `physical_cores`.
- **Resource lanes**: Operations were keyed by resource (e.g., `llm/{session_id}`, `tool/Bash/C:/Git/Repo`). Each lane had independent concurrency limits.
- **Three-tier scheduling**: App tier (highest) > User tier > Subagent tier. Higher tiers got priority in the queue.
- **Tick-based execution**: A 100ms tick loop selected candidates from queues and dispatched them via oneshot channels.
- **Telemetry**: Real-time subscription system for monitoring pool state (queue depths, lane concurrency, active operations).
- **Persisted limits**: `pool_limits.json` saved max-seen-healthy concurrency across restarts.

### Files (Deleted)
```
src-tauri/src/operation_pool/
├── mod.rs           — module exports, Tier enum, PendingOp
├── pool.rs          — OperationPool struct, submit(), tick phases, shutdown
├── lane.rs          — Lane struct, queue management, candidate selection
├── adaptive.rs      — AdaptiveLimit (slow-start/backoff algorithm)
├── config.rs        — PoolConfig, LaneOverride, defaults
└── resource_key.rs  — Resource key derivation from tool inputs
```

## Why It Was Built (2026-03-28)

The pool solved three problems in the original architecture where Rust spawned `claude.exe` directly via `std::process::Command`:

1. **Stdout backpressure**: Each Claude process had a `BufReader` → `Tauri emit()` loop. When the webview's JS thread was busy (React rendering, SQLite writes), `emit()` blocked, backing up Claude's stdout pipe. Once the pipe buffer filled (~4KB on Windows), Claude's process itself blocked on write. This turned a 13-minute task into 24 minutes.

2. **Concurrent process spawning**: Multiple agents + main chat could spawn unlimited Claude processes simultaneously, thrashing CPU and memory.

3. **Permission IPC flooding**: Every tool permission went through `emit → JS → IPC → stdin` with no rate limiting. Under heavy load with many concurrent tool calls, the permission roundtrip could stall for seconds.

## Why It Was Removed (2026-04-06)

The SDK service migration (Phase 2) eliminated all three original problems:

1. **Stdout backpressure — gone**: The Node SDK service reads Claude's stdout internally. Rust reads from SSE over HTTP — no pipe, no backpressure, no blocking emit.

2. **Process management — moved to Node**: Claude processes are owned by the Node service. Rust makes HTTP calls (milliseconds), not process spawns (heavy).

3. **Permission flow — changed**: PreToolUse hooks in the Node service handle permissions in-process. No stdin/stdout roundtrip.

### The Deadlock Problem

The pool introduced a new problem in the SDK architecture: **permission response deadlock**. When all pool slots were occupied by agent operations waiting for permission approval, the permission responses themselves queued behind the operations they were supposed to unblock. The pool prevented permission cards from being resolved.

### Why Not Fix It?

Options considered:
- **Reserved capacity**: Keep N slots for permission responses → adds complexity to a system solving a nonexistent problem
- **Preemption**: Pause running operations to let permissions through → HTTP calls can't be paused
- **Bypass for permissions**: Pull permissions out of the pool → the pool then only gates session creation HTTP calls, which are milliseconds

All options added complexity to infrastructure that no longer served its original purpose. The pool was gating HTTP calls to a localhost service, not managing system resources.

## What Replaced It

**Nothing.** Direct async HTTP calls to the SDK service. No concurrency limiting, no scheduling, no tiers.

- Session creation: `sdk_client::create_session().await` — direct
- Permission responses: `sdk_client::send_permission().await` — direct
- Agent spawning: `sdk_client::create_session().await` — direct
- Tool execution: managed by Claude Code internally, invisible to Rust

### Resource Management

Machine resources (CPU, memory) are self-regulating:
- The OS time-slices across concurrent Claude processes
- Heavy agent swarms (10+ agents) run slower but don't crash
- Users experience natural degradation and adjust behavior
- If explicit limits are ever needed, they belong in the Node service (which owns the processes)

### What Was Lost

- **Operation ordering**: App tier no longer prioritized over Subagent tier. All HTTP calls are equal.
- **Telemetry**: No real-time pool state monitoring. The Node service's `/health` endpoint partially replaces this (session count, memory).
- **Adaptive concurrency**: No automatic tuning based on success/failure rates.

These were valuable features in the old architecture. If needed in the future, they should be implemented in the Node service (which owns the resources) or as Buildor orchestration policy (which decides what to start), not as a Rust-side HTTP call scheduler.

## Timeline

| Date | Event |
|---|---|
| 2026-03-28 | Pool designed and implemented (operation_pool_spec.md) |
| 2026-04-03 | Multi-agent orchestration retrospective identified pool as key infrastructure |
| 2026-04-05 | Stdout backpressure identified as 2x slowness cause; pool doesn't fix it |
| 2026-04-05 | SDK service POC validated; architecture decision to migrate |
| 2026-04-06 | SDK Phase 1 (Node service) + Phase 2 (Rust integration) completed |
| 2026-04-06 | Permission deadlock discovered during agent swarm test |
| 2026-04-06 | Pool removed — direct HTTP calls replace all pool-gated operations |
