# Patterns

Established code patterns, conventions, and reusable approaches in this project. Follow these unless there's a strong reason to deviate.

---

## Template — Copy This for New Entries

### [Pattern Name]

**When to use**: The situation this pattern applies to
**Implementation**: How to implement it
**Example**: Code or file reference
**Why**: Rationale for this approach

---

### Tab Context for Project Scoping

**When to use**: Any panel component that needs to know which project it belongs to
**Implementation**: Import `useTabContext()` to get `projectName`, then look up the project from `useProjectStore().projects`
**Example**: `src/components/source-control/SourceControl.tsx` — `const { projectName } = useTabContext(); const activeProject = projects.find(p => p.name === projectName);`
**Why**: Panels are mounted inside TabContextProvider by MainLayout. This replaces the old global `activeProject` pattern and allows multiple panels for different projects open simultaneously.

---

### Edit/Save/Cancel Pattern for Read-Only-First Components

**When to use**: Any viewer that might occasionally need editing (code viewer, config files, .env)
**Implementation**: Default to `readOnly: true` in Monaco. An "Edit" button toggles editing on. Edit button disappears, replaced by Save/Cancel. A colored indicator bar signals edit mode. Save writes via Rust command, reloads file, exits edit mode. Cancel resets editor content.
**Example**: `src/components/code-viewer/EditorPanel.tsx`
**Why**: AI-first app — editing must be deliberate, not accidental. The read-only default prevents users from accidentally modifying files.

---

### Sidebar Badge Pattern for Status Indicators

**When to use**: When a sidebar icon needs to show a count or status indicator
**Implementation**: Position a small circle (`position: absolute, bottom: 4, right: 4`) on the button with `minWidth: 16, height: 16, borderRadius: 8`. Poll the data source on the same interval as the related feature.
**Example**: Source control icon badge in `src/components/layout/Sidebar.tsx` — polls git status every 5s, shows total uncommitted changes.
**Why**: Gives users at-a-glance awareness without opening the panel.

---

### Language Stats from File Extension Scanning

**When to use**: Showing language composition of a repository (project cards, dashboards)
**Implementation**: Rust command `get_language_stats` uses the `ignore` crate's WalkBuilder (respects .gitignore), counts bytes per file extension, maps to language names and GitHub-standard colors.
**Example**: `src-tauri/src/commands/filesystem.rs` — `get_language_stats`, displayed in `ProjectSwitcher.tsx`
**Why**: No API call needed — computed locally, fast, respects gitignore. Colors match GitHub for familiarity.

---

### Event-Driven Store Pattern (Usage Tracking)

**When to use**: When a Zustand store needs to react to event bus emissions without component mounting
**Implementation**: Subscribe to `buildorEvents` at module scope (outside the store creator) using `store.getState()` to call actions. This ensures events update the store even when no component is subscribed.
**Example**: `src/stores/usageStore.ts` — subscribes to `usage-updated`, `cost-updated`, `session-started`, `session-ended` at module level
**Why**: Decouples data aggregation from UI rendering. The store accumulates token counts from stream events regardless of which panel is active.

---

### CSS Variable Theme System

**When to use**: Any component that renders structural UI colors (backgrounds, borders, text). Does NOT apply to semantic status colors (#3fb950 green, #f85149 red, #d29922 amber, #da3633 red button, #238636 green button, #d2a8ff purple/worktree).
**Implementation**: Use `var(--xxx)` CSS variables in inline styles. Theme definitions live in `src/themes/themes.ts`. The Zustand store `src/stores/themeStore.ts` persists the selected theme to localStorage and applies CSS variables to `document.documentElement` on load. Light themes also call `setTheme('light')` via `@tauri-apps/api/app` to flip the native title bar.
**Key variables**: `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-active`, `--bg-elevated`, `--bg-inset`, `--border-primary`, `--border-secondary`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--accent-primary`, `--accent-secondary`, `--accent-muted`, `--statusbar-bg`, `--scrollbar-track`, `--scrollbar-thumb`, `--scrollbar-hover`, `--shadow-color`, `--text-on-accent`
**Adding a new theme**: Add a `theme(...)` call to the `themes` array in `themes.ts` with all 20 CSS variable values, a `dark` boolean, and preview swatches.
**Why**: All components used hardcoded hex colors. CSS variables enable theme switching without re-rendering — just update `:root` properties. The theme store rehydrates synchronously from localStorage so there's no flash of wrong theme.

---

### VS Code-Style StatusBar

**When to use**: App-wide status information that should always be visible
**Implementation**: `StatusBar` component in `src/components/layout/StatusBar.tsx`, placed below the Sidebar+Content flex container in `MainLayout.tsx`. Uses `useUsageStore` + `useProjectStore` for data. Polls `claude status` CLI every 5 minutes for plan/quota info.
**Example**: Left side: git branch, project, model, cost. Right side: plan badge, context window %, session tokens, weekly usage %, reset time.
**Why**: Spans full window width (24px tall), always visible regardless of active panel. Matches VS Code's status bar UX.

---

### Chat History Persistence Hook

**When to use**: Any chat component (main or breakout) that needs to persist messages to SQLite
**Implementation**: Import `useChatHistory()` with `{ projectName, repoPath, branchName, worktreeSessionId? }`. Returns `{ startSession, endSession, saveMessage, saveUserMessage }`. Call `startSession(sid)` after Claude starts, `saveMessage(parsed)` on each stream event, `saveUserMessage(content)` on user sends, `endSession()` on stop/clear/exit.
**Example**: `src/components/claude-chat/ClaudeChat.tsx` and `src/windows/claude/ClaudeChatWindow.tsx`
**Why**: All message saves are fire-and-forget (`.catch(() => {})`) — logging must never break the chat flow. The hook tracks seq counter and user message count internally for title generation triggers.

---

### Raw JSON Agent Output Listener

**When to use**: When an agent subprocess needs event-level parsing beyond what `parseStreamEvent` provides
**Implementation**: In `useAgentPool`, the per-agent Tauri listener receives raw JSON lines from `claude-output-{sid}`. Parse each line with `JSON.parse()` to extract `content_block_start`, `content_block_delta`, `result`, and `control_request/permission` events. `parseStreamEvent` handles structured messages, but raw JSON catches streaming deltas (for health keepalive), result events (for completion), and permission requests (for auto-accept).
**Example**: `src/hooks/useAgentPool.ts` — the `listen()` callback processes raw JSON, emits `message-received` for deltas, detects `result` for completion, and auto-responds to permissions
**Why**: `parseStreamEvent` returns null for partial events like `content_block_delta`. The health monitor needs these to avoid false distress. Completion detection needs the `result` event which has no `parseStreamEvent` equivalent. Permission auto-accept needs the raw `control_request` before it reaches the UI layer.

---

### Shared DB Accessor Pattern

**When to use**: Any Rust module that needs the logging/chat history SQLite database
**Implementation**: Call `crate::logging::get_log_db()` which returns `Result<&'static LogDb, String>`. The `LogDb` is initialized once via `OnceLock` and shared across all commands.
**Example**: `src-tauri/src/commands/chat_history.rs`, `src-tauri/src/commands/logging.rs`, `src-tauri/src/commands/worktree.rs` (cleanup)
**Why**: Replaces the per-module `OnceLock` pattern that was duplicated in `commands/logging.rs`. Single source of truth for the database connection.
