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

**Choice**: All app state in `~/.productaflows/`, nothing in project repos
**Rejected**: Injecting config/context files into project repos (even gitignored)

**Why**: Projects must work with or without ProductaFlows. Team members who don't use the app shouldn't see artifacts. Context files, orchestration state, and configuration all live in the app's own data directory.

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
