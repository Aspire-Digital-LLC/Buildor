# SDK Migration — Current State (2026-04-06)

## What's Done

### Phase 1: Node SDK Service (COMPLETE)
- `src-tauri/sdk-service/` — standalone HTTP server wrapping Claude Agent SDK
- 11/11 smoke tests passing
- Endpoints: POST/GET/DELETE /sessions, GET /stream (SSE), POST /message, /permission, /interrupt, /model, GET /health

### Phase 2: Rust Integration (COMPLETE but with open bugs)
- `sdk_client.rs` — HTTP client for all SDK service endpoints
- `sdk_sidecar.rs` — Node process lifecycle (start, health, restart, shutdown)
- `sdk_sse.rs` — SSE stream reader bridging to Tauri events
- `claude.rs` — 11 functions replaced with HTTP calls
- `agents.rs` — spawn_agent uses SDK service
- Operation pool removed (~1500 lines deleted)
- Junction fix for worktree node_modules deletion

### What Works
- Sidecar starts and stays healthy
- Sessions create successfully
- SSE bridge streams events (no more 30s timeout)
- No CMD window flashing (windowsHide works)
- Agent spawning creates sessions on SDK service
- Chat messages flow through the system
- Session titles generate (call_haiku async fix)

## Open Bug: Permission Cards Don't Dismiss

### Symptom
- Permission cards appear in the sticky zone with FIFO counter (1/N)
- Clicking Approve/Always Allow/Deny does nothing — card stays
- Agents complete their work without waiting for approval
- More permissions queue up than there are agents (e.g., 9 for 6 agents)

### What We Proved (POC: test/perm-test.ts)
- `canUseTool` callback IS called by the SDK (confirmed)
- `canUseTool` DOES block tool execution (5s delay proved it)
- SDK does NOT emit `control_request` events when `canUseTool` is provided (no double-emit)
- The `requestId` we generate in our handler is the one to match on

### What We Suspect
The `canUseTool` callback works in isolation (POC) but something about how sessions are created in production causes it to not block. Possible causes:

1. **useAgentPool.ts auto-approve racing** — Lines 203-219 of `useAgentPool.ts` auto-approve agent permissions via `respondToPermissionPooled`. When the SSE event arrives, `useAgentPool` catches it and auto-approves before the user sees it. This was the OLD behavior for agents. With canUseTool, the permission events come from our handler (not Claude Code's stdout), but `useAgentPool` might still be intercepting and auto-approving them.

2. **requestId mismatch** — Our `canUseTool` handler generates a `randomUUID()` as requestId. The frontend receives this via SSE and stores it. When the user clicks Approve, the frontend sends this requestId to Rust, which POSTs to `/sessions/:id/permission`. But the session_id mapping (Rust UUID → SDK session ID) might fail if the session was cleaned up.

3. **Session already closed** — Agents complete quickly. By the time the user clicks Approve, the agent's session may be destroyed. The Rust session map lookup fails silently (the StickyPermissionCard's handleResponse catches errors silently).

### Key Code Paths

**Permission emission (Node service):**
```
sdk-runner.ts: query() with canUseTool option
  → permission-gate.ts: createCanUseToolHandler(session)
    → generates requestId (randomUUID)
    → sendSSE(session, "claude-output", buildPermissionRequest(...))
    → blocks on Promise stored in session.pendingPermissions[requestId]
```

**Permission reception (Frontend):**
```
sdk_sse.rs: reads SSE event "claude-output" with control_request JSON
  → emits Tauri event "claude-output-{tauri_session_id}"
  → parseClaudeStream.ts: detects control_request, extracts requestId
  → ClaudeChat.tsx: adds to permissionQueue (PermissionQueueEntry)
  → OR useAgentPool.ts: detects agent permission, auto-approves via respondToPermissionPooled
  → StickyPermissionCard: renders from permissionQueue[0]
```

**Permission response (Frontend → Node):**
```
StickyPermissionCard: handleResponse(approved)
  → respondToPermissionPooled(effectiveSessionId, requestId, approved, ...)
  → Rust: claude.rs respond_to_permission_pooled
    → looks up sdk_session_id from SESSIONS map
    → sdk_client::send_permission(sdk_session_id, requestId, approved, false)
  → Node: routes/sessions-permission.ts
    → resolvePermission(session, requestId, decision)
    → resolves the Promise in pendingPermissions[requestId]
  → canUseTool returns { behavior: "allow" }
  → tool executes
```

**Most likely failure point:** Step where useAgentPool.ts auto-approves agent permissions. Check lines 203-219 of useAgentPool.ts — it calls `respondToPermission` for ALL agent permission events, bypassing the StickyPermissionCard entirely. This was correct in the old architecture (agents auto-approve), but now it may be sending the response via the wrong path (old stdin protocol vs new HTTP POST).

### Next Investigation Steps
1. Check `useAgentPool.ts` lines 200-220 — does it auto-approve agent permissions? If so, that explains why agents complete without user clicking Approve
2. If it does auto-approve, the response goes through `respondToPermissionPooled` → Rust → HTTP POST to Node service. Check if this path works or fails silently
3. For the MAIN CHAT (not agents), permissions should show cards. Test with a simple non-agent prompt like "run echo hello"
4. Add console.log to StickyPermissionCard's handleResponse to see if it fires on click
5. Add console.log to the Node service's resolvePermission to see if the POST arrives

## Architecture Summary (Current)

```
Frontend (React)
  ├── ClaudeChat.tsx — listens on claude-output-{id} Tauri events
  ├── useAgentPool.ts — listens on claude-output-{agentId}, AUTO-APPROVES permissions
  ├── StickyPermissionCard — shows permission cards from queue
  └── parseClaudeStream.ts — parses NDJSON, emits buildorEvents
        ↕ Tauri IPC (invoke + events)
Rust Backend (Tauri)
  ├── claude.rs — HTTP calls to SDK service (start, message, permission, stop)
  ├── agents.rs — agent spawning via SDK service
  ├── sdk_client.rs — reqwest HTTP client
  ├── sdk_sse.rs — SSE reader → Tauri event bridge
  └── sdk_sidecar.rs — Node process lifecycle
        ↕ HTTP / SSE (localhost:3456)
Node SDK Service
  ├── sdk-runner.ts — query() with canUseTool callback
  ├── permission-gate.ts — canUseTool handler, blocks on Promise
  ├── session-stream.ts — SSE broadcasting
  └── wire-format.ts — builds control_request JSON
        ↕ SDK API
Claude Code (claude.exe)
  └── spawned with windowsHide: true
```

## Files Modified in This Session
- `src-tauri/src/sdk_client.rs` — NEW: HTTP client
- `src-tauri/src/sdk_sidecar.rs` — NEW: sidecar lifecycle
- `src-tauri/src/sdk_sse.rs` — NEW: SSE bridge
- `src-tauri/src/commands/claude.rs` — MODIFIED: HTTP calls replace stdin/stdout
- `src-tauri/src/commands/agents.rs` — MODIFIED: SDK service for agent spawning
- `src-tauri/src/commands/worktree.rs` — MODIFIED: junction fix
- `src-tauri/src/commands/chat_history.rs` — MODIFIED: async call_haiku
- `src-tauri/src/lib.rs` — MODIFIED: sidecar startup, pool removed
- `src-tauri/src/operation_pool/` — DELETED: entire module
- `src-tauri/sdk-service/src/permission-gate.ts` — MODIFIED: canUseTool instead of hooks
- `src-tauri/sdk-service/src/sdk-runner.ts` — MODIFIED: hooks removed
- `src/components/claude-chat/StickyPermissionCard.tsx` — MODIFIED: tiered sticky zone
- `src/components/claude-chat/ChatMessage.tsx` — MODIFIED: inline perms suppressed
- `src/components/claude-chat/ClaudeChat.tsx` — MODIFIED: typed permission queue
