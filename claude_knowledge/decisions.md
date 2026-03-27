# Decisions

Architectural and design decisions with rationale. Each entry explains why X was chosen over Y.

---

## Tauri over Electron

**Choice**: Tauri v2
**Rejected**: Electron

**Why**: Multi-window is a core feature — users will have many breakout windows across monitors. Electron bundles Chromium per window, making this expensive. Tauri uses the OS native webview, so each window is lightweight. Rust backend also provides better performance for git operations and process management.

---

## React over Svelte

**Choice**: React
**Rejected**: Svelte

**Why**: React Flow (visual flow builder) is more mature than Svelte Flow. Monaco Editor has first-class React bindings. The ecosystem for complex UI components (command palettes, tree views, modals) is deeper in React. Cross-platform is unaffected — both render to HTML in Tauri's webview.

---

## App-as-Orchestrator over Prompt-based Orchestration

**Choice**: Orchestration logic in Rust/JS application code
**Rejected**: Large orchestrator prompt that tells Claude how to manage the pipeline

**Why**: The orchestrator prompt was ~3000 tokens of administrative instructions on every run. Claude spent tokens on meta-reasoning (which phase am I on, parse the manifest, wire dependencies) instead of actual work. Moving this to app code eliminates that overhead entirely. Each Claude invocation becomes a focused worker receiving only its stage prompt and scoped context.

---

## Two Concepts (Flows + Skills) over Three (Flows + Skills + Agents)

**Choice**: Flows contain stages with embedded agent configuration. Skills are reusable instruction templates.
**Rejected**: Separate agent definition files

**Why**: Agent definitions (role, persona, model, instructions) are properties of a stage within a flow. Extracting them to separate files adds indirection without value when the app is the orchestrator. Two concepts are simpler to manage, version, and share.

---

## No Repo Pollution

**Choice**: All app state in `~/.buildor/`, nothing in project repos
**Rejected**: Injecting config/context files into project repos (even gitignored)

**Why**: Projects must work with or without Buildor. Team members who don't use the app shouldn't see artifacts. Context files, orchestration state, and configuration all live in the app's own data directory.

---

## Hybrid Claude Integration (SDK + Terminal)

**Choice**: Claude Code SDK for programmatic orchestration + embedded terminal (xterm.js) for interactive chat
**Rejected**: SDK-only or terminal-only

**Why**: The terminal guarantees subscription auth works and gives users the familiar Claude Code experience. The SDK (if subscription-compatible) enables cleaner programmatic control for flow execution. Hybrid covers both cases.

---

## Shared Workflows Repo

**Choice**: Skills and flows stored in a git repo, synced by the app
**Rejected**: App-internal storage only

**Why**: Teams need to share, version, and review workflow changes. A git repo provides PRs, history, and branch protection for free. The app auto-pulls on launch to keep everyone current.

---

## Tab-Based Workspace over Router Pages

**Choice**: VS Code-style tabs where each open panel is a tab scoped to a project
**Rejected**: React Router single-panel navigation (one panel visible at a time)

**Why**: Developers need multiple panels open simultaneously — Code Viewer for one project, Source Control for another. Sidebar icons become project-aware launchers (click → dropdown of loaded projects → opens a tab). Tabs have close buttons, show "Panel - RepoName" titles. This matches the mental model of "I have 5 worktrees across 2 projects" rather than "I'm looking at one thing at a time."

---

## Start Session as the Primary Workflow Entry Point

**Choice**: "Start Session" modal as the main way to begin work — creates a worktree with structured naming
**Rejected**: Manually creating worktrees and branches

**Why**: The developer's focus is: open Claude, for a project, for a worktree, off a branch. The session modal captures this in one flow: pick project, pick base branch, pick type (bug/feature/issue/docs/release), optionally link a GitHub issue, auto-generate branch name via Haiku slug, create worktree, optionally launch Claude Chat. Structured branch naming (`{type}-{base}/{issue#}/{slug}`) ensures consistency across the team.

---

## Worktree-per-Session Model

**Choice**: Each development session creates a git worktree as its isolated workspace
**Rejected**: Working directly on branches in the main checkout

**Why**: Worktrees provide true isolation — multiple sessions can run in parallel without conflicts. Each worktree gets its own Claude Code instance scoped to its directory. Cleanup is simple: remove the worktree. The Worktree Manager shows all open sessions grouped by project with close individual/per-project/global options.

---

## Haiku Subagent for Slug Generation

**Choice**: Spawn a Claude Code Haiku subagent to generate branch name slugs from issue descriptions
**Rejected**: Manual slug entry, or simple string truncation

**Why**: Haiku is cheap and fast. It produces meaningful, readable slugs from natural language descriptions or GitHub issue titles. Runs through Claude Code (subscription auth), no separate API key needed. The alternative — asking the user to type a slug — adds friction to the session creation flow.

---

## GitHub Issue Downloads Scoped to Session Lifecycle

**Choice**: Downloaded issue data (text, images) stored in `~/.buildor/projects/{name}/sessions/{worktree-slug}/`, destroyed when session closes
**Rejected**: Storing issue data in the repo or keeping it permanently

**Why**: Issue context is only needed during the active session. Storing it in the app's data directory (not the repo) avoids pollution. Tying cleanup to session close ensures no orphaned artifacts. Images are downloaded locally so Claude can analyze them without network dependencies during the session.

---

## Version in Native Title Bar

**Choice**: Version displayed in Tauri's native window title bar ("Buildor v0.0.1")
**Rejected**: Custom rendered title bar within the webview

**Why**: A custom title bar created a duplicate bar below the native one — confusing and wasteful of vertical space. The native title bar is free, always visible, and consistent with OS conventions. Version comes from tauri.conf.json, synced with the VERSION file.

---

## Grouped Sidebar Dropdowns over Flat Project Lists

**Choice**: Sidebar icons for Code Viewer, Source Control, and Claude Chat show a grouped dropdown with project headers (non-clickable), checked-out branches, and worktree branches beneath each project
**Rejected**: Flat project list where clicking opens the panel for the whole project

**Why**: Developers work across multiple branches and worktrees simultaneously. A flat list forces one view per project. The grouped dropdown lets you open separate tabs for each branch/worktree — "Code Viewer for optiai-me/main" alongside "Code Viewer for optiai-me/feature-branch". Claude Chat dropdown intentionally excludes worktrees since those have their own breakout windows.

---

## Slash Commands Handled at App Layer over Pass-Through

**Choice**: Intercept /commands in the chat input and handle them in Buildor's app code
**Rejected**: Passing slash commands through to the Claude Code CLI

**Why**: Claude Code's slash commands only work in interactive terminal mode — they're not supported in `--print` mode with `stream-json` protocol. By handling them in the app layer, we can implement equivalents: `/model` restarts the session with `--model` flag and replays conversation context; `/login` and `/logout` spawn `claude login/logout` as separate subprocesses for browser OAuth; `/clear` resets the session. The autocomplete UX matches developer expectations from VS Code command palettes.

---

## Collapsible Palette as Vertical Bar over Toggle Button

**Choice**: Skills & Flows palette collapses to a thin vertical bar with sideways text on the right edge
**Rejected**: Toggle button in the header that shows/hides the palette completely

**Why**: A toggle button that makes the palette disappear entirely loses the visual affordance — users forget it exists. A persistent thin bar with sideways "SKILLS & FLOWS" text (VS Code's Debug Console pattern) maintains discoverability while reclaiming horizontal space. Clicking the bar expands, clicking the header chevron collapses.
