# Project Status

## Current Phase: Core Features Built, UX Refactor + Session System Next

### Completed
- [x] App concept and feature spec (APP_BUILD_DESCRIPTION.md)
- [x] Tech stack: Tauri v2 + React + TypeScript + Rust
- [x] Project scaffolded: 99 files, compiles clean (TS + Rust)
- [x] App launches with `npx tauri dev`
- [x] Git repo initialized, pushed to Aspire-Digital-LLC/ProductaFlows
- [x] Dark UI with SVG line icons in sidebar
- [x] Native window title bar showing "ProductaFlows v0.0.1"
- [x] Project Manager: add/remove/switch projects via native folder picker, persists to ~/.productaflows/config.json
- [x] Code Viewer: file tree with .gitignore-aware filtering, Monaco editor with syntax highlighting (50+ languages)
- [x] Source Control: git status, staged/unstaged/untracked lists, stage/unstage per file and bulk, commit with message, push/pull buttons
- [x] Source Control hamburger menu: switch/create/delete branch, merge, rebase, stash/pop, fetch, undo last commit, revert last push — with confirmation modals and toast feedback
- [x] Side-by-side diff viewer (Monaco DiffEditor) — opens when clicking a changed file
- [x] Serde camelCase alignment between Rust structs and TypeScript types
- [x] Auto-refresh git status every 5 seconds
- [x] Knowledge base, mind-map index, /document skill

### In Progress (Build Order)
1. [x] **Diff viewer fix** — character-level highlighting, minimap, revert arrows with MutationObserver tooltip, Stage/Unstage/Discard buttons, full-width header layout
2. [ ] **Tab system refactor** — replace React Router pages with VS Code-style tabs, sidebar icons become project-aware launchers with dropdown
3. [ ] **Start Session modal** — project picker, base branch, type radio (bug/issue/feature/docs/release), GitHub issue integration, Haiku slug generation, worktree creation with animation
4. [ ] **Worktree Manager panel** — list open worktrees grouped by project, close individual/per-project/global
5. [ ] **Claude Chat breakout window** — separate Tauri window at 50% screen with skill/flow palette sidebar

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

### Known Issues
- Rust warnings: unused variables in stub commands (expected, resolves as stubs are implemented)
- App icon is a placeholder blue 16x16 square
- Claude Code SDK auth question unresolved (subscription vs API key)
- Diff viewer needs character-level highlighting and revert arrows (Monaco config fix)
