# ProductaFlows

## Project Overview

ProductaFlows is a cross-platform desktop application (Tauri v2 + React + Rust) that serves as a visual orchestrator and companion tool for Claude Code. It provides project management, git workflows, visual flow building, and a curated Claude Code interface — all while minimizing token usage and running entirely on a Claude subscription.

See `APP_BUILD_DESCRIPTION.md` for the full feature specification.

## First Steps — Every Session

1. Read `claude_knowledge/mind-map.json` to understand what knowledge files exist and their purpose
2. Check relevant knowledge files based on the current task
3. After writing code or discovering anything worth persisting, run the `/document` skill

## Tech Stack

- **Framework**: Tauri v2 (Rust backend + webview frontend)
- **Frontend**: React + TypeScript
- **Flow Builder**: React Flow
- **Code Viewer**: Monaco Editor (read-only) or Shiki
- **Diff Viewer**: Monaco diff editor
- **Terminal**: xterm.js + PTY
- **Git**: CLI via Rust subprocess
- **Claude Integration**: Claude Code SDK + embedded terminal (hybrid)

## Key Constraints

1. **Must run on Claude subscription** — no separate API keys. All Claude interactions go through Claude Code's auth.
2. **Token efficient** — app handles orchestration logic in Rust/JS, not in prompts. Claude only gets minimum context needed for actual work.
3. **Never touches project repos** — no files injected into user repositories. All state lives in `~/.productaflows/`.
4. **Single install file** — OS-specific executables (.msi, .dmg, .AppImage/.deb).

## Project Structure

See `claude_knowledge/codebase_structure.md` for the full layout.

## Conventions

- All frontend code in `src/` (React + TypeScript)
- All backend code in `src-tauri/` (Rust)
- Shared types between frontend and backend via Tauri's command system
- Knowledge files in `claude_knowledge/` — update these when patterns, decisions, or gotchas are discovered
- Run `/document` after completing any meaningful work
- Update `claude_knowledge/project_status.md` at the end of each work session — mark completed items, add new in-progress/not-started items, note any new issues
