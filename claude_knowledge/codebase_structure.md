# Codebase Structure

## Root Layout

```
Buildor/
├── CLAUDE.md                    # Claude Code project instructions
├── APP_BUILD_DESCRIPTION.md     # Full feature specification
├── buildor_context.md           # Buildor self-identity context (injected into Claude chats)
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
│   │   ├── claude-chat/         # Chat UI, panels, agent UI
│   │   │   ├── ClaudeChat.tsx       # Main chat component (sessions, panels, skill/agent wiring)
│   │   │   ├── SkillsPalette.tsx    # Two-section skills palette (project + Buildor skills)
│   │   │   ├── SkillEntry.tsx       # Individual skill row (eyeball + action icons)
│   │   │   ├── SkillParamsModal.tsx  # Auto-generated param form from skill.json
│   │   │   ├── AgentStatusCard.tsx   # Pinned card above input (live agent status)
│   │   │   ├── AgentsPanel.tsx       # Right-side panel (active + completed agents)
│   │   │   └── AgentOutputBlock.tsx  # Inline surfaced agent results in chat
│   │   └── settings/
│   │       ├── Settings.tsx          # Settings sidebar with section routing
│   │       ├── SharedMemory.tsx      # Shared memory repo config
│   │       └── SharedSkillsRepo.tsx  # Shared skills repo config (URL, sync, push, status)
│   ├── hooks/                   # Custom React hooks
│   │   ├── useSkills.ts             # Loads skills, manages eyeballs, search, sync refresh
│   │   └── useAgentPool.ts          # Subscribes to agent events, maintains live agent state
│   ├── themes/                  # Theme definitions (themes.ts — 7 themes, CSS variable system)
│   ├── personalities/           # Personality definitions (personalities.ts — 6 built-in, type exports)
│   ├── stores/                  # State management (Zustand — includes usageStore, themeStore, personalityStore, worktreeConfigStore)
│   ├── types/                   # TypeScript type definitions
│   │   ├── skill.ts                 # BuildorSkill, ProjectSkill, SkillParam, SkillExecution types
│   │   └── agent.ts                 # Agent, AgentHealthState, AgentMarker, AgentPoolEntry types
│   ├── utils/                   # Frontend utilities
│   │   ├── agentMarker.ts           # Marker parser (-<*{...}*>- format extraction)
│   │   ├── agentHealthMonitor.ts    # Per-agent health state machine + escalation
│   │   ├── skillProcessor.ts        # Param substitution, shell exec, link resolution
│   │   ├── nativeSkillTranslator.ts # Runtime SKILL.md → BuildorSkill translation
│   │   ├── buildSystemPrompt.ts     # System prompt assembly (identity + personality + skills)
│   │   ├── commands/
│   │   │   ├── skills.ts            # listBuildorSkills, listProjectSkills, etc.
│   │   │   ├── skillSync.ts         # configureSharedRepo, syncSkillsRepo, pushSkillChanges
│   │   │   └── agents.ts            # spawnAgent, killAgent, extendAgent, etc.
│   │   └── buildorEvents.ts         # Event bus (permissions, agents, skills, compact, etc.)
│   └── windows/                 # Per-window entry points
│       └── main/MainApp.tsx         # App entry — loads projects, auto-syncs shared skills
├── src-tauri/                   # Tauri / Rust backend
│   ├── src/
│   │   ├── main.rs              # App entry point
│   │   ├── commands/            # Tauri command handlers (IPC)
│   │   │   ├── chat_history.rs  # Chat history CRUD + title/summary generation
│   │   │   ├── skills.rs        # Skill scanning (~/.buildor/skills/, .claude/skills/), defaults.json merge
│   │   │   ├── skill_sync.rs    # Shared repo git ops (clone, pull, push, status)
│   │   │   ├── agents.rs        # Agent pool (spawn, kill, extend, takeover, inject, list)
│   │   │   ├── claude.rs        # Claude session management (main + agent sessions)
│   │   │   └── shell.rs         # Shell command execution (for skill !`command` blocks)
│   │   ├── logging/             # SQLite DB (logs + chat_sessions + chat_messages tables)
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
| **Buildor Skills** | `~/.buildor/skills/` | Buildor-managed skills (shared repo synced here) |
| **Project Skills** | `.claude/skills/`, `~/.claude/skills/` | Native Claude Code skills (read-only in palette) |
| **Documentor** | `documentor/` | /document skill definition |

## Key Conventions

- Frontend and backend communicate via Tauri's IPC command system
- Each breakout window type has its own entry point in `src/windows/`
- Git operations always shell out to the `git` CLI — no library abstractions
- All user data stored in `~/.buildor/`, never in project repos
