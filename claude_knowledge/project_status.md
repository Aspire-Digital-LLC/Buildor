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
- [x] **Tab system**: VS Code-style tabs with panel-type SVG icons (SC, CV, Chat, Worktrees, Settings), sidebar icons are project-aware launchers with grouped dropdowns, multiple tabs open simultaneously, TabContext provides project+browsePath+browseBranch scoping
- [x] **Project Manager**: add/remove projects, GitHub-style language bars, safety modal warns about uncommitted/unpushed worktree work before removal, auto-cleanup of worktrees+sessions on removal
- [x] **Code Viewer**: file tree, Monaco syntax highlighting, Edit/Save/Cancel, multi-source browsing (main repo + worktrees), branch status bar with "CHECKED OUT"/"WORKTREE" label, no change count badges in dropdown
- [x] **Branch Switcher**: slide-up panel from branch status bar (checked-out only), search/filter, local+remote branches, checkout updates all related tabs + change counts immediately via branch-switched event
- [x] **Source Control**: git status, staged/unstaged/untracked, commit, push/pull, auto-refresh 5s, browsePath-aware for worktrees, per-branch change count badges in dropdown, discard for both tracked and untracked files
- [x] **Source Control hamburger menu**: switch/create/delete branch, merge, rebase, stash/pop, fetch, undo last commit, revert last push
- [x] **Diff viewer**: side-by-side Monaco DiffEditor, Stage/Unstage/Discard buttons, discard works for untracked files (deletes them safely)
- [x] **Logging system**: SQLite at %APPDATA%/Buildor/logs.db, session_id correlation, duration_ms timing
- [x] **Settings panel**: sidebar with Projects + Logs sections, log viewer with filtering
- [x] **Start Session modal**: project picker, base branch, type radio, Haiku slug generation, worktree creation
- [x] **Worktree Manager panel**: list open sessions grouped by project, close individual/per-project/global, force-close for sessions with uncommitted/unpushed work
- [x] **Claude Chat (in-app)**: full rich UI in main app tab, scoped to checked-out branch per project, auto-starts session, slash commands, model picker, permission cards, sidebar dropdown shows only checked-out branches (no worktrees)
- [x] **Claude Chat (breakout window)**: separate Tauri window for worktree sessions, same rich UI
- [x] **Slash command autocomplete**: type / in chat input for menu — /model (model picker with session restart + context replay), /login, /logout (browser OAuth via subprocess), /clear, /cost, /help
- [x] **Claude Permission Cards**: interactive Approve/Always Allow/Deny buttons, control_request/control_response protocol with updatedInput echo
- [x] **Always Allow persistence**: saves permission rules to .claude/settings.local.json
- [x] **Collapsible Skills & Flows palette**: right-side panel, collapses to thin vertical bar with sideways text, click to expand/collapse
- [x] **Event system**: buildorEvents bus (permissions, costs, branch-switched, turn-completed, usage-updated)
- [x] **StatusBar**: VS Code-style full-width bottom bar with git branch, project, model, session cost, plan type badge, context window % (with mini progress bar), session token count, weekly usage %, reset countdown. Uses usageStore (Zustand) subscribed to event bus. Polls `claude status` CLI every 5min for plan/quota data.
- [x] **Theme system**: 7 themes (Midnight, Ocean, Forest, Aurora, Copper, Arctic, Sakura) with CSS variable architecture, persisted via Zustand+localStorage, dynamic Tauri title bar dark/light switching, ThemeSettings picker in Settings panel with mini app-mockup previews
- [x] **Skills**: /document and /read-logs in .claude/skills/
- [x] **Data persistence**: OS-standard paths (%APPDATA% on Windows)
- [x] **Personality system**: 6 built-in personalities (Default, Mentor, Senior Engineer, Pair Programmer, Architect, Move Fast) + custom personality CRUD, injected via `--append-system-prompt` at session start, invisible to users, Settings > Personality panel with card picker and create/edit form
- [x] **Worktree dependency config**: Settings > Worktrees panel with 4 strategies (None, Symlink, pnpm, npm), auto-detects `package.json` in new worktrees, runs configured strategy after session creation, platform-aware (junction on Windows, symlink on Unix)

### In Progress
1. [ ] **Permission response validation** — control_response with updatedInput sent correctly per Agent SDK source, needs end-to-end verification that tools execute after approval
2. [ ] **Skills & Flows palette content** — palette UI exists but shows placeholder; needs skill browser, auto-generated parameter forms

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
- Data: %APPDATA%/Buildor/ (config.json, logs.db, projects/{name}/sessions/)

### Known Issues
- Rust warnings: unused variables in stub commands
- App icon is a placeholder blue 16x16 square
- Permission response format sourced from Agent SDK but undocumented — may need tweaking if Claude Code CLI updates the protocol
