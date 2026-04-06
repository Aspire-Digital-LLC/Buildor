# Project Status

## Current Phase: Claude Integration & Multi-Branch Workflows

### Completed
- [x] App concept and feature spec (APP_BUILD_DESCRIPTION.md)
- [x] Tech stack: Tauri v2 + React + TypeScript + Rust
- [x] Project scaffolded, compiles clean (TS + Rust)
- [x] App launches with `npx tauri dev`, window auto-centers on screen
- [x] Git repo: Aspire-Digital-LLC/Buildor on main
- [x] Dark UI with SVG line icons in sidebar
- [x] Native window title bar: "Buildor v0.0.5"
- [x] **Tab system**: VS Code-style tabs with panel-type SVG icons (SC, CV, Chat, Worktrees, Settings), sidebar icons are project-aware launchers with grouped dropdowns, multiple tabs open simultaneously, TabContext provides project+browsePath+browseBranch scoping
- [x] **Project Manager**: add/remove projects, GitHub-style language bars, safety modal warns about uncommitted/unpushed worktree work before removal, auto-cleanup of worktrees+sessions on removal
- [x] **Code Viewer**: file tree, Monaco syntax highlighting, Edit/Save/Cancel, multi-source browsing (main repo + worktrees), branch status bar with "CHECKED OUT"/"WORKTREE" label, no change count badges in dropdown
- [x] **Branch Switcher**: slide-up panel from branch status bar (checked-out only), search/filter, local+remote branches, checkout updates all related tabs + change counts immediately via branch-switched event
- [x] **Source Control**: git status, staged/unstaged/untracked, commit, push/pull, auto-refresh 5s, browsePath-aware for worktrees, per-branch change count badges in dropdown, discard for both tracked and untracked files
- [x] **Source Control hamburger menu**: switch/create/delete branch, merge, rebase, stash/pop, fetch, undo last commit, revert last push
- [x] **Diff viewer**: side-by-side Monaco DiffEditor, Stage/Unstage/Discard buttons, discard works for untracked files (deletes them safely)
- [x] **Logging system**: SQLite at %APPDATA%/Buildor/logs.db, session_id correlation, duration_ms timing
- [x] **Settings panel**: sidebar with Projects + Logs sections, log viewer with filtering
- [x] **Start Session modal**: project picker, base branch, type radio, Haiku slug generation, worktree creation
- [x] **Worktree Manager panel**: list open sessions grouped by project, close individual/per-project/global, force-close for sessions with uncommitted/unpushed work
- [x] **Claude Chat (in-app)**: full rich UI in main app tab, scoped to checked-out branch per project, auto-starts session, slash commands, model picker, permission cards, sidebar dropdown shows only checked-out branches (no worktrees)
- [x] **Claude Chat (breakout window)**: separate Tauri window for worktree sessions, same rich UI
- [x] **Slash command autocomplete**: type / in chat input for menu — /model (model picker with session restart + context replay), /login, /logout (browser OAuth via subprocess), /clear, /cost, /help
- [x] **Claude Permission Cards**: interactive Approve/Always Allow/Deny buttons, control_request/control_response protocol with updatedInput echo
- [x] **Always Allow persistence**: saves permission rules to .claude/settings.local.json
- [x] **Collapsible Skills & Flows palette**: right-side panel, collapses to thin vertical bar with sideways text, click to expand/collapse
- [x] **Event system**: buildorEvents bus (permissions, costs, branch-switched, turn-completed, usage-updated)
- [x] **StatusBar**: VS Code-style full-width bottom bar — plan badge (reads ~/.claude/.credentials.json), CTX % (per-session, from stream tokens), session usage % + reset time, weekly usage % + reset time. Claude sparkle icon (right corner) — slashed when logged out, solid when logged in, click opens login or settings. Usage polling via hidden webview every 60s.
- [x] **Claude Account (Settings)**: Login via Tauri webview to claude.ai, captures org ID + usage data. Account section shows plan, usage bars with Refresh, sign out. Session stored at %APPDATA%/Buildor/claude_session.json.
- [x] **Usage data pipeline**: Hidden webview polls claude.ai/api/organizations/{orgId}/usage every 60s. Emits `usage-refreshed` Tauri event. All windows (main + breakout) listen and update status bars in real-time.
- [x] **Chat UX polish**: Escape interrupts Claude, Send button becomes Stop (circle-square icon) while thinking, ThinkingIndicator with waveform animation + tool activity label, sticky permission banner above input, resizable side panels (Code Viewer + Source Control).
- [x] **Conversation mode**: System messages/tool cards fade out after 5s. Only user bubbles (right-aligned), assistant bubbles (left-aligned), and pending permissions remain. Cost/turn stats verbose-only. Resolved permissions fade after 3s.
- [x] **Glowing border (breakout windows)**: Chat area border pulses blue when working, flutters orange for attention/permissions, solid red on error. Driven by event bus. 4px border + 6px outline + inset shadow.
- [x] **Theme sync across windows**: applyTheme broadcasts `theme-changed` Tauri event. All breakout windows listen and apply immediately.
- [x] **Theme system**: 7 themes (Midnight, Ocean, Forest, Aurora, Copper, Arctic, Sakura) with CSS variable architecture, persisted via Zustand+localStorage, dynamic Tauri title bar dark/light switching, ThemeSettings picker in Settings panel with mini app-mockup previews
- [x] **Skills**: /document and /read-logs in .claude/skills/
- [x] **Shared Skills Repository**: ~~Removed~~ — consolidated into Shared Memory repo; skills resolve from `{sharedMemoryRepo}/skills/`
- [x] **Data persistence**: OS-standard paths (%APPDATA% on Windows)
- [x] **Personality system**: 6 built-in personalities (Default, Mentor, Senior Engineer, Pair Programmer, Architect, Move Fast) + custom personality CRUD, injected via `--append-system-prompt` at session start, invisible to users, Settings > Personality panel with card picker and create/edit form
- [x] **Worktree dependency config**: Settings > Worktrees panel with 4 strategies (None, Symlink, pnpm, npm), auto-detects `package.json` in new worktrees, runs configured strategy after session creation, platform-aware (junction on Windows, symlink on Unix)

- [x] **Chat History system**: SQLite-backed persistent chat history with real-time message saving, session lifecycle tracking, haiku title generation, read-only transcript viewer, "Aware" multi-select injection (full/partial with summary caching), History panel (right sidebar, independently collapsible), cleanup hooks on worktree close and project removal

- [x] **Skills & Agents system Phase 1-4**: Data model + types + backend foundations (Phase 1), Skill Palette UI with two sections + panel refactor (Phase 2), Skill execution pipeline with param substitution + shell commands + auto-accept (Phase 3), Eyeball Mode with silent session restart + description injection + message replay (Phase 4)
- [x] **Skills & Agents system Phase 5**: Agent Pool Foundation — flat in-memory agent pool (Mutex<HashMap>), `start_agent_session_sync` in claude.rs, `spawn_agent`/`kill_agent`/`inject_into_agent`/`mark_agent_exited` fully implemented, `--disallowedTools Agent` on all sessions, agent marker parser (`-<*{...}*>-` format), marker interception in parseClaudeStream.ts with auto-dispatch to spawn/kill/extend commands, working dir inheritance from parent session
- [x] **Skills & Agents system Phase 6**: Agent Health Monitoring — `AgentHealthMonitor` singleton class tracking per-agent state (healthy/idle/stalling/looping/erroring/distressed), configurable thresholds from skill.json, escalation flow injecting `[BUILDOR_ALERT]` into parent agents, `extend_agent` + `takeover_agent` Rust commands, health events integrated with event bus
- [x] **Skills & Agents system Phase 7**: Agent UI — `useAgentPool` hook subscribing to agent events, `AgentStatusCard` pinned above chat input (live status per agent, accordion for children), `AgentsPanel` as third right-side panel (250px expanded, active/completed sections, transcript viewer), `AgentOutputBlock` for inline surfaced results, agent-permission routing to main screen with agent name badge, `ChatMessage` system-event rendering for agent lifecycle markers
- [x] **Skills & Agents system Phase 8**: ~~Shared Skills Repository Sync~~ — Originally a dedicated git sync system (`skill_sync.rs`, `SharedSkillsRepo.tsx`), now consolidated into the Shared Memory repo. Skills resolve from `{sharedMemoryRepo}/skills/` with fallback to `~/.buildor/skills/`. `defaults.json` merge (org-wide fallback model/effort/health) still applies.

- [x] **Agent Result Mailbox**: File-backed inter-agent communication system — `mailbox.rs` (deposit/query/purge/dependency resolution), `~/.buildor/agent-results/{sessionId}.json` storage, in-memory cache, pending spawn queue for unmet dependencies, dependency context injection into spawned agent prompts, output capture via `useAgentPool` hook, cleanup on parent session end. This is the **defacto agent communication technique** — all inter-agent data sharing uses this system.
- [x] **Agent spawn race condition fix**: `agent-spawned` event fired before backend registration, causing `listAgents()` to return empty. Fixed by adding `agent-registered` event that fires after `spawnAgent()` resolves.
- [x] **Agent autonomy**: Auto-accept permissions for agents (intercept raw JSON, respond immediately), auto-detect completion via `result` event (not process exit), result injection back into parent via `sendClaudeMessage()`, nested agent support (agents can spawn sub-agents)
- [x] **Agent health monitor hardening**: Bumped thresholds (idle/stall 60s, distress 90s), text output recovers all unhealthy states, tool-in-flight tracking, max silence ceiling (180s), PID liveness check, content_block_delta keepalive for health
- [x] **Agent initial prompt timing**: Rust skips sending initial prompt; frontend sends via `injectIntoAgent()` after listeners are ready
- [x] **Agent permission routing fix**: `agentSessionId` field on permission blocks ensures responses go to the correct agent subprocess
- [x] **Mailbox draft streaming**: Incremental output written every 10s so parent can read partial work if agent crashes
- [x] **Agent transcript persistence**: SQLite `chat_session` + `chat_messages` per agent, viewable in AgentsPanel
- [x] **Agent pool cleanup**: `clear_agents_for_parent` removes stale pool entries, `cleanup_agent_sessions` deletes agent DB records + images on session exit or `/clear`
- [x] **Agent pool scoping**: `useAgentPool(parentSessionId)` filters agents per chat window — each window only shows its own agents
- [x] **Agent sessions hidden from history**: SQL filter excludes `session_type='agent'` from chat history sidebar; agents remain queryable via dedicated `query_agent_sessions_by_parent`
- [x] **check_agent_alive Windows fix**: Uses `no_window_command("tasklist")` to prevent console window flash on Windows
- [x] **False distress fixes**: Emit `message-received` for `content_block_delta` events in raw JSON parser; text output recovers from any unhealthy state
- [x] **Agent transcript hierarchy dual-write**: Agent messages dual-written to root parent session with `source_agent_id` + `agent_name` columns; `buildAwareContext` labels agent-sourced messages with `[Agent: name]` prefix for history injection
- [x] **Stdout emit perf instrumentation**: Both session and agent stdout reader threads log slow emits (>50ms) and session summaries to SQLite; queryable via `/read-logs`
- [x] **Agent pool race fix**: `markAgentExited` awaited before emitting `agent-completed`/`agent-failed` events to prevent `listAgents()` seeing stale backend state
- [x] **Auto-dismiss task tracker**: Completed task list clears on next Claude `message-received` event
- [x] **Sticky permission card**: `StickyPermissionCard` pinned above input with typed `PermissionQueueEntry` FIFO queue, source attribution (Chat vs agent name), 1/N counter, pulse animation, fade-out after resolution. Tiered sticky zone replaces flat layout: Permission > Agents > Tasks > Status > Input. Inline permission cards suppressed in conversation mode (verbose still shows).
- [x] **Skills infrastructure**: context-engine (checkpoint manager for delta scans), skill-builder (scaffold new skills from prompts), skills moved from `documentor/` to `.claude/skills/`
- [x] **Operation Pool design spec**: Full design specification for app-global adaptive operation scheduler (`claude_knowledge/operation_pool_spec.md`) — resource lanes, TCP slow-start concurrency, two-tier scheduling, unified permission pipeline, persisted learned limits
- [x] **Operation Pool implementation**: App-global self-tuning operation scheduler in `src-tauri/src/operation_pool/` (7 modules, ~1140 lines). Resource-keyed lanes, three-tier scheduling (App/User/Subagent), adaptive concurrency (TCP slow start), persisted learned limits (`pool_limits.json`), configurable via `pool_config.json`. Integrated into git, shell, claude, agent, and worktree commands. Worktree deps (pnpm/npm install) routed through pool as Tier::Subagent. Hardened through 5 rounds of review: panic recovery, lock ordering, shutdown drain, timeout handling, active_count leak prevention.
- [x] **Pool telemetry stream spec**: Build specification for real-time telemetry from Operation Pool and Agent Mailbox (`claude_knowledge/pool_telemetry_spec.md`) — injected into Claude's stdin via `send_message()`, compact single-line format, subscriber registry, not yet implemented
- [x] **Skills consolidation**: Removed dedicated shared skills sync (`skill_sync.rs`, `SharedSkillsRepo.tsx`, `skillSync.ts`, startup auto-sync) — skills now resolve from shared memory repo path
- [x] **Version 0.0.5**: Bumped all version locations (package.json, Cargo.toml, tauri.conf.json x2)
- [x] **Pool Telemetry Stream**: Subscribable real-time telemetry feed from Operation Pool and Agent Mailbox. Static subscriber registry (`telemetry.rs`), Tauri commands (`subscribe_telemetry`/`unsubscribe_telemetry`), pool snapshot every 10 ticks, mailbox deposit/deps-met/abandoned events, auto-cleanup on session stop. Development-only tool — telemetry lines injected into Claude session stdin via `send_message()`.

### In Progress
1. [ ] **Permission response validation** — control_response with updatedInput sent correctly per Agent SDK source, needs end-to-end verification that tools execute after approval
- [ ] Flow Builder (drag-and-drop visual editor with React Flow — `@xyflow/react` installed but unused, component is placeholder only)
- [ ] Command Palette (skill browser with auto-generated parameter forms — component is placeholder only)
- [ ] App-as-Orchestrator (flow execution engine — backend stubs exist but return empty)
- [ ] Phase 2: Internal API/CLI for Claude-to-app bidirectional communication

### Environment
- OS: Windows 11
- Rust: 1.94.1 (MSVC target via rustup, VS Build Tools installed)
- Node: installed (npm)
- Dev command: `npx tauri dev` (requires `$HOME/.cargo/bin` in PATH)
- Remote: https://github.com/Aspire-Digital-LLC/Buildor.git
- Data: %APPDATA%/Buildor/ (config.json, logs.db, projects/{name}/sessions/)

### Known Issues
- Rust warnings: unused variables in stub commands
- App icon is a placeholder blue 16x16 square
- Permission response format sourced from Agent SDK but undocumented — may need tweaking if Claude Code CLI updates the protocol
