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

## Protocol-Level Interrupt over Kill+Restart+Replay

**Choice**: Use `control_request` with `subtype: "interrupt"` and `subtype: "set_model"` to stop turns and switch models without killing the process
**Rejected**: Kill process, capture conversation as text blob, restart, replay

**Why**: Killing the process destroys the prompt cache (the stable prefix that Anthropic's API caches server-side). Replaying as a text blob is lossy (tool calls, thinking blocks, and context structure are lost) and wastes tokens re-processing the entire conversation. The stream-json protocol natively supports interrupt and model switching — using these preserves the warm cache, full structured context, and eliminates the replay code path entirely.

---

## Slash Commands Handled at App Layer over Pass-Through

**Choice**: Intercept /commands in the chat input and handle them in Buildor's app code
**Rejected**: Passing slash commands through to the Claude Code CLI

**Why**: Claude Code's slash commands only work in interactive terminal mode — they're not supported in `--print` mode with `stream-json` protocol. By handling them in the app layer, we can implement equivalents: `/model` restarts the session with `--model` flag and replays conversation context; `/login` and `/logout` spawn `claude login/logout` as separate subprocesses for browser OAuth; `/clear` resets the session. The autocomplete UX matches developer expectations from VS Code command palettes.

---

## Chat History in Same SQLite DB over Separate Storage

**Choice**: Store chat sessions and messages in the existing `logs.db` alongside the `logs` table
**Rejected**: Separate JSON files per session, separate SQLite database

**Why**: The logging DB infrastructure (OnceLock singleton, Mutex connection, Tauri command pattern) was already built. Adding tables to the same DB avoids a second connection lifecycle. SQLite handles concurrent reads well with WAL mode. CASCADE deletes make cleanup trivial — delete a session row and all messages vanish.

---

## Aware Injection (Smart Context) over Raw Transcript Injection

**Choice**: Smart injection — small sessions get full transcript, large sessions get summary + last 10% verbatim
**Rejected**: Always inject full transcript, or always inject summary only

**Why**: Full transcripts of large sessions would blow out the context window. Summary-only loses specific details the user might reference. The hybrid approach preserves recent context (where the user's mental model is freshest) while compressing older content. Telling Claude which mode was used lets it respond honestly when it can't find something.

---

## Collapsible Palette as Vertical Bar over Toggle Button

**Choice**: Skills & Flows palette collapses to a thin vertical bar with sideways text on the right edge
**Rejected**: Toggle button in the header that shows/hides the palette completely

**Why**: A toggle button that makes the palette disappear entirely loses the visual affordance — users forget it exists. A persistent thin bar with sideways "SKILLS & FLOWS" text (VS Code's Debug Console pattern) maintains discoverability while reclaiming horizontal space. Clicking the bar expands, clicking the header chevron collapses.

---

## Image File Storage over DB Blob Storage

**Choice**: Save chat images as files in `{appData}/images/{sessionId}/`, store file path in message JSON
**Rejected**: Storing base64 image data directly in SQLite `content_json`

**Why**: Base64 screenshots can be 100KB+ each. Storing them in SQLite bloats the DB, slows queries, and makes history injection (which reads `content_json`) carry image payloads it doesn't need. File-based storage decouples image lifecycle from DB access patterns. Cleanup is simple: `delete_images_for_sessions()` removes the directory before CASCADE deletes the DB rows.

---

## Result Mailbox over Message Queue / Mutex Locks

**Choice**: File-backed mailbox with dependency resolution for inter-agent communication
**Rejected**: Traditional message queue, shared mutex locks, real-time pub/sub channels

**Why**: Agents are I/O-bound (waiting on Claude API), not CPU-bound — mutex semantics are the wrong primitive. A message queue implies continuous consumption, but agents produce one result and exit. The mailbox pattern matches the actual lifecycle: agent runs → deposits result → consumer reads it when ready. File-backed storage (`~/.buildor/agent-results/`) survives app restarts and works without the frontend being alive. Dependency resolution is event-driven (check on deposit) rather than polling. This is the **defacto agent communication technique** — all future inter-agent data sharing must use this system.

---

## Centralized History Injection Prompts over Inline Strings

**Choice**: All history injection prompt text in `src/prompts/historyInjection.ts`
**Rejected**: Hardcoded strings scattered in `buildAwareContext.ts`

**Why**: History injection instructions are the kind of text that evolves — adding image handling guidance, tweaking partial-mode language, etc. Having them in one file makes them auditable, diffable, and easy to update without hunting through utility functions. Also establishes the pattern for future prompt centralization (flow prompts, skill prompts).

---

## parking_lot + priority-queue over std::sync + BinaryHeap

**Choice**: `parking_lot::Mutex`/`RwLock` for synchronization, `priority_queue::PriorityQueue` for per-tier scheduling
**Rejected**: `std::sync::Mutex`, `BinaryHeap`

**Why**: The operation pool tick loop runs every 100ms and acquires multiple locks per tick. `parking_lot` provides non-poisoning mutexes (no `.unwrap()` chains after panic recovery) and faster uncontended acquisition. `PriorityQueue` supports `change_priority()` for aging ops in-place without drain-and-rebuild — `BinaryHeap` has no priority update API.

---

## Tick-Based Scheduler over Work-Stealing or Immediate Dispatch

**Choice**: Fixed 100ms tick loop that selects and dispatches candidates in batches
**Rejected**: Work-stealing thread pool (rayon), immediate dispatch on submit

**Why**: The pool needs cross-lane arbitration (global thread cap, Tier 1 priority, age fairness). Immediate dispatch can't enforce a global cap without blocking the submitter. Work-stealing pools don't support per-lane concurrency limits or two-tier priority. A tick loop naturally batches: collect candidates from all lanes → sort by priority → trim to pool cap → execute. The 100ms interval is fast enough for interactive feel while avoiding busy-spin overhead.

---

## Checkpoint-Based Delta Scanning over Full Scans

**Choice**: Skills that analyze the repo (like `/document`) use checkpoint files to track last-processed commit and only scan new commits
**Rejected**: Full-repo scan every time, git-notes-based tracking, in-memory state

**Why**: A full scan of 80+ commits requires reading dozens of files and produces duplicate documentation. Git notes pollute the repo's ref namespace and don't survive clone. In-memory state doesn't persist across sessions. File-based checkpoints in `claude_knowledge/checkpoints/` are version-controlled, auditable, and trivially parseable. The context-engine skill abstracts checkpoint CRUD so any skill can adopt delta scanning with two calls (get range, write checkpoint).

---

## Three-Tier Priority over Two-Tier (App / User / Subagent)

**Choice**: Three priority tiers — App (200), User (100), Subagent (0) — with App and User sharing the Tier 1 queue
**Rejected**: Two-tier (User/Subagent) where all Buildor UI operations shared the User tier

**Why**: `Tier::User` was originally used for both Buildor UI actions (git, shell, worktree) and Claude session operations. This conflated two semantically different callers. When the permission pipeline is implemented (routing Claude tool calls through the pool), User needs to mean "Claude's own tool calls" — not "the app's UI-driven operations." Adding `Tier::App` at base priority 200 ensures Buildor's own operations (git status, shell commands, session spawning) always preempt Claude tool calls, which in turn preempt sub-agent background work. The three tiers map cleanly to the caller hierarchy: Buildor app > primary Claude session > sub-agents.

---

## Skills as Forked Agents over Inline Injection for Heavy Work

**Choice**: `/document`, `/read-logs`, and other heavy skills use `context: "fork"` to run as separate agent processes
**Rejected**: Injecting skill prompts into the active chat session

**Why**: Heavy skills (documentation scans, log analysis) can take minutes and produce large outputs. Running them inline blocks the user's chat session — they can't ask questions or do other work while the skill runs. Forking as an agent gives the skill its own Claude process with independent context window, lets the user continue chatting, and produces a clean result that's injected back when done. The agent pool infrastructure (health monitoring, mailbox, transcript persistence) applies automatically.

---

## Shared Memory Repo over Separate Skills Sync

**Choice**: Skills resolve from `{sharedMemoryRepo}/skills/` directory, falling back to `~/.buildor/skills/`
**Rejected**: Dedicated git-backed skills sync system (`skill_sync.rs`, `SharedSkillsRepo.tsx`, startup auto-sync)

**Why**: The original design had a separate "Shared Skills Repository" with its own git clone/pull/push lifecycle, status UI, and startup sync. This duplicated what the Shared Memory repo already provides — a single git-backed repo for shared configuration (flows, skills, defaults). Skills are just another type of shared content. Consolidating them into the shared memory repo eliminates ~700 lines of dedicated sync infrastructure (Rust backend, React UI, TypeScript commands), removes a separate Settings panel section, and gives skills the same sync lifecycle as flows. The `buildor_skills_dir()` function now reads `sharedMemoryRepo` from config and resolves `{repo}/skills/`.
