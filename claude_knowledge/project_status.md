# Project Status

## Current Phase: Claude Integration & Multi-Branch Workflows

### Completed
- [x] App concept and feature spec (APP_BUILD_DESCRIPTION.md)
- [x] Tech stack: Tauri v2 + React + TypeScript + Rust
- [x] Project scaffolded, compiles clean (TS + Rust)
- [x] App launches with `npx tauri dev`, window auto-centers on screen
- [x] Git repo: Aspire-Digital-LLC/Buildor on main
- [x] Dark UI with SVG line icons in sidebar
- [x] Native window title bar: "Buildor v0.0.1"
- [x] **Tab system**: VS Code-style tabs with panel-type icons, sidebar icons are project-aware launchers with dropdowns, multiple tabs open simultaneously, TabContext provides project+browsePath scoping, tabs carry browseBranch/browseIsWorktree metadata
- [x] **Project Manager**: add/remove projects via native folder picker, persists to %APPDATA%/Buildor/config.json, GitHub-style language breakdown bars, safety modal warns about uncommitted/unpushed worktree work before project removal, cleanup of worktrees+sessions on removal
- [x] **Code Viewer**: file tree (.gitignore-aware), Monaco syntax highlighting, Edit/Save/Cancel, breadcrumb path, multi-source browsing (main repo + worktrees), branch status bar at bottom showing branch name + "CHECKED OUT"/"WORKTREE" label
- [x] **Branch Switcher**: slide-up panel from branch status bar (checked-out branches only), search/filter, local+remote branch list, checkout switches branch and updates all related tabs + change counts immediately
- [x] **Source Control**: git status, staged/unstaged/untracked, commit, push/pull, auto-refresh 5s, browsePath-aware (works for worktrees too)
- [x] **Source Control hamburger menu**: switch/create/delete branch, merge, rebase, stash/pop, fetch, undo last commit, revert last push
- [x] **Source Control + Code Viewer grouped dropdown**: project headers (non-clickable), checked-out branch + worktree branches as clickable items, per-branch change count badges
- [x] **Diff viewer**: side-by-side Monaco DiffEditor, revert arrows, Stage/Unstage/Discard buttons
- [x] **Logging system**: SQLite at %APPDATA%/Buildor/logs.db, session_id correlation, duration_ms timing
- [x] **Settings panel**: sidebar with Projects + Logs sections, log viewer with filtering
- [x] **Start Session modal**: project picker, base branch, type radio, Haiku slug generation, worktree creation
- [x] **Worktree Manager panel**: list open sessions grouped by project, close individual/per-project/global
- [x] **Claude Chat breakout window**: separate Tauri window with skill/flow palette sidebar, rich message rendering (Markdown, code blocks, tool cards, edit diffs)
- [x] **Claude Permission Cards**: interactive Approve/Always Allow/Deny buttons for tool permission requests, renders for Write, Bash, Edit tools with descriptions
- [x] **Claude session management**: stream-json bidirectional protocol, thinking indicator with auto-reset on completion, input focus persistence, cost/duration display
- [x] **Event system**: buildorEvents bus for decoupled UI reactions (permissions, costs, branch-switched, turn-completed)
- [x] **Skills**: /document and /read-logs in .claude/skills/
- [x] **Data persistence**: OS-standard paths (%APPDATA% on Windows)

### In Progress
1. [ ] **Permission response format** — control_response with updatedInput working but needs validation that tools actually execute after approval
2. [ ] **Always Allow persistence** — `add_permission_rule` Rust command exists, wired to button, writes to .claude/settings.local.json
3. [ ] **Tab title icons** — tabs show sidebar icons for SC/CV/Worktrees/Settings panel types

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
- Remote: https://github.com/Aspire-Digital-LLC/Buildor.git
- Data: %APPDATA%/Buildor/ (config.json, logs.db, projects/{name}/sessions/)

### Known Issues
- Rust warnings: unused variables in stub commands
- App icon is a placeholder blue 16x16 square
- Permission response format may still need tweaking — tools approved but possibly not executing (undocumented Claude Code stream-json protocol)
- Old "ProductaFlows" project name may linger in configs if not cleaned up
