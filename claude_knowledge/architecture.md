# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────┐
│                   Buildor                      │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │           Rust Backend (Tauri)                │    │
│  │                                               │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │    │
│  │  │ Project  │ │   Git    │ │    Flow      │ │    │
│  │  │ Manager  │ │   Ops    │ │ Orchestrator │ │    │
│  │  └──────────┘ └──────────┘ └──────────────┘ │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │    │
│  │  │Worktree  │ │  Claude  │ │   Config     │ │    │
│  │  │ Manager  │ │  Process │ │   Manager    │ │    │
│  │  └──────────┘ └──────────┘ └──────────────┘ │    │
│  │  ┌──────────────────────────────────────────┐│    │
│  │  │         Window Manager                    ││    │
│  │  └──────────────────────────────────────────┘│    │
│  └──────────────┬──────────────────────────────-┘    │
│                 │ IPC (Tauri Commands)                │
│  ┌──────────────┴──────────────────────────────-┐    │
│  │          React Frontend (Webviews)            │    │
│  │                                               │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐ │    │
│  │  │Source  │ │ Code   │ │ Flow   │ │Claude │ │    │
│  │  │Control │ │ Viewer │ │Builder │ │ Chat  │ │    │
│  │  └────────┘ └────────┘ └────────┘ └───────┘ │    │
│  │  ┌────────┐ ┌────────┐ ┌────────────────────┐│    │
│  │  │Command │ │Project │ │ Worktree Manager   ││    │
│  │  │Palette │ │Switcher│ │        UI          ││    │
│  │  └────────┘ └────────┘ └────────────────────┘│    │
│  └──────────────────────────────────────────────-┘    │
└─────────────────────────────────────────────────────┘
```

## Data Flow

### Flow Execution
```
User selects flow (palette or flow builder)
  → App reads flow JSON from workflows repo
  → App resolves stage order (dependencies, parallel groups)
  → For each stage:
      → App reads scoped context files from ~/.buildor/
      → App assembles prompt (stage config + context)
      → App spawns Claude Code (SDK or terminal) with prompt
      → Claude does work in the project repo
      → App captures output, writes context file
      → App updates UI progress
  → Flow complete
```

### Skill Routing (Free-Form Chat)
```
User types message in Claude chat
  → App spawns Haiku subagent with message + skill descriptions
  → Haiku returns: relevant skill names (or none)
  → If match: app loads full skill prompt, injects into context
  → Message + optional skill context → Claude Code session
  → Response filtered (conversation mode vs verbose mode)
  → Displayed to user
```

### Multi-Window Communication
```
All windows share one Rust backend process
  → Windows communicate via Tauri events (pub/sub)
  → State changes in backend broadcast to relevant windows
  → Example: git commit in Source Control → Code Viewer refreshes
```

## Key Design Patterns

### Isolation
- Each Claude Code invocation is stateless — no conversation history between flow phases
- Context passes exclusively via files in `~/.buildor/`
- Each worktree gets its own Claude session scoped to its directory

### Session Continuity (stream-json protocol)
- **Interrupt**: `control_request` with `subtype: "interrupt"` stops the current turn without killing the process. Session stays alive with full context and prompt cache preserved.
- **Model switch**: `control_request` with `subtype: "set_model"` changes the model live without restarting. No context loss.
- **Only `/clear` and process exit** actually end a session. Stop/Escape and model switching keep the session alive.

### Separation
- Orchestration logic lives in Rust/JS application code, not in prompts
- UI rendering is decoupled from backend operations via Tauri IPC
- Workflow definitions (flows/skills) are separate from project code

### Efficiency
- App manages all pipeline state — no tokens spent on task management
- Haiku routing keeps skill injection cost minimal
- Context files are scoped — each phase only sees what it needs

---

## Tab System (replacing Router)

The main window uses a tab-based workspace instead of single-panel routing:

```
┌─────────────────────────────────────────────────────────┐
│ [Code Viewer - OptiAI] [SC - SideProject] [SC - OptiAI] │  ← tabs
├────┬────────────────────────────────────────────────────┤
│    │                                                     │
│ S  │  Active tab content                                 │
│ I  │                                                     │
│ D  │  (each tab is scoped to a project/worktree)         │
│ E  │                                                     │
│ B  │                                                     │
│ A  │                                                     │
│ R  │                                                     │
│    │                                                     │
├────┴────────────────────────────────────────────────────┤
│ branch | project | model | $cost | Plan | CTX ██ 72% | tokens | WK ██ 45% | reset │  ← StatusBar
└─────────────────────────────────────────────────────────┘
```

- Sidebar icons are **launchers**: click → dropdown of loaded projects → opens a new tab
- Each tab has a title like "Code Viewer - RepoName", an X to close
- Multiple tabs can be open for different projects/panels simultaneously
- Tab state managed in Zustand, not React Router

## Session Lifecycle

```
Start Session (modal)
  → Pick project
  → Pick base branch
  → Pick type (bug/feature/issue/docs/release)
  → Optional: GitHub issue number (downloads issue + images)
  → Haiku subagent generates slug
  → Branch: {type}-{base}/{issue#}/{slug}
  → git worktree add
  → Animation → Session created
  → Optional: Launch Claude Chat (breakout window, 50% screen)

During Session:
  → Claude Chat window scoped to worktree directory
  → Source Control tab scoped to worktree
  → Code Viewer tab scoped to worktree
  → Issue data in ~/.buildor/projects/{name}/sessions/{slug}/

Close Session:
  → git worktree remove
  → Delete session data (issue downloads)
  → Close associated tabs and Claude window
```

## Worktree Manager

Displays open sessions/worktrees grouped by project:
- Only shows projects that have open worktrees
- Close individual worktree, all in a project, or global close all
- Each entry shows: branch name, worktree path, type badge

## Claude Chat Context Injection

When Buildor starts a Claude Code session, it injects context at the top so Claude understands it is operating as Buildor. The injection layers are:

1. **Buildor identity** (`buildor_context.md`) — always injected. Tells Claude who it is, what it can do, what's planned. This file lives at the project root.
2. **Personality** — injected from user settings. The user selects a personality/tone in the Settings panel, and it gets prepended in parallel with the identity context.
3. **Project-scoped context** — stage prompts, skills, flow context files from `~/.buildor/` as needed.

The identity and personality layers are separate so personality is user-configurable without editing the core identity file.

4. **Active skill descriptions (Eyeball Mode)** — when skills are eyeball-activated in the palette, their names/descriptions are appended via `buildSystemPrompt({ activeSkills })`. This tells Claude what skills exist and where to read full content (`~/.buildor/skills/<name>/prompt.md`).

### Eyeball Mode — Silent Restart Flow

Toggling a skill eyeball triggers a silent session restart that bakes skill descriptions into the system prompt:

```
User clicks eyeball → handleToggleEyeball(name)
  → Save skill-activated/deactivated system-event marker
  → Emit skill-activated/deactivated event
  → Collect all user messages from current session
  → Interrupt + stop current Claude session
  → Build new system prompt with updated skill descriptions
  → Start new Claude session (new process, same chat history session ID)
  → Replay all user messages silently (replayingRef suppresses output)
  → Wait for each turn-completed event between replays
  → Resume normal output display
```

Key design choices:
- `replayingRef` flag in ClaudeChat suppresses all parsed output during replay — messages don't appear in UI or get saved to history
- Chat history session ID is maintained across restarts for continuity
- Persisted eyeball state (localStorage per project) is loaded on initial session start via `startClaude(dir, model, activeSkills)`
- Multiple skills compose naturally — all active descriptions are listed in system prompt

## Agent Pool Architecture

Buildor manages a flat agent pool — no hierarchy enforcement in the pool itself, just parent/child references.

```
Main Chat Session
  → Claude outputs marker: -<*{ "action": "spawn_agent", "name": "explorer", "prompt": "..." }*>-
  → parseClaudeStream detects marker, strips from display text
  → Calls spawnAgent() → Rust creates new Claude subprocess
  → Agent registered in static AGENT_POOL (Mutex<HashMap<String, AgentPoolEntryData>>)
  → Agent gets own claude-output-{sid} / claude-exit-{sid} events
  → On exit: mark_agent_exited() updates pool, emits agent-completed/failed
  → Result summary injected back into parent session via send_message()
```

Key design choices:
- **--disallowedTools Agent** on ALL sessions prevents Claude from using its native Agent tool — Buildor controls all agent spawning
- **Marker format** (`-<*{...}*>-`): JSON payload in text output, parsed by `agentMarker.ts`, stripped before display
- **Working dir inheritance**: agent inherits parent session's working directory if none specified
- **Agent system prompt**: tells Claude it's an agent, what its task is, that it can't spawn sub-agents
- **Session reuse**: agent sessions use the same `ClaudeSession` infrastructure as main sessions (shared stdin/stdout/stderr management)
- **Pool is flat**: all agents in one HashMap regardless of nesting depth; parent_session_id tracks lineage

## Agent Result Mailbox (Defacto Agent Communication)

The mailbox is Buildor's **standard inter-agent communication mechanism**. All agent results pass through it. All agent dependencies resolve through it. No other communication pattern should be used for agent-to-agent data sharing.

```
Agent A completes
  → mark_agent_exited(sid, success, output)
  → agents.rs deposits into mailbox
  → mailbox.rs writes ~/.buildor/agent-results/{sessionId}.json
  → mailbox.rs updates in-memory cache
  → emits agent-result-deposited event
  → check_pending_spawns(): scans pending queue
  → If Agent B was waiting on Agent A → deps met → spawn Agent B
  → Agent B's prompt is augmented with Agent A's output
```

**Storage**: JSON files at `~/.buildor/agent-results/{sessionId}.json`, backed by in-memory `Mutex<HashMap>` cache. Each entry stores: sessionId, name, parentSessionId, status, timestamps, output text, duration, model.

**Dependency resolution**: Agents can declare `dependencies: ["agent-name"]` in their spawn marker. The orchestrator checks the mailbox:
- All deps satisfied → spawn immediately with dependency outputs injected into prompt
- Missing deps → enqueue in `PENDING_SPAWNS` queue
- Failed dep → abandon the pending spawn, emit `agent-dependency-failed`

**Dependency context injection**: When a dependent agent spawns, its prompt is augmented with:
```
You have access to results from prerequisite agents:
--- Result from agent "data-collector" (status: completed) ---
{output text}
---

Your task:
{original prompt}
```

**Result capture**: The `useAgentPool` hook listens to `claude-output-{agentSessionId}` events, accumulates the last assistant text output, and passes it to `markAgentExited()` when the agent exits. The Rust backend then deposits it into the mailbox.

**Cleanup**: `purgeResults(parentSessionId)` called when the parent chat session ends — removes all result files and pending spawns for that parent.

**Marker format** for dependency-aware spawning:
```
-<*{ "action": "spawn_agent", "name": "analyzer", "prompt": "...", "dependencies": ["data-collector"] }*>-
```

**Key design choices**:
- File-backed, not SQLite — matches `~/.buildor/` convention, simple per-result files
- Dependency resolution in Rust — atomic, works even without frontend
- Name-based deps scoped to parent — prevents cross-session collisions
- Failed deps abandon pending spawns — no infinite waits

## Operation Pool (App-Global Scheduler)

Buildor routes all external-resource operations (git CLI, process spawns, shell commands, Claude sessions) through a single adaptive operation pool. This prevents resource saturation when multiple agents or UI actions hit the same resource concurrently.

```
Caller (git command, shell exec, agent spawn, etc.)
  → submit(resource_key, tier, operation) → oneshot::Receiver
  → Pool tick loop (100ms interval):
      Phase 1: drain completions → age queued ops → select candidates per lane → cross-lane pool cap
      Phase 2: spawn_blocking each selected op → await with timeout → record success/failure
  → Lane concurrency adapts (TCP slow start: +1 after N successes, halve on failure)
  → Pool size adapts similarly (global thread cap)
  → Limits persisted to pool_limits.json every 600 ticks (~60s)
```

**Resource keys** group operations into lanes. Derived automatically from tool name + context:
- `process/git/{cwd}` — git operations scoped by repo
- `process/npm/{cwd}`, `process/cargo/{cwd}` — package managers by project
- `api/{host}` — HTTP calls by domain (curl/wget/WebFetch)
- `fs/{parent_dir}` — file operations by directory
- `tool/{name}` — fallback for unknown tools

**Two-tier scheduling**: Tier 1 (User) base priority 100, Tier 2 (Subagent) base priority 0. Age cap prevents Tier 2 from ever exceeding Tier 1 priority. Within a lane, Tier 1 queue drains before Tier 2.

**Adaptive concurrency** (both pool-global and per-lane):
- Starts at `num_cpus/2` (pool) or 1 (lane)
- After `probe_threshold` (5) consecutive successes → increment by 1
- On any failure → halve (minimum 1)
- `max_seen_healthy` persisted and restored on restart (capped at `absolute_max`)

**Shutdown protocol**: persist limits → set shutdown flag → drop all Tier 2 queued ops → execute remaining Tier 1 inline (with panic recovery) → poll active ops for 10s → clear all lanes.

**Panic recovery**: `tick_phase1` wrapped in `catch_unwind` — on panic, all lane `active_count` reset to 0. `tick_phase2` spawned as a task — panics caught via `JoinHandle`. Shutdown drain uses `catch_unwind` per-op.

**Lock ordering** (deadlock prevention): lanes HashMap → individual lane → config → persisted → pool_size → completions. Never acquire a lower-numbered lock while holding a higher one.

**Integration**: `run_git()`, `execute_shell_command()`, `spawn_agent()`, `generate_slug()`, `start_session()`, `create_worktree()` all submit through the pool. Callers await the oneshot receiver transparently.

## Agent Health Monitoring (Phase 6)

```
AgentHealthMonitor (singleton class, one instance per agent)
  → Subscribes to tool-executing, tool-completed, message-received events for its agent
  → Tracks: lastActivityAt, lastActivityType, recentToolCalls (rolling window), consecutiveErrors
  → State machine:
      healthy → idle       (text output, no activity for idleSeconds, default 60)
      healthy → stalling   (mid-tool, no activity for stallSeconds, default 60)
      healthy → looping    (same tool+input appears loopThreshold times, default 3)
      healthy → erroring   (errorThreshold consecutive errors, default 3)
      any unhealthy → distressed (persists for distressSeconds, default 90)
  → Escalation:
      Has parent → inject [BUILDOR_ALERT] into parent stdin with marker options (kill/extend/takeover)
      No parent → emit user-attention-needed event
  → Thresholds configurable per skill via skill.json execution.health
  → Cleanup: monitor destroyed when agent completes/killed
```

Rust commands: `extend_agent` (resets health timers), `takeover_agent` (kills agent, generates summary, injects into parent)

### Health Monitor Hardening (Post-Phase-6)

After initial deployment, several false-positive scenarios were discovered and fixed:

- **Bumped default thresholds**: idle 30→60s, stall 30→60s, distress 45→90s — agents doing heavy analysis have natural gaps between outputs
- **Text output recovers ALL unhealthy states**: `onMessageReceived` now transitions from any unhealthy state back to healthy (was only stalling/looping)
- **Tool-in-flight tracking**: agents mid-tool-execution are alive — the monitor doesn't escalate while `toolInFlight` is true
- **Max tool in-flight timeout**: 120s ceiling prevents stuck `toolInFlight` flag from permanently suppressing health checks
- **Max silence ceiling**: 180s absolute — catches agents blocked on unhandled stdin that produce no events at all
- **PID liveness check**: `check_agent_alive` Rust command (Windows `tasklist` / Unix `kill -0`) verifies the process exists when unhealthy
- **content_block_delta events**: raw JSON parser in `useAgentPool` emits `message-received` for streaming text deltas, keeping `lastActivityAt` current during generation

## Agent Autonomy & Completion (Post-Phase-8)

### Auto-Accept Permissions
Agents are autonomous workers — they auto-approve all permission requests. `useAgentPool` intercepts `control_request/permission` events in the raw JSON parser and immediately responds via `respondToPermission` with the agent's own session ID. No permission cards are surfaced to the user for agent actions.

### Completion Detection via Result Event
In `--print stream-json` mode, Claude emits a `result` event (`success`/`failure`) but does NOT exit the process. Agent completion is detected by parsing the `result` event in the raw JSON listener, calling `markAgentExited()`, then stopping the orphaned process.

### Result-to-Caller Injection
When an agent completes, `useAgentPool` injects the result summary back into the parent session via `sendClaudeMessage()`. This closes the agent→parent handoff loop — the parent Claude session receives the agent's output as a new message and can continue its work.

### Nested Agent Support
Agents CAN spawn sub-agents via the marker protocol (`-<*{...}*>-`). The pool is flat — all agents regardless of nesting depth are in one HashMap. `AgentStatusCard` renders the full tree with no depth cap.

### Mailbox Draft Streaming
`update_agent_draft` Rust command writes incremental agent output to the mailbox every 10 seconds. If an agent crashes, the parent can read partial work from the draft. Draft timer is cleaned up on agent completion.

### Agent Transcript Persistence
Each agent gets a SQLite `chat_session` record on spawn. Parsed messages are saved to `chat_messages` via `saveChatMessage`. The "View transcript" action in `AgentsPanel` reads from the DB.

### Pool Cleanup
`clear_agents_for_parent` Rust command removes all pool entries for a parent session. Called when the main chat session exits (both in-app and breakout windows) to prevent stale agents appearing in subsequent sessions.

## Agent UI (Phase 7)

```
┌──────────────────────────────────────────┐
│ Chat area                                │
│                                          │
│ [AgentOutputBlock: "Agent: explorer"]    │  ← inline surfaced results
│                                          │
├──────────────────────────────────────────┤
│ [AgentStatusCard]                        │  ← pinned above input, auto-hides when empty
│   ● explorer — Reading foo.ts...         │
│   ● analyzer — Running cargo test...     │
├──────────────────────────────────────────┤
│ [Chat input]                             │
└──────────────────────────────────────────┘
```

- `useAgentPool` hook: subscribes to agent-spawned/completed/failed/health-changed/permission events, maintains live Map<string, AgentPoolEntry>
- `AgentStatusCard`: one row per top-level agent with status icon + name + truncated status line, accordion for children (max 2 levels)
- `AgentsPanel`: third right-side panel (28px collapsed / 250px expanded), active agents list + completed section, transcript viewer reuses ChatMessage component
- `AgentOutputBlock`: distinct visual treatment in chat stream (header badge, collapsible)
- Agent permissions: same PermissionCard but with "Agent: <name>" prefix, routed to correct subprocess

## Shared Skills Repository Sync (Phase 8)

```
App launch → getSyncStatus() → if configured → syncSkillsRepo() (background)
  → First time: git clone <url> ~/.buildor/skills/
  → Subsequent: git fetch + pull --ff-only
  → If diverged: return error, don't force
  → On success: emit skill-activated event → useSkills refreshes palette

Settings > Shared Skills:
  → Configure repo URL (HTTPS or SSH)
  → Sync Now button → clone or pull
  → Push Changes → git add -A && commit && push
  → Status display: cloned/not-cloned, clean/dirty, diverged, last synced, branch
```

- `defaults.json` at skills root provides org-wide fallback `model`, `effort`, `health` thresholds — individual skill.json values take precedence
- Existing local skills backed up and merged on first clone (non-conflicting only)
- Skill palette auto-refreshes after sync via event bus

## Chat History & Aware System

```
Message flow (real-time persistence):
  User sends message → saved to SQLite immediately
  Claude output event → parsed → saved to SQLite immediately
  Session end (stop/clear/exit/crash) → session.ended_at set

History browsing:
  History panel (right sidebar) → lists past sessions for project/worktree
  Click session → read-only transcript viewer
  Eyeball checkbox → multi-select for "Aware" injection

Aware injection:
  User checks eyeball on past sessions → sends message
  → buildAwareContext() runs:
    Small session (<=30 msgs) → full transcript injected
    Large session (>30 msgs) → cached summary + last 10% verbatim
  → Context prepended to message (invisible to user)
  → Claude told injection mode so it can say "check History panel" if info missing
```

**Storage**: `chat_sessions` and `chat_messages` tables in existing `logs.db` SQLite database. Messages use `ON DELETE CASCADE` — deleting a session removes all its messages.

**Image attachments**: Images pasted/dropped into chat are auto-compressed (canvas JPEG, progressive quality reduction) if >35KB. Stored to `{appData}/images/{sessionId}/{uuid}_{name}.ext`. Message content stores `{ type: 'image', text: filename, imagePath: absolutePath }` — the `imageDataUrl` (data URL) is only kept in-memory for the active session, never persisted to DB. Image files cleaned up alongside chat history on worktree close and project deletion (`delete_images_for_sessions()` called before DB CASCADE delete).

**Lifecycle**:
- Main chat history: scoped to project, deleted when project removed from Buildor
- Worktree history: scoped to worktree session ID, deleted when worktree closed
- Image files: follow same lifecycle as their parent session

**History injection instructions**: Centralized in `src/prompts/historyInjection.ts` — all prompt text for the aware system lives there (header, footer, injection mode labels, image markers). No hardcoded prompt strings in `buildAwareContext.ts`.

**Title generation**: Haiku generates <8 word title after 3rd user message, refreshes every 15th. Untitled sessions get retroactive titles on history panel load.
