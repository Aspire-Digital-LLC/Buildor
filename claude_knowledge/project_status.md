# Project Status

## Current Phase: Core UX Complete, Orchestration Layer Next

### Completed
- [x] App concept and feature spec (APP_BUILD_DESCRIPTION.md)
- [x] Tech stack: Tauri v2 + React + TypeScript + Rust
- [x] Project scaffolded, compiles clean (TS + Rust)
- [x] App launches with `npx tauri dev`
- [x] Git repo: Aspire-Digital-LLC/Buildor on main
- [x] Dark UI with SVG line icons in sidebar
- [x] Native window title bar: "Buildor v0.0.1"
- [x] **Tab system**: VS Code-style tabs, sidebar icons are project-aware launchers with dropdowns, multiple tabs open simultaneously, TabContext provides project scoping
- [x] **Project Manager**: add/remove projects via native folder picker, persists to %APPDATA%/Buildor/config.json, GitHub-style language breakdown bars with colored percentages
- [x] **Code Viewer**: file tree (.gitignore-aware, shows dotfiles), Monaco syntax highlighting (50+ languages), Edit/Save/Cancel mode for file editing, breadcrumb path
- [x] **Source Control**: git status, staged/unstaged/untracked lists, stage/unstage per file and bulk, commit, push/pull, auto-refresh 5s
- [x] **Source Control hamburger menu**: switch/create/delete branch, merge, rebase, stash/pop, fetch, undo last commit, revert last push — confirmation modals + toast feedback
- [x] **Diff viewer**: side-by-side Monaco DiffEditor, character-level highlighting, minimap, revert arrows, Stage/Unstage/Discard buttons, full-width header
- [x] **Source Control badges**: blue badge on sidebar icon showing total uncommitted changes, per-project counts in dropdown, 5s refresh
- [x] **Logging system**: SQLite at %APPDATA%/Buildor/logs.db, session_id (GUID) correlation, duration_ms timing, all operations instrumented
- [x] **Settings panel**: sidebar with Projects, Logs, Shared Memory, and Updates sections; log viewer with filtering (level/function/repo/session), "type to confirm" clear
- [x] **Skills**: /document and /read-logs in .claude/skills/ with description frontmatter
- [x] **CLI**: scripts/read-logs.sh with --errors, --session, --slow, --stats, --sessions, --since flags
- [x] **Data persistence**: OS-standard paths (%APPDATA% on Windows), auto-migration from legacy ~/.productaflows/
- [x] Serde camelCase alignment, no silent failures, CLAUDE.md logging convention
- [x] **Start Session modal**: project picker, base branch selector, session type radio (bug/feature/issue/docs/release), GitHub issue input, Haiku-powered slug generation, worktree creation, success screen with "Launch Claude" button
- [x] **Worktree Manager panel**: list active sessions grouped by project, close individual/bulk, 10s auto-refresh
- [x] **Update checker**: local vs remote version comparison, "Update Available" notification, download link to GitHub Releases, manual check button

### In Progress
1. [ ] **Claude Chat integration** — CLI subprocess sessions work (streaming output, message history, session management). Still needed: conversation vs verbose mode toggle, Haiku skill routing on free-form messages, xterm.js terminal hookup
2. [ ] **Breakout windows** — Claude chat opens in separate Tauri window with reuse/focus logic. Still needed: skill/flow palette sidebar (currently placeholder), per-project/worktree color-coding, generic panel breakout
3. [ ] **Settings: Shared Memory** — folder picker for team repo exists (~30% complete, mostly stubs/TODOs)

### Not Started
- [ ] Flow Builder (drag-and-drop visual editor with React Flow — `@xyflow/react` installed but unused, component is placeholder only)
- [ ] Command Palette (skill browser with auto-generated parameter forms — component is placeholder only)
- [ ] Skill & Flow Library (shared repo sync, auto-pull, scoping, commit/PR workflow)
- [ ] App-as-Orchestrator (flow execution engine — backend stubs exist but return empty)
- [ ] Phase 2: Internal API/CLI for Claude-to-app bidirectional communication

### Environment
- OS: Windows 11
- Rust: 1.94.1 (MSVC target via rustup, VS Build Tools installed)
- Node: installed (npm)
- Dev command: `npx tauri dev` (requires `$HOME/.cargo/bin` in PATH)
- Remote: https://github.com/Aspire-Digital-LLC/Buildor.git
- Data: %APPDATA%/Buildor/ (config.json, logs.db)

### Known Issues
- Rust warnings: unused variables in stub commands (resolves as stubs are implemented)
- App icon is a placeholder blue 16x16 square
- Claude Code SDK auth question unresolved (subscription vs API key)
- xterm.js is in package.json but not wired up anywhere
