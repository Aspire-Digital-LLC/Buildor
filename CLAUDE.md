# Buildor

## Project Overview

Buildor is a cross-platform desktop application (Tauri v2 + React + Rust) that serves as a visual orchestrator and companion tool for Claude Code. It provides project management, git workflows, visual flow building, and a curated Claude Code interface — all while minimizing token usage and running entirely on a Claude subscription.

See `APP_BUILD_DESCRIPTION.md` for the full feature specification.

## First Steps — Every Session

1. Read `claude_knowledge/mind-map.json` to understand what knowledge files exist and their purpose
2. Check relevant knowledge files based on the current task
3. After writing code or discovering anything worth persisting, run the `/document` skill
4. To debug issues or review operations, run the `/read-logs` skill

## Tech Stack

- **Framework**: Tauri v2 (Rust backend + webview frontend)
- **Frontend**: React + TypeScript
- **Flow Builder**: React Flow
- **Code Viewer**: Monaco Editor (read-only) or Shiki
- **Diff Viewer**: Monaco diff editor
- **Terminal**: xterm.js + PTY
- **Git**: CLI via Rust subprocess
- **Claude Integration**: Claude Code SDK + embedded terminal (hybrid)

## Key Constraints

1. **Must run on Claude subscription** — no separate API keys. All Claude interactions go through Claude Code's auth.
2. **Token efficient** — app handles orchestration logic in Rust/JS, not in prompts. Claude only gets minimum context needed for actual work.
3. **Never touches project repos** — no files injected into user repositories. All state lives in `~/.buildor/`.
4. **Single install file** — OS-specific executables (.msi, .dmg, .AppImage/.deb).

## Project Structure

See `claude_knowledge/codebase_structure.md` for the full layout.

## Conventions

- All frontend code in `src/` (React + TypeScript)
- All backend code in `src-tauri/` (Rust)
- Shared types between frontend and backend via Tauri's command system
- Always use `#[serde(rename_all = "camelCase")]` on Rust structs crossing the IPC boundary
- Knowledge files in `claude_knowledge/` — update these when patterns, decisions, or gotchas are discovered
- Run `/document` after completing any meaningful work
- Update `claude_knowledge/project_status.md` at the end of each work session — mark completed items, add new in-progress/not-started items, note any new issues

## MANDATORY: Event System

When building features that produce significant state changes (tool executions, permissions, errors, completions), **emit events** via the Buildor event bus. See `claude_knowledge/events.md` for the full event type list and usage patterns.

```typescript
import { buildorEvents } from '@/utils/buildorEvents';
buildorEvents.emit('tool-executing', { toolName: 'Edit', toolUseId: '...' }, sessionId);
```

This decouples AI responses from UI behaviors — any component can subscribe to react (window blinking, notifications, progress updates) without hardcoding.

## MANDATORY: Logging Convention

**Every new feature that performs an operation (backend call, git command, file operation, Claude session, flow execution) MUST include logging.** This is not optional.

### How to log

Import the logging utility:
```typescript
import { logEvent } from '@/utils/commands/logging';
```

### Pattern for every async action:

```typescript
// After successful operation:
logEvent({
  sessionId: sessionId,          // optional — GUID from worktree session
  repo: repoPath,                // optional — which repo this relates to
  functionArea: 'source-control', // which app area (see list below)
  level: 'info',                 // info, warn, error, debug
  operation: 'commit',           // specific operation name
  message: 'Committed: fix bug (abc123)', // human-readable
  details: 'optional extra data',
  durationMs: endMs - startMs,   // optional — for timed operations
}).catch(() => {});               // ALWAYS .catch(() => {}) — never let logging break the app

// In error catches:
logEvent({
  repo: repoPath,
  functionArea: 'source-control',
  level: 'error',
  operation: 'commit',
  message: String(e),
}).catch(() => {});
```

### Function areas:
- `source-control` — git operations (commit, push, pull, stage, merge, etc.)
- `code-viewer` — file browsing, file reads
- `claude-chat` — Claude Code sessions
- `flow-builder` — flow execution, stage management
- `worktree` — worktree create/destroy/clean
- `project` — project add/remove/switch
- `system` — app lifecycle, config, updates

### Log levels:
- `debug` — verbose/frequent operations (e.g., status refresh every 5s)
- `info` — normal operations (commits, pushes, project adds)
- `warn` — recoverable issues (timeout, retry)
- `error` — failures

### Rules:
1. Always `.catch(() => {})` on logEvent calls — logging must never break functionality
2. Use `debug` level for high-frequency operations (polling, status checks)
3. Use `info` level for user-initiated actions
4. Include `durationMs` for any operation where timing matters (git commands, API calls, flow stages)
5. Include `sessionId` when operating within a worktree session context
6. Include `repo` when the operation relates to a specific repository
