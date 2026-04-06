# Pool Telemetry Stream

Real-time telemetry feed from the Operation Pool and Agent Mailbox, subscribable by a Claude session working on the Buildor codebase. This is a **development tool** — it exists so Claude can observe live scheduling/agent behavior instead of guessing.

## How It Works

Telemetry messages are injected into the subscribed Claude session's stdin via `send_message()`. They appear as user messages with `[TELEMETRY:...]` prefix. No new event channels, no frontend changes needed.

## How to Subscribe (from a Claude session)

Claude subscribes by emitting a marker in its text output. Buildor intercepts the marker and calls the Tauri command automatically:

```
-<*{ "action": "subscribe_telemetry", "streams": ["pool", "mailbox"] }*>-
```

To unsubscribe:
```
-<*{ "action": "unsubscribe_telemetry" }*>-
```

Once subscribed, telemetry lines arrive as user messages in the session every ~1 second. Claude reads them and can report on pool/mailbox state.

The `streams` field is optional — defaults to `["pool", "mailbox"]`. Use `["pool"]` or `["mailbox"]` to filter.

### Programmatic (frontend code)

```typescript
import { subscribeTelemetry, unsubscribeTelemetry } from '@/utils/commands/telemetry';

await subscribeTelemetry(sessionId, ['pool', 'mailbox']);
await unsubscribeTelemetry(sessionId);
```

The Tauri commands are `subscribe_telemetry` and `unsubscribe_telemetry`.

## Telemetry Line Format

### Pool (every ~1s, emitted every 10th tick)

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
- `fail:N` — failures drained this tick
- Lane format: `shortKey:aN,qT1/T2,cN` where a=active, q=queued(tier1/tier2), c=concurrency limit

### Mailbox (on event)

```
[TELEMETRY:mailbox] deposit agent="researcher" parent=abc123 status=completed mailbox=3
[TELEMETRY:mailbox] deps-met agent="analyzer" spawning deps=[researcher,collector] pending=0
[TELEMETRY:mailbox] abandoned agent="writer" failed-dep="analyzer" pending=1
```

## What Healthy Looks Like

- Pool ticks show `idle` with `sel:0 done:0` when nothing is happening
- When a git operation triggers, a lane appears, active goes to 1, then drops back
- Concurrency ramps: after 5 consecutive successes in a lane, `c` increments by 1
- Mailbox deposits show `status=completed` and pending count drops

## Red Flags

- Lane with `a0,qN/0,c1` (queued ops but nothing active, concurrency=1) — ops are stuck
- `fail:N` appearing repeatedly — something is failing and concurrency is halving
- `pool:1/N` with `sel:0` but lanes have queued ops — pool size collapsed
- Mailbox `pending=N` not decreasing — dependency deadlock or missing deposit
- Same lane key with active > concurrency — active_count leak (known gotcha, see `gotchas.md`)

## Testing Patterns

- Subscribe, then trigger a git status refresh (5s auto-poll) — should see `git/Buildor` lane pulse
- Spawn an agent, watch `llm/agent-*` lane appear, active=1, then complete
- Spawn two agents with dependency, watch first complete -> mailbox deposit -> second spawn
- Trigger pool pressure: multiple git ops + agent spawn simultaneously, watch tier priority

## Context Budget

Each telemetry line is ~100-150 tokens. A 60-second subscription = ~60 lines = ~8k tokens. Subscribe only when actively testing, unsubscribe immediately after.

## Architecture

- **Subscriber registry**: `src-tauri/src/telemetry.rs` — static `OnceLock<Mutex<HashMap>>`, stream-filtered subscriptions
- **Tauri commands**: `src-tauri/src/commands/telemetry.rs` — `subscribe_telemetry`, `unsubscribe_telemetry`
- **Pool emission**: `src-tauri/src/operation_pool/pool.rs` — `telemetry_snapshot()` method, emitted every 10th tick in `start_tick_loop`
- **Mailbox emission**: `src-tauri/src/commands/mailbox.rs` — deposit, deps-met, and abandoned events
- **Session cleanup**: `src-tauri/src/commands/claude.rs` — `unsubscribe()` called in `stop_session` and `stop_sessions_in_dir`
- **Frontend wrappers**: `src/utils/commands/telemetry.ts`
- **Lane key shortening**: `shorten_lane_key()` in pool.rs compresses resource keys for compact output

## Scope

This is NOT a UI panel, NOT persistent, NOT auto-subscribed. It's a live debug stream for Claude sessions working on the Buildor codebase. No telemetry data is stored — it's fire-and-forget into stdin.
