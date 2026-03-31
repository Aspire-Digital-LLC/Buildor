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

**Lifecycle**:
- Main chat history: scoped to project, deleted when project removed from Buildor
- Worktree history: scoped to worktree session ID, deleted when worktree closed

**Title generation**: Haiku generates <8 word title after 3rd user message, refreshes every 15th. Untitled sessions get retroactive titles on history panel load.
