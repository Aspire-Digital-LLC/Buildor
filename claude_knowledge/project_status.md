# Project Status

## Current Phase: Core UX Complete, Session System Next

### Completed
- [x] App concept and feature spec (APP_BUILD_DESCRIPTION.md)
- [x] Tech stack: Tauri v2 + React + TypeScript + Rust
- [x] Project scaffolded, compiles clean (TS + Rust)
- [x] App launches with `npx tauri dev`
- [x] Git repo: Aspire-Digital-LLC/ProductaFlows on main
- [x] Dark UI with SVG line icons in sidebar
- [x] Native window title bar: "ProductaFlows v0.0.1"
- [x] **Tab system**: VS Code-style tabs, sidebar icons are project-aware launchers with dropdowns, multiple tabs open simultaneously, TabContext provides project scoping
- [x] **Project Manager**: add/remove projects via native folder picker, persists to %APPDATA%/ProductaFlows/config.json, GitHub-style language breakdown bars with colored percentages
- [x] **Code Viewer**: file tree (.gitignore-aware, shows dotfiles), Monaco syntax highlighting (50+ languages), Edit/Save/Cancel mode for file editing, breadcrumb path
- [x] **Source Control**: git status, staged/unstaged/untracked lists, stage/unstage per file and bulk, commit, push/pull, auto-refresh 5s
- [x] **Source Control hamburger menu**: switch/create/delete branch, merge, rebase, stash/pop, fetch, undo last commit, revert last push — confirmation modals + toast feedback
- [x] **Diff viewer**: side-by-side Monaco DiffEditor, character-level highlighting, minimap, revert arrows, Stage/Unstage/Discard buttons, full-width header
- [x] **Source Control badges**: blue badge on sidebar icon showing total uncommitted changes, per-project counts in dropdown, 5s refresh
- [x] **Logging system**: SQLite at %APPDATA%/ProductaFlows/logs.db, session_id (GUID) correlation, duration_ms timing, all operations instrumented
- [x] **Settings panel**: sidebar with Projects + Logs sections, log viewer with filtering (level/function/repo/session), "type to confirm" clear
- [x] **Skills**: /document and /read-logs in .claude/skills/ with description frontmatter
- [x] **CLI**: scripts/read-logs.sh with --errors, --session, --slow, --stats, --sessions, --since flags
- [x] **Data persistence**: OS-standard paths (%APPDATA% on Windows), auto-migration from legacy ~/.productaflows/
- [x] Serde camelCase alignment, no silent failures, CLAUDE.md logging convention

### In Progress (Build Order)
1. [ ] **Start Session modal** — project picker, base branch, type radio (bug/issue/feature/docs/release), GitHub issue integration, Haiku slug generation, worktree creation with animation
2. [ ] **Worktree Manager panel** — list open worktrees grouped by project, close individual/per-project/global
3. [ ] **Claude Chat breakout window** — separate Tauri window at 50% screen with skill/flow palette sidebar

### Not Started
- [ ] Flow Builder (drag-and-drop visual editor with React Flow)
- [ ] Command Palette (skill browser with auto-generated parameter forms)
- [ ] Skill & Flow Library (shared repo sync, auto-pull, commit/PR workflow)
- [ ] App-as-Orchestrator (flow execution engine in Rust/JS)
- [ ] Auto-update system (VERSION file check against source repo)
- [ ] Phase 2: Internal API/CLI for Claude-to-app bidirectional communication

### Environment
- OS: Windows 11
- Rust: 1.94.1 (MSVC target via rustup, VS Build Tools installed)
- Node: installed (npm)
- Dev command: `npx tauri dev` (requires `$HOME/.cargo/bin` in PATH)
- Remote: https://github.com/Aspire-Digital-LLC/ProductaFlows.git
- Data: %APPDATA%/ProductaFlows/ (config.json, logs.db)

### Known Issues
- Rust warnings: unused variables in stub commands (resolves as stubs are implemented)
- App icon is a placeholder blue 16x16 square
- Claude Code SDK auth question unresolved (subscription vs API key)
