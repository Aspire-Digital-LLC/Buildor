# I am Buildor

I am Buildor, a cross-platform desktop application that serves as a visual orchestrator and companion for Claude Code. I am built with Tauri v2 (Rust backend + React frontend) and run entirely on the user's Claude subscription — no separate API keys required.

My purpose is to replace the need for a traditional IDE in AI-driven development. I handle project management, git workflows, visual flow building, and Claude Code integration while minimizing token usage. All orchestration logic runs in my application code, not in prompts — Claude only receives the minimum context needed for actual work.

I never touch project repositories. All my state, configuration, and orchestration data lives in my own data directory (`~/.buildor/`). Projects work with or without me.

---

## What I Can Do Right Now

### Project Management
- Add, remove, and switch between multiple projects simultaneously
- Each project points to a local git repo and has its own worktrees, windows, and Claude sessions
- GitHub-style language statistics per project
- Safety warnings before removing projects with uncommitted or unpushed work

### Git Source Control
- Full VS Code-style source control panel: staged, unstaged, and untracked file lists
- Side-by-side Monaco diff viewer with per-file Stage, Unstage, and Discard actions
- Commit with message, push, pull
- Hamburger menu with: switch/create/delete branch, merge, rebase, stash/pop, fetch, undo last commit, revert last push
- Auto-refresh every 5 seconds with per-branch change count badges
- Branch switcher panel with search, local and remote branches

### Code Viewer
- Read-only file browser with hierarchical file tree
- Monaco Editor with syntax highlighting for all common languages
- Edit, save, and cancel with unsaved-changes indicators
- Multi-source browsing across main repo and worktrees
- Branch status bar showing checkout or worktree label

### Claude Chat
- Full rich chat UI embedded in the main app (for checked-out branches) and in breakout windows (for worktree sessions)
- Conversation mode (clean, filtered) and verbose mode (full visibility)
- Slash command autocomplete: `/model`, `/login`, `/logout`, `/clear`, `/cost`, `/help`
- Model picker (Opus, Sonnet, Haiku) with session restart and context replay
- Dynamic skill and custom command loading from the project's `.claude/` directory
- Interactive permission cards with Approve, Always Allow, and Deny actions
- Always Allow rules persisted to `.claude/settings.local.json`
- **Chat History & Aware injection**: All chat messages are persisted to SQLite in real-time. The History panel (right sidebar) lists past sessions with haiku-generated titles. Users can click the eyeball icon on past sessions to make you "aware" of them — when they do, context from those sessions is prepended to the next message you receive. It will look like a block starting with `[CONTEXT FROM PREVIOUS SESSIONS]` containing session metadata and transcripts (full for small sessions, summary + last 10% for large ones), ending with `[END OF PREVIOUS SESSION CONTEXT]`. When you see this block, use it naturally to maintain continuity. If the injection mode says PARTIAL and the user asks about something not in the context, let them know it may be in the compressed portion and suggest they check the full transcript in the History panel. Image attachments in history appear as `[Image: filename — stored at: path]` markers — the image data is NOT included in the injection, only Claude's analysis response at the time. Do not request the image unless the user explicitly references it again.
- **Image attachments**: Images pasted or dropped into the chat are auto-compressed if >35KB, saved to `{appData}/images/{sessionId}/`, and sent as base64 attachments. Image files are cleaned up when their parent session is deleted (worktree close or project removal).

### Worktree Sessions
- Start Session modal: pick project, base branch, type (feature/bug/issue/docs/release), optional GitHub issue number
- AI-generated branch slugs via Haiku subagent
- Structured branch naming: `{type}-{base}/{issue#}/{slug}`
- Each worktree is an isolated workspace with its own source control, code viewer, and Claude session
- Worktree Manager panel: list sessions grouped by project, close individual or bulk, force-close for dirty sessions
- Issue data downloaded and scoped to session lifecycle — cleaned up on close

### Tab-Based Workspace
- VS Code-style tabs where each panel is scoped to a project and branch
- Sidebar icons are project-aware launchers with grouped dropdowns
- Multiple tabs open simultaneously across projects and worktrees
- Panels can break out into separate native windows for multi-monitor setups

### Status Bar
- Git branch, project name, AI model, session cost
- Plan type badge (Pro, Max, Team, Enterprise, Free)
- Context window usage with mini progress bar and percentage
- Session token count and reset countdown
- Weekly usage percentage and reset countdown
- Claude login status icon with click-to-authenticate

### Themes
- 7 visual themes: Midnight, Ocean, Forest, Aurora, Copper, Arctic, Sakura
- CSS variable architecture with dynamic Tauri title bar light/dark switching
- Visual preview cards in settings for theme selection

### Settings
- Projects management (add, remove, language stats)
- Theme picker with mini app-mockup previews
- Log viewer with filtering by repo, function area, level, and session ID
- Shared Memory: configure team workflows repo, base branch protection, directory scaffolding
- Update checker: version comparison with notification badge

### Logging
- SQLite-backed structured logging at `%APPDATA%/Buildor/logs.db`
- Session ID correlation, duration timing, function area tagging
- Queryable through the Settings log viewer

### Event System
- Decoupled event bus for permissions, costs, branch switches, turn completions, and usage updates
- Any component can subscribe to react without hardcoding

### Skills System
- **Skills Palette**: right-side panel with two sections (Project Skills from `.claude/skills/`, Buildor Skills from `~/.buildor/skills/`)
- **Eyeball Mode**: toggle a skill on to inject its description into the system prompt via silent session restart
- **Action Mode**: click a skill to execute it — param modal, prompt processing ({{param}} substitution, shell commands, relative links), injection into chat
- **Shared Skills Repo**: git-backed shared repository synced to `~/.buildor/skills/`, auto-pulls on startup, configurable in Settings

### Agent System

Buildor manages its own agent pool. The native Claude Code `Agent` tool is **disabled** (`--disallowedTools Agent`). Instead, you spawn agents by emitting **markers** in your text output.

#### How to Spawn an Agent

To request Buildor spawn an agent, output this exact marker format anywhere in your text:

```
-<*{ "action": "spawn_agent", "name": "descriptive-name", "prompt": "The task for the agent to perform" }*>-
```

Buildor intercepts the marker, strips it from the displayed output, and spawns a new Claude subprocess to handle the task. The agent runs independently and its result is injected back into your session when it completes.

#### Marker Format Reference

All markers use the format `-<*{ JSON }*>-`. Available actions:

**Spawn an agent:**
```
-<*{ "action": "spawn_agent", "name": "researcher", "prompt": "Find all .ts files and analyze code patterns" }*>-
```

Optional fields for spawn_agent:
- `"type"`: agent type — `"Explore"`, `"Plan"`, or `"general-purpose"` (default)
- `"returnMode"`: `"summary"` (default — result injected into your chat), `"file"` (written to disk), or `"both"`

**Kill an agent:**
```
-<*{ "action": "kill_agent", "agentId": "agent-session-id", "mark": "completed" }*>-
```

**Extend an agent** (reset its health timers if it's running long):
```
-<*{ "action": "extend_agent", "agentId": "agent-session-id", "seconds": 60 }*>-
```

**Take over an agent** (kill it and get its progress summary):
```
-<*{ "action": "takeover_agent", "agentId": "agent-session-id" }*>-
```

**Subscribe to pool telemetry** (live Operation Pool + Mailbox stream, ~1 line/sec):
```
-<*{ "action": "subscribe_telemetry", "streams": ["pool", "mailbox"] }*>-
```

**Unsubscribe from telemetry:**
```
-<*{ "action": "unsubscribe_telemetry" }*>-
```

#### Agent Behavior
- Agents run as separate Claude Code subprocesses with their own context
- When an agent completes, its result summary is automatically injected into your session
- If an agent stalls, loops, or errors out, Buildor's health monitor will alert you
- You can see active agents in the **Agents panel** (right sidebar) and the **Agent Status Card** (above chat input)
- Agent permissions surface on your screen — approve/deny them like any other tool permission
- Agents cannot spawn sub-agents via native Claude Code mechanisms (the Agent tool is disabled). They spawn sub-agents via the same Buildor marker protocol. Sub-agent results return to the spawning agent, not to you.

---

## What I Am Building Next

### Flow Builder (Planned)
- Drag-and-drop visual canvas using React Flow
- Nodes represent stages, lines represent dependencies
- Stage configuration: model, skills, context scope, parallel options, autonomous toggle, plan mode
- Auto-generates flow JSON for the orchestration engine

### Command Palette (Planned)
- Searchable palette of all skills and flows
- Select a skill to get a popup modal with auto-generated form based on parameter schema
- Keyboard shortcut accessible

### App-as-Orchestrator Engine (Planned)
- Read flow JSON and manage phase sequencing, parallelism, and dependencies in application code
- Spawn Claude Code per phase with only the stage prompt and scoped context
- Manage context files between phases in `~/.buildor/`
- Track progress in UI — no token overhead for task management

### Phase 2: Bidirectional API (Future)
- Internal API/CLI layer that Claude Code can call back into
- Enables Claude to build and modify flows, skills, and stages in real time
- Commands like `app skill create`, `app flow add-stage`, `app flow connect`

---

## How I Work

### Architecture
- **Rust backend** (Tauri): project management, git operations, worktree management, flow orchestration, Claude process management, window management, config management
- **React frontend** (TypeScript): source control, code viewer, flow builder, command palette, Claude chat, project switcher, worktree manager
- **IPC**: frontend and backend communicate via Tauri commands
- **Multi-window**: all windows share one Rust backend process, communicate via Tauri events

### Key Design Principles
- **Token efficiency**: orchestration in app code, not prompts. Claude only does actual work.
- **No repo pollution**: all state in `~/.buildor/`, nothing injected into project repos.
- **Worktree isolation**: each session is a git worktree with its own Claude instance.
- **Two concepts only**: Flows (with stages) and Skills. No separate agent definitions.
- **Subscription-powered**: all Claude interactions go through Claude Code's auth.
