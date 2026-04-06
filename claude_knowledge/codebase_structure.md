# Codebase Structure

## Root Layout

```
Buildor/
├── CLAUDE.md                    # Claude Code project instructions
├── APP_BUILD_DESCRIPTION.md     # Full feature specification
├── buildor_context.md           # Buildor self-identity context (injected into Claude chats)
├── .claude/skills/              # Claude Code skills (project-scoped)
│   ├── document/SKILL.md            # /document — update knowledge base after work
│   ├── read-logs/                   # /read-logs — query SQLite logs
│   │   ├── SKILL.md
│   │   └── scripts/                 # Helper scripts for log queries
│   ├── context-engine/              # Checkpoint manager for knowledge scans (called by /document)
│   │   ├── SKILL.md
│   │   └── scripts/checkpoints.ts   # CLI: get-latest, write, list, prune
│   ├── skill-builder/SKILL.md       # /skill-builder — scaffold new skills
│   └── simplify/SKILL.md            # /simplify — review code for reuse/quality
├── claude_knowledge/            # Persistent knowledge base
│   ├── mind-map.json            # Knowledge file index (read first)
│   ├── codebase_structure.md    # This file
│   ├── tech_stack.md            # Technology choices and versions
│   ├── architecture.md          # System design and data flow
│   ├── decisions.md             # Design decisions with rationale
│   ├── gotchas.md               # Pitfalls and workarounds
│   ├── patterns.md              # Code conventions and patterns
│   ├── events.md                # Event bus system and event types
│   ├── project_status.md        # Current phase, progress, known issues
│   ├── personality_and_worktree_config.md  # Personality + worktree dep setup
│   ├── buildor_skills_guide.md  # Skill authoring reference
│   ├── operation_pool_spec.md   # Operation pool design spec
│   ├── telemetry.md             # Pool telemetry stream usage guide (subscribe, format, red flags)
│   ├── checkpoints/             # Context-engine scan checkpoints (per-command subdirs)
│   └── local_learnings.md       # Machine-specific notes (gitignored)
├── src/                         # React frontend (TypeScript)
│   ├── components/              # React components
│   │   ├── claude-chat/         # Chat UI, panels, agent UI
│   │   │   ├── ClaudeChat.tsx       # Main chat component (sessions, panels, skill/agent wiring)
│   │   │   ├── SkillsPalette.tsx    # Two-section skills palette (project + Buildor skills)
│   │   │   ├── SkillEntry.tsx       # Individual skill row (eyeball + action icons)
│   │   │   ├── SkillParamsModal.tsx  # Auto-generated param form from skill.json
│   │   │   ├── StickyPermissionCard.tsx  # Pinned permission card with FIFO queue (above input)
│   │   │   ├── AgentStatusCard.tsx   # Pinned card above input (live agent status)
│   │   │   ├── AgentsPanel.tsx       # Right-side panel (active + completed agents)
│   │   │   └── AgentOutputBlock.tsx  # Inline surfaced agent results in chat
│   │   ├── skill-builder/         # Skill Builder panel (create/edit skills)
│   │   │   ├── SkillBuilder.tsx       # Three-panel layout (browser + editor + chat)
│   │   │   ├── SkillBrowser.tsx       # Left panel: skill list with create/open/delete
│   │   │   ├── SkillEditor.tsx        # Center panel: tabbed editor for skill.json fields
│   │   │   ├── SkillEditorIdentity.tsx    # Name, description, tags, scope
│   │   │   ├── SkillEditorParams.tsx      # Parameter definitions
│   │   │   ├── SkillEditorExecution.tsx   # Execution config (mode, model, effort)
│   │   │   ├── SkillEditorVisibility.tsx  # Visibility config (autoLoad, etc.)
│   │   │   ├── SkillEditorHealth.tsx      # Health thresholds
│   │   │   ├── SkillEditorPrompt.tsx      # prompt.md content editor
│   │   │   ├── SkillEditorFiles.tsx       # Supporting files
│   │   │   ├── SkillBuilderChat.tsx       # Right panel: scoped Claude assistant
│   │   │   ├── FieldReviewCard.tsx        # Inline field feedback (pass/warning/error)
│   │   │   └── PendingUpdateCard.tsx      # Chat-driven field update approval card
│   │   └── settings/
│   │       ├── Settings.tsx          # Settings sidebar with section routing
│   │       └── SharedMemory.tsx      # Shared memory repo config (skills + flows live here)
│   ├── hooks/                   # Custom React hooks
│   │   ├── useSkills.ts             # Loads skills, manages eyeballs, search, sync refresh
│   │   └── useAgentPool.ts          # Subscribes to agent events, maintains live agent state
│   ├── themes/                  # Theme definitions (themes.ts — 7 themes, CSS variable system)
│   ├── personalities/           # Personality definitions (personalities.ts — 6 built-in, type exports)
│   ├── stores/                  # State management (Zustand — includes usageStore, themeStore, personalityStore, worktreeConfigStore, skillBuilderStore)
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
│   │   │   ├── agents.ts            # spawnAgent, killAgent, extendAgent, markAgentExited
│   │   │   ├── mailbox.ts          # depositResult, queryResult, purgeResults, spawnAgentWithDeps
│   │   │   ├── telemetry.ts        # subscribeTelemetry, unsubscribeTelemetry
│   │   │   └── chatImages.ts        # saveChatImage, readChatImage, deleteSessionImages
│   │   ├── autoApprove.ts           # Auto-approve rules engine (pattern matching for tool permissions)
│   │   └── buildorEvents.ts         # Event bus (permissions, agents, skills, compact, etc.)
│   ├── prompts/                 # Centralized prompt templates
│   │   └── historyInjection.ts      # Aware injection instructions (header, footer, modes, image markers)
│   └── windows/                 # Per-window entry points
│       └── main/MainApp.tsx         # App entry — loads projects
├── src-tauri/                   # Tauri / Rust backend
│   ├── src/
│   │   ├── main.rs              # App entry point
│   │   ├── commands/            # Tauri command handlers (IPC)
│   │   │   ├── chat_history.rs  # Chat history CRUD + title/summary generation
│   │   │   ├── chat_images.rs  # Image storage (save/read/delete), session cleanup
│   │   │   ├── skills.rs        # Skill scanning ({sharedMemoryRepo}/skills/ or ~/.buildor/skills/), defaults.json merge
│   │   │   ├── agents.rs        # Agent pool (spawn, kill, extend, takeover, inject, list)
│   │   │   ├── mailbox.rs      # Agent result mailbox (deposit, query, purge, dependency resolution)
│   │   │   ├── claude.rs        # Claude session management (main + agent sessions)
│   │   │   ├── telemetry.rs    # subscribe_telemetry / unsubscribe_telemetry Tauri commands
│   │   │   └── shell.rs         # Shell command execution (for skill !`command` blocks)
│   │   ├── telemetry.rs         # Subscriber registry for pool/mailbox telemetry stream
│   │   ├── logging/             # SQLite DB (logs + chat_sessions + chat_messages tables)
│   │   ├── git/                 # Git CLI wrapper
│   │   ├── orchestrator/        # Flow execution engine
│   │   ├── claude/              # Claude Code process management
│   │   ├── config/              # App configuration management
│   │   └── operation_pool/      # App-global adaptive operation scheduler
│   │       ├── mod.rs           # Public exports
│   │       ├── pool.rs          # OperationPool singleton, tick loop, submit/shutdown
│   │       ├── lane.rs          # Per-resource-key Lane with two-tier priority queues
│   │       ├── pending_op.rs    # PendingOp struct, Tier enum, priority ordering
│   │       ├── adaptive.rs      # AdaptiveLimit (TCP slow-start concurrency)
│   │       ├── config.rs        # PoolConfig (pool_config.json, defaults from num_cpus)
│   │       ├── persistence.rs   # PersistedLimits (pool_limits.json, learned concurrency)
│   │       └── resource_key.rs  # ResourceKeyed trait, derive_resource_key() (tool→lane mapping)
│   ├── sdk-service/             # Node.js Agent SDK HTTP/SSE sidecar (Phase 1)
│   │   ├── src/
│   │   │   ├── index.ts             # HTTP server entry point (Express-like router)
│   │   │   ├── router.ts            # Lightweight path-pattern router
│   │   │   ├── sessions.ts          # Session lifecycle (create/destroy/list)
│   │   │   ├── sdk-runner.ts        # Claude Agent SDK wrapper (spawnClaudeCodeProcess)
│   │   │   ├── session-stream.ts    # SSE streaming from SDK to HTTP clients
│   │   │   ├── permission-gate.ts   # PreToolUse permission hooks
│   │   │   ├── wire-format.ts       # SDK event → Buildor wire format translation
│   │   │   ├── types.ts             # Shared TypeScript types
│   │   │   └── routes/              # Route handlers (CRUD, stream, message, permission, etc.)
│   │   ├── build.mjs               # Build script
│   │   ├── package.json            # SDK service dependencies
│   │   └── tsconfig.json           # TypeScript config
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
| **Buildor Skills** | `{sharedMemoryRepo}/skills/` or `~/.buildor/skills/` | Buildor-managed skills (resolved from shared memory repo config, fallback to ~/.buildor/skills/) |
| **Project Skills** | `.claude/skills/`, `~/.claude/skills/` | Native Claude Code skills (read-only in palette) |
| **Skills** | `.claude/skills/` | Project-scoped Claude Code skills (document, read-logs, context-engine, skill-builder, simplify) |

## Key Conventions

- Frontend and backend communicate via Tauri's IPC command system
- Each breakout window type has its own entry point in `src/windows/`
- Git operations always shell out to the `git` CLI — no library abstractions
- All user data stored in `~/.buildor/`, never in project repos
