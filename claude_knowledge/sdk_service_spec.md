# Claude SDK Service Specification

## Decision

Replace Rust-side raw CLI spawning (`std::process::Command("claude")`) with a Node.js Agent SDK service running as a Tauri sidecar. Validated via POC on 2026-04-05.

## Problems Solved

1. **CMD window flashing** — Claude Code's internal `child_process.spawn()` doesn't set `windowsHide: true`. Our `CREATE_NO_WINDOW` flag doesn't propagate to grandchildren. SDK's `spawnClaudeCodeProcess` with `windowsHide: true` does.
2. **Stdout backpressure (2x slowness)** — Current: Rust BufReader → Tauri emit() → webview IPC. Emit blocks when JS is busy, backs up Claude's stdout pipe, stalls Claude. SDK: manages pipe internally, streams typed messages via HTTP/SSE.
3. **Permission IPC overhead** — Current: Rust emit → JS parse → detect permission → IPC back → stdin write. SDK: PreToolUse hooks handle permissions in-process.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Buildor (Tauri)                 │
│                                              │
│  ┌──────────────┐    ┌───────────────────┐  │
│  │ Rust Backend  │◄──►│  React Frontend   │  │
│  │              │    │                   │  │
│  │  HTTP Client ─┼────►  SSE Listener     │  │
│  │  Health Mon  │    │  Permission UI    │  │
│  │  Sidecar Mgr │    │  Chat History     │  │
│  └──────┬───────┘    └───────────────────┘  │
│         │                                    │
│         │ HTTP/SSE (localhost:PORT)           │
│         ▼                                    │
│  ┌──────────────────────────────────────┐   │
│  │     SDK Service (Node.js sidecar)     │   │
│  │                                        │   │
│  │  Express/Fastify server                │   │
│  │  ├── POST /sessions          (create)  │   │
│  │  ├── GET  /sessions/:id/stream (SSE)   │   │
│  │  ├── POST /sessions/:id/message        │   │
│  │  ├── POST /sessions/:id/interrupt      │   │
│  │  ├── POST /sessions/:id/model          │   │
│  │  ├── DELETE /sessions/:id    (stop)    │   │
│  │  ├── GET  /sessions          (list)    │   │
│  │  ├── GET  /health                      │   │
│  │  └── POST /sessions/:id/permission     │   │
│  │                                        │   │
│  │  Agent SDK (query/ClaudeSDKClient)     │   │
│  │  ├── spawnClaudeCodeProcess            │   │
│  │  │   └── windowsHide: true             │   │
│  │  ├── PreToolUse hooks                  │   │
│  │  ├── PostToolUse hooks                 │   │
│  │  └── Notification hooks                │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## API Specification

### POST /sessions
Create a new Claude session. Returns session ID immediately, then stream via SSE.

**Request:**
```json
{
  "cwd": "/path/to/project",
  "model": "claude-sonnet-4-6",
  "systemPrompt": "You are...",
  "disallowedTools": ["Agent"],
  "allowedTools": ["Read", "Grep", "Glob"],
  "permissionMode": "hook"
}
```

**Response:**
```json
{ "sessionId": "uuid", "pid": 12345 }
```

**Permission modes:**
- `"hook"` — PreToolUse hook pauses, emits SSE `permission` event, waits for POST to `/sessions/:id/permission`
- `"auto"` — all tools auto-approved (for agents)
- `"readonly-auto"` — Read/Grep/Glob auto-approved, others go through hook

### GET /sessions/:id/stream
SSE stream of all session events. One connection per session.

**Event types:**
```
event: text
data: {"text": "Here are the files..."}

event: tool-use
data: {"name": "Glob", "id": "toolu_123", "input": {"pattern": "**/*.ts"}}

event: tool-result
data: {"toolUseId": "toolu_123", "content": "...", "isError": false}

event: permission
data: {"requestId": "perm_123", "toolName": "Bash", "input": {"command": "npm test"}, "description": "Run command: npm test"}

event: usage
data: {"inputTokens": 1234, "outputTokens": 567, "cacheReadTokens": 890}

event: cost
data: {"costUsd": 0.0234, "durationMs": 5000, "turns": 2}

event: result
data: {"subtype": "success", "costUsd": 0.0747, "durationMs": 6467, "turns": 3}

event: error
data: {"message": "Session failed: ..."}

event: notification
data: {"type": "permission_prompt", "message": "Claude needs permission"}

event: rate-limit
data: {"sessionUsagePercent": 45, "resetAt": "2026-04-05T12:00:00Z"}
```

### POST /sessions/:id/message
Send a user message (text or with images).

**Request:**
```json
{
  "text": "Find all TODO comments",
  "images": [
    {"mediaType": "image/png", "data": "base64..."}
  ]
}
```

### POST /sessions/:id/permission
Respond to a permission request.

**Request:**
```json
{
  "requestId": "perm_123",
  "approved": true,
  "alwaysAllow": false
}
```

### POST /sessions/:id/interrupt
Interrupt the current turn. Session stays alive with context preserved.

### POST /sessions/:id/model
Switch model mid-session.

**Request:**
```json
{ "model": "claude-opus-4-6" }
```

Note: SDK may not support this natively. Fallback: kill session, restart with new model + context replay.

### DELETE /sessions/:id
Stop and clean up a session.

### GET /sessions
List active sessions.

**Response:**
```json
[
  {"sessionId": "uuid", "pid": 12345, "cwd": "/path", "model": "claude-sonnet-4-6", "startedAt": "..."}
]
```

### GET /health
Service health check.

**Response:**
```json
{
  "status": "ok",
  "sessions": 3,
  "uptime": 3600,
  "memoryMB": 85,
  "sdkVersion": "0.2.92"
}
```

## Session Lifecycle

```
Rust: POST /sessions {cwd, model, systemPrompt}
  → Node creates session, returns {sessionId, pid}

Rust: connects to GET /sessions/:id/stream (SSE)
  → Forwards events to frontend via Tauri emit()
  → But now Rust reads from HTTP SSE (no pipe backpressure)
  → Node reads Claude's stdout at native speed

Frontend: user types message
  → Rust: POST /sessions/:id/message {text}

Frontend: permission card shown
  → Rust: POST /sessions/:id/permission {requestId, approved}

Frontend: user clicks stop
  → Rust: POST /sessions/:id/interrupt

Frontend: session ends / worktree closes
  → Rust: DELETE /sessions/:id
```

## Permission Flow (Detail)

```
Claude wants to run Bash("npm test")
  → SDK PreToolUse hook fires
  → Hook checks permissionMode:
    - "auto" → return allow immediately
    - "readonly-auto" + tool is Read/Grep/Glob → allow
    - "hook" → emit SSE "permission" event, block on Promise
  → Rust receives SSE "permission" event
  → Rust emits Tauri event to frontend
  → Frontend renders StickyPermissionCard
  → User clicks Approve
  → Frontend calls Rust command
  → Rust: POST /sessions/:id/permission {approved: true}
  → Node resolves the Promise in the hook
  → Hook returns {permissionDecision: "allow"}
  → Claude executes the tool
```

## Sidecar Management

### Startup
1. Tauri `setup()` hook spawns the Node sidecar
2. Rust health-checks `GET /health` with retry (max 10s)
3. If healthy → ready. If not → restart once, then show error to user.

### Health Monitoring
Three tiers, same pattern as agent health monitor:

1. **Heartbeat** — `GET /health` every 5s, must respond within 2s
2. **Session audit** — Compare Rust's session map vs Node's `/sessions` list. Reconcile mismatches (orphaned sessions, missing sessions).
3. **Process vitals** — `memoryMB` from health response. If > threshold (e.g., 500MB), warn. If > critical (1GB), restart.

### Restart
1. Kill existing Node process
2. Respawn via Tauri sidecar API
3. Recreate any active sessions (Rust knows the session configs)
4. Reconnect SSE streams
5. Log the restart event

### Shutdown
1. Tauri `on_exit` hook sends shutdown signal
2. Node gracefully stops all Claude sessions
3. Node exits
4. No orphaned processes (Tauri sidecar ensures this)

## What Changes in Rust

### Removed
- `start_session()` — no longer spawns `claude.exe` directly
- `start_agent_session_sync()` — same
- `send_message()` — replaced by HTTP POST
- `respond_to_permission()` — replaced by HTTP POST
- `interrupt_session()` — replaced by HTTP POST
- `set_session_model()` — replaced by HTTP POST
- `stop_session()` — replaced by HTTP DELETE
- stdout/stderr reader threads — Node handles this now
- Direct stdin writes — Node handles this now

### Added
- `SdkServiceClient` — HTTP client for the Node service
- `SdkSidecarManager` — start/stop/health-check the sidecar
- `SseStreamReader` — read SSE from Node, emit to frontend via Tauri events
- Tauri commands wrapping the HTTP calls (same frontend API surface)

### Unchanged
- `ClaudeSession` map in Rust (tracks session metadata)
- `add_permission_rule()` (still writes to `.claude/settings.local.json`)
- `query_claude_status()` (still reads credentials file)
- `run_claude_cli()` (still calls CLI for login/logout/version)
- Operation pool (still gates session spawns — now gates HTTP calls)
- All frontend code (same Tauri command API, same event names)

## What Changes in Frontend

**Nothing.** The Tauri command API stays identical. The event names stay identical. The frontend doesn't know or care whether events come from a Rust stdout reader or a Rust SSE reader. This is the key design goal — the migration is entirely behind the Rust ↔ Node boundary.

## Node Service Implementation

### Dependencies
- `@anthropic-ai/claude-agent-sdk` — Agent SDK
- `fastify` or plain `http` — HTTP server (minimize deps)
- No database — Rust owns all persistence

### Session State
```typescript
interface ManagedSession {
  id: string;
  pid: number;
  cwd: string;
  model: string;
  abortController: AbortController;
  sseClients: Set<ServerResponse>;  // connected SSE readers
  pendingPermissions: Map<string, {
    resolve: (decision: PermissionDecision) => void;
    timeout: NodeJS.Timeout;
  }>;
}
```

### Permission Hook Implementation
```typescript
const permissionHook: HookCallback = async (input, toolUseId, { signal }) => {
  const session = sessions.get(currentSessionId);
  if (!session) return {};

  // Check permission mode
  if (session.permissionMode === 'auto') {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  }

  const readOnly = ['Read', 'Grep', 'Glob'].includes(input.tool_name);
  if (session.permissionMode === 'readonly-auto' && readOnly) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  }

  // Emit SSE permission event and wait for response
  const requestId = `perm_${toolUseId}`;
  sendSSE(session, 'permission', {
    requestId,
    toolName: input.tool_name,
    input: input.tool_input,
  });

  // Block until POST /sessions/:id/permission resolves this
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      session.pendingPermissions.delete(requestId);
      resolve({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } });
    }, 300_000); // 5 min timeout

    session.pendingPermissions.set(requestId, {
      resolve: (decision) => {
        clearTimeout(timeout);
        session.pendingPermissions.delete(requestId);
        resolve({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: decision.approved ? 'allow' : 'deny',
          },
        });
      },
      timeout,
    });
  });
};
```

## Migration Plan

### Phase 1: Node Service (standalone)
Build the Node HTTP server with all endpoints. Test independently with curl/scripts.

### Phase 2: Rust Client
Replace `claude.rs` session functions with HTTP calls to the Node service. Add sidecar manager. Keep same Tauri command API surface.

### Phase 3: Frontend Adaptation
Minimal — update SSE event parsing if any event shape differences. Permission flow now goes through the new StickyPermissionCard → Rust → Node path.

### Phase 4: Agent Migration
Agents use the same service — POST /sessions with `permissionMode: "auto"`. Agent health monitoring moves from PID polling to session audit.

### Phase 5: Cleanup
Remove old stdout/stderr reader threads, raw stdin writes, direct process spawning from Rust. Remove POC directory.

## Bundling / Distribution

The Node service bundles into the Tauri installer as a sidecar:
- `resources/sdk-service/` — contains the bundled Node app (esbuild single-file or pkg binary)
- Tauri's sidecar config in `tauri.conf.json` points to it
- Auto-starts on app launch, auto-kills on app exit
- Port assigned dynamically, passed via environment variable

Alternative: compile to single executable with `pkg` or `bun build --compile` to avoid requiring Node.js on the user's machine.
