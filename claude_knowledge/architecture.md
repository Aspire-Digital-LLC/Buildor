# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────┐
│                   ProductaFlows                      │
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
      → App reads scoped context files from ~/.productaflows/
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
- Context passes exclusively via files in `~/.productaflows/`
- Each worktree gets its own Claude session scoped to its directory

### Separation
- Orchestration logic lives in Rust/JS application code, not in prompts
- UI rendering is decoupled from backend operations via Tauri IPC
- Workflow definitions (flows/skills) are separate from project code

### Efficiency
- App manages all pipeline state — no tokens spent on task management
- Haiku routing keeps skill injection cost minimal
- Context files are scoped — each phase only sees what it needs
