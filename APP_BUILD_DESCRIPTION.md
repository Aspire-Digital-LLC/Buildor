# ProductaFlows — App Build Description

## Overview

ProductaFlows is a cross-platform desktop application that serves as a visual orchestrator and companion tool for Claude Code. It replaces the need for a traditional IDE for AI-driven development by providing project management, git workflows, visual flow building, and a curated Claude Code interface — all while minimizing token usage and running entirely on a Claude subscription.

---

## Core Principles

1. **Must run on a Claude subscription** — all Claude interactions go through Claude Code's auth. No separate API keys required. Subagents (including Haiku routing) are invoked via Claude Code, not direct API calls.
2. **Token efficient** — the app handles all orchestration logic in application code (Rust/JS), not in prompts. Claude only receives the minimum context needed to do actual work. No administrative token overhead.
3. **Never touches the project repo** — no files injected into project repositories. All orchestration state, context files, and configuration live in the app's own data directory. Projects work with or without the app.
4. **Single install file** — distributed as an OS-specific executable (`.msi` for Windows, `.dmg` for macOS, `.AppImage`/`.deb` for Linux).

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | **Tauri v2** | Cross-platform, native multi-window support, lightweight (uses OS webview), Rust backend |
| Frontend | **React** (or Svelte — TBD) | Component-based UI, rich ecosystem for flow builders and code viewers |
| Backend | **Rust** (Tauri core) | File system ops, git CLI integration, process management, window management |
| Claude Integration | **Claude Code SDK** (`@anthropic-ai/claude-code`) + **embedded terminal** (xterm.js + PTY) | SDK for programmatic orchestration, terminal for interactive chat. Hybrid approach. |
| Flow Builder | **React Flow** (or Svelte Flow) | Mature node-based editor with drag-and-drop, connectors, and customization |
| Code Viewer | **Shiki** or **Monaco (read-only)** | Syntax highlighting for read-only code browsing |
| Diff Viewer | **Monaco diff editor** or **diff2html** | Side-by-side change comparison |
| Git Operations | **git CLI** (shelled out from Rust) | Reliable, full-featured, no library abstraction leaks |
| Terminal Emulator | **xterm.js** + Rust PTY backend | Embedded Claude Code interactive sessions |

---

## Architecture

```
ProductaFlows (Tauri App)
│
├── Rust Backend
│   ├── Project Manager (add/remove/switch projects)
│   ├── Worktree Manager (create/destroy/clean git worktrees)
│   ├── Git Operations (status, diff, stage, commit, push, pull, branch)
│   ├── Flow Orchestrator (reads flow JSON, manages phase sequencing, parallelism, dependencies)
│   ├── Context File Manager (read/write local-development/ files in app data dir)
│   ├── Claude Code Process Manager (spawn/manage SDK and terminal sessions)
│   ├── Window Manager (spawn/arrange breakout windows per worktree)
│   └── Workflows Repo Sync (auto-pull, commit, push, PR for shared repo)
│
├── Frontend (per-window webviews)
│   ├── Source Control Panel (git UI)
│   ├── Code Viewer (read-only, syntax highlighted)
│   ├── Flow Builder (drag-and-drop visual editor)
│   ├── Command Palette (skill browser with auto-generated forms)
│   ├── Claude Chat (conversation mode + verbose mode toggle)
│   ├── Project Switcher
│   └── Worktree Manager UI
│
└── Shared Data
    ├── App Config (~/.productaflows/)
    ├── Per-project orchestration state (~/.productaflows/projects/{name}/...)
    └── Workflows Repo (external git repo, synced)
```

---

## Features

### 1. Project Management

- **Add projects** via `+ Project` button — each project points to a local git repo folder
- **Switch between projects** freely, or have **multiple projects open simultaneously**
- Each project has its own set of worktrees, windows, and Claude sessions
- Project configuration stored in app data, not in the repo

### 2. Worktree Management

- **Create worktrees** from the UI — pick a branch or create a new one, click create
- **Destroy worktrees** individually or **bulk clean all** per project
- Each worktree is an independent workspace with its own:
  - Source control panel
  - Code viewer
  - Claude Code session
  - Flow progress tracking
- Visual distinction (color-coding/tagging) per project and worktree for multi-monitor setups

### 3. Git UI (Source Control)

Full VS Code-style source control experience:
- View changed files with status indicators
- **Side-by-side diff viewer** (left: before, right: after)
- Stage / unstage individual files or hunks
- Commit with message
- Push / pull
- Create / switch branches
- All standard git operations through a visual interface

### 4. Code Viewer (Read-Only)

- Browse any file in the current repo/worktree
- **Syntax highlighting** for all common languages
- File tree navigation
- **Not an editor** — Claude Code does the editing, the user reviews
- Search within files

### 5. Claude Code Integration

**Hybrid approach:**
- **Embedded terminal** — full interactive Claude Code CLI experience inside the app, running on the user's subscription auth
- **SDK integration** — programmatic control for orchestrating flows, spawning phase agents

**Two display modes:**
- **Conversation mode** (default) — shows only Claude's responses, questions, file changes, phase progress, errors. Hides subagent calls, tool mechanics, context file management, system prompts.
- **Verbose mode** — shows everything for power users who want full visibility

**Skill routing:**
- When user types a free-form message (not via palette), a **Haiku subagent** checks the message against skill descriptions
- If a skill matches, its full prompt is injected into context
- If no match, the message passes straight through
- Minimal token cost for the routing decision

### 6. Visual Flow Builder

- **Drag-and-drop canvas** — nodes represent stages, lines represent dependencies
- **`+ Stage`** to add a new stage node
- Click a node to configure:
  - Name, icon, description
  - Model (opus, sonnet, haiku)
  - Requirements and restrictions (text)
  - Skills available (select from library)
  - Context scope (which prior stages' output to pass)
  - Parallel options (which stages can run concurrently)
  - Autonomous toggle (bypass permissions or interactive)
  - Skippable toggle
  - Plan mode toggle
  - Task-based toggle (for parallel sub-task decomposition)
- Auto-generates flow JSON from the visual layout
- Flows saved to the shared workflows repo

### 7. Command Palette

- **Searchable palette** of all available skills and flows
- Select a skill → **popup modal with auto-generated form** based on the skill's parameter schema
  - Required fields, optional flags, dropdowns, toggles, text inputs
- Fill in the form → app assembles the full instruction string → passes to Claude Code
- Accessible via keyboard shortcut
- Shows both global and project-scoped skills (visually distinguished)

### 8. Skill & Flow Library

- **Shared team repo** containing:
  ```
  team-workflows-repo/
  ├── .productaflows.json    # Config: default branch, auto-pull
  ├── flows/                 # Flow definitions (JSON)
  └── skills/                # Skill/command prompts (Markdown)
  ```
- **Auto-pull on app open** — pulls the branch specified in `.productaflows.json` so the team always has the latest
- **Scoping** — skills and flows can be global (available to all projects) or project-specific
- **Git workflow for changes:**
  - Edit flows/skills in the app
  - See diffs in the same source control UI
  - Commit and push directly, or create branch and raise PR
  - Configurable per-repo: direct push allowed, or PR required

### 9. App-as-Orchestrator

This is the core architectural advantage. The app replaces the ~3000-token orchestrator prompt with application code:

- **App reads flow JSON** and manages phase sequencing, parallelism, and dependencies in Rust/JS
- **App manages context files** — reads/writes `local-development/*.md` in its own data directory (`~/.productaflows/projects/{name}/{worktree}/local-development/`)
- **App spawns Claude Code per phase** — each invocation receives only the stage prompt + scoped context. No meta-reasoning about pipeline management.
- **App tracks progress** in its own UI — no TaskCreate/TaskUpdate token overhead
- **App handles session recovery** natively — it knows its own state, no need for Claude to reconstruct it
- **Token savings are massive** — Claude only spends tokens on actual work, never on orchestration logistics

### 10. Breakout Windows

- Any panel can be **broken out** into its own window
- Arrange across multiple monitors
- Per-project/worktree color-coding so scattered windows are identifiable
- Windows share the same Rust backend process (Tauri multi-window)
- Lightweight — each window is a native webview, not a full browser instance

---

## Data Model

### App Configuration

```
~/.productaflows/
├── config.json                          # Global app settings
├── projects/
│   ├── {project-slug}/
│   │   ├── project.json                 # Project config (repo path, scoped skills, settings)
│   │   ├── worktrees/
│   │   │   ├── {worktree-slug}/
│   │   │   │   └── local-development/   # Orchestration context files
│   │   │   └── ...
│   │   └── ...
│   └── ...
└── workflows-repo/                      # Path reference to shared repo
```

### Shared Workflows Repo

```
{team-workflows-repo}/
├── .productaflows.json                  # { "defaultBranch": "main", "autoPull": true }
├── flows/
│   ├── develop.json
│   ├── hotfix.json
│   └── ...
└── skills/
    ├── commit.md
    ├── open-local-env.md
    └── ...
```

### Key Design Decisions

- **No separate agent concept** — agent definitions (role, persona, instructions) are embedded in stage configuration within flows. Two concepts only: flows (with stages) and skills.
- **No repo pollution** — the app never writes files to project repositories. All state is in `~/.productaflows/`.
- **Shared repo config is minimal** — `.productaflows.json` lives in the workflows repo so the team shares branch config.

---

## Phase 2 (Future — Design for Now, Build Later)

### Internal API / CLI Layer

- The app exposes an API (likely CLI) that Claude Code can call back into
- Enables **bidirectional** communication: app drives Claude, Claude can also modify the app's data
- Use case: chat with Claude in a side panel and ask it to build/modify flows, skills, and stages — Claude calls the app's API, changes appear in the flow builder in real time
- Commands like: `app skill create ...`, `app flow add-stage ...`, `app flow connect ...`
- **Requirement for Phase 1**: ensure the data layer (flows, skills, stages) is cleanly separated and programmatically accessible, not baked into UI components

---

## Distribution

| Platform | Format |
|----------|--------|
| Windows | `.msi` installer |
| macOS | `.dmg` |
| Linux | `.AppImage` and/or `.deb` |

Built via Tauri's bundling system, which produces OS-native installers from a single codebase.

---

## Auto-Update System

- The **ProductaFlows source repo** contains a version file (e.g., `version.json` or `package.json` version field)
- The installed app knows its own version (baked in at build time via `tauri.conf.json`)
- **On app launch**: the app checks the source repo for the latest version file. If the repo version is higher than the installed version, a non-intrusive notification offers the user an update option.
- **Manual check**: a "Check for Updates" menu item under Help (or Settings) triggers the same check on demand.
- Update flow:
  1. App fetches version file from the repo (via git or raw HTTP to the repo's default branch)
  2. Compares semantic version against installed version
  3. If newer: displays "Update available (v1.2.3 → v1.3.0)" with a link/button to download the new installer
  4. If current: "You're up to date"
- The download could point to GitHub Releases (or equivalent) where CI publishes the OS-specific installers

---

## Open Questions

1. **Claude Code SDK auth** — Does the SDK (`@anthropic-ai/claude-code`) work with subscription auth, or only API keys? The embedded terminal definitely works with subscriptions. If the SDK requires API keys, the app may need to lean more heavily on the terminal approach for orchestration, or find a workaround.
2. **Frontend framework** — React vs Svelte. React has a larger ecosystem (React Flow, Monaco React wrappers). Svelte is lighter and may pair better with Tauri. TBD during prototyping.
3. **Skill parameter schema** — Need to define a standard schema format for skill inputs so the command palette can auto-generate forms. Draft:
   ```json
   {
     "params": [
       { "name": "description", "type": "text", "required": true },
       { "name": "issue", "type": "number", "required": false, "flag": "--issue" }
     ]
   }
   ```
