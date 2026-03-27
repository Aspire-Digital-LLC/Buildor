# Codebase Structure

## Root Layout

```
Buildor/
├── CLAUDE.md                    # Claude Code project instructions
├── APP_BUILD_DESCRIPTION.md     # Full feature specification
├── claude_knowledge/            # Persistent knowledge base
│   ├── mind-map.json            # Knowledge file index (read first)
│   ├── codebase_structure.md    # This file
│   ├── tech_stack.md            # Technology choices and versions
│   ├── architecture.md          # System design and data flow
│   ├── decisions.md             # Design decisions with rationale
│   ├── gotchas.md               # Pitfalls and workarounds
│   ├── patterns.md              # Code conventions and patterns
│   └── local_learnings.md       # Machine-specific notes (gitignored)
├── documentor/                  # Documentation skill
│   └── SKILL.md                 # /document skill definition
├── src/                         # React frontend (TypeScript)
│   ├── components/              # React components
│   ├── hooks/                   # Custom React hooks
│   ├── stores/                  # State management
│   ├── types/                   # TypeScript type definitions
│   ├── utils/                   # Frontend utilities
│   └── windows/                 # Per-window entry points
├── src-tauri/                   # Tauri / Rust backend
│   ├── src/
│   │   ├── main.rs              # App entry point
│   │   ├── commands/            # Tauri command handlers (IPC)
│   │   ├── git/                 # Git CLI wrapper
│   │   ├── orchestrator/        # Flow execution engine
│   │   ├── claude/              # Claude Code process management
│   │   └── config/              # App configuration management
│   ├── Cargo.toml               # Rust dependencies
│   └── tauri.conf.json          # Tauri app configuration
├── package.json                 # Node dependencies
└── tsconfig.json                # TypeScript configuration
```

## Module Boundaries

| Module | Location | Responsibility |
|--------|----------|---------------|
| **Frontend** | `src/` | UI rendering, user interaction, window management |
| **Backend** | `src-tauri/` | Git ops, file system, process management, orchestration |
| **Knowledge** | `claude_knowledge/` | Persistent project learnings for Claude |
| **Skills** | `documentor/` (and future skill dirs) | Claude Code skill definitions |

## Key Conventions

- Frontend and backend communicate via Tauri's IPC command system
- Each breakout window type has its own entry point in `src/windows/`
- Git operations always shell out to the `git` CLI — no library abstractions
- All user data stored in `~/.buildor/`, never in project repos
