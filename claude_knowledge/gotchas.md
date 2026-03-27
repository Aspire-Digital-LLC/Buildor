# Gotchas

Surprising behaviors, bugs encountered, and non-obvious pitfalls. Each entry describes what went wrong (or could go wrong) and the workaround.

---

## Template — Copy This for New Entries

### [Short Title]

**Context**: What you were doing
**Surprise**: What was unexpected
**Impact**: What broke or could break
**Workaround**: How to avoid or fix it

---

### Monaco DiffEditor Revert Icons Have No Customizable Tooltip

**Context**: Using Monaco's `DiffEditor` with `renderMarginRevertIcon: true` to show revert arrows between diff panes
**Surprise**: The revert arrow icons rendered by Monaco have no native tooltip/title attribute. Hovering shows nothing. The icon class names are internal and vary by Monaco version.
**Impact**: Users don't know what the arrow does without a tooltip — poor discoverability
**Workaround**: Use a `MutationObserver` in the `onMount` callback to watch for revert icon elements and inject `title="Revert this change"` attributes. Also add CSS `::after` pseudo-element tooltips targeting `.codicon-arrow-right` and `.revert-button` classes as a fallback. Neither approach is guaranteed across Monaco versions — test after upgrades.

---

### Serde snake_case vs camelCase Mismatch Between Rust and TypeScript

**Context**: Rust structs use snake_case fields (`is_directory`, `repo_path`). TypeScript interfaces use camelCase (`isDirectory`, `repoPath`).
**Surprise**: Tauri serializes Rust struct fields as-is. Without `#[serde(rename_all = "camelCase")]`, the frontend receives `is_directory` but looks for `isDirectory` — silently fails, no error, just missing data.
**Impact**: File tree showed zero entries. Project list appeared empty. No error messages anywhere — very hard to debug.
**Workaround**: Always add `#[serde(rename_all = "camelCase")]` to every Rust struct that crosses the IPC boundary. Check this first when frontend data appears empty.

---

### Untracked Files Have No Previous Version for Diffing

**Context**: Source Control panel shows staged, unstaged, and untracked files. Clicking a file opens a diff view.
**Surprise**: Untracked files don't exist in the git index, so `git show :filename` fails. The `getFileDiffContent` command returns an error.
**Impact**: Untracked files were not clickable — no diff could be shown.
**Workaround**: Added a separate `viewUntrackedDiff` method that reads the file directly via `readFileContent` and shows it as a diff with an empty left pane (new file). Untracked files always show empty-vs-full-content.

---

### Rust MSVC Target Requires VS Build Tools (Not Optional)

**Context**: Installing Rust via `winget install Rustlang.Rust.MSVC` on Windows
**Surprise**: The MSVC Rust target requires the Microsoft C++ linker from Visual Studio Build Tools. Without it, `cargo build` fails with `linking with link.exe failed`. The GNU target alternative requires MinGW `dlltool.exe` which Git Bash doesn't include.
**Impact**: Build completely blocked until VS Build Tools are installed with the VCTools workload.
**Workaround**: Install via `rustup` (not winget MSI) for flexibility. Use MSVC target + VS Build Tools (`winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`). Requires admin/UAC approval.

---

### App Data Must Use OS-Standard Paths, Not Home Directory Dotfiles

**Context**: Originally stored config and logs at `~/.buildor/`. App rebuilds during development wiped this location or created confusion with multiple locations.
**Surprise**: On Windows, `~/.buildor/` is non-standard. App updates, reinstalls, or dev rebuilds don't preserve data at custom locations. Users expect app data at `%APPDATA%`.
**Impact**: Projects, settings, and logs disappeared after app rebuilds. Users had to re-add projects.
**Workaround**: Use `dirs_next::config_dir()` which returns the OS-standard location: `%APPDATA%/Buildor` (Windows), `~/Library/Application Support/Buildor` (macOS), `~/.config/Buildor` (Linux). Added auto-migration from the old `~/.buildor/` path. All new features must use `AppConfig::config_dir()` as the base path.

---

### Claude Code stream-json Permission Protocol is Undocumented

**Context**: Building interactive permission handling for Claude Chat — Approve/Always Allow/Deny buttons
**Surprise**: The `--permission-prompt-tool stdio` flag enables permission events in stream-json mode, but the response format is completely undocumented. The only reliable source is the Python Agent SDK source code (`claude-agent-sdk` on PyPI, file `_internal/query.py`).
**Impact**: Three iterations of wrong formats — `permission_response` (wrong type), `control_response` with `decision` field (wrong structure), `control_response` without `updatedInput` (tools don't execute). Each wrong format causes different failure: crash, hang, or silent no-op.
**Workaround**: The correct format from the Agent SDK source:
```json
{"type":"control_response","response":{"subtype":"success","request_id":"...","response":{"behavior":"allow","updatedInput":{...original tool input...}}}}
```
Key: `request_id` goes inside `response`, not top-level. `updatedInput` must echo the original tool input or the tool won't execute. Install `claude-agent-sdk` via pip and read `_internal/query.py` for the authoritative format.

---

### git branch --format Output Parsing After trim() Strips Branch Name Chars

**Context**: `git_list_branches` uses `--format=%(HEAD) %(refname:short) %(upstream:short)` and parses output
**Surprise**: Output lines start with `* ` (current) or `  ` (non-current). After `trim()`, non-current branches lose their leading spaces. The code then did `&line[2..]` unconditionally, chopping 2 chars from the actual branch name ("feature" → "ature", "origin" → "igin").
**Impact**: All non-current branch names were truncated by 2 characters in the branch list UI.
**Workaround**: Only skip 2 chars when `line.starts_with('*')`. For non-current branches after trim, the branch name starts at index 0.

---

### React Synthetic Events Become Null After Await in Async Handlers

**Context**: Sidebar dropdown positioning — `e.currentTarget.getBoundingClientRect()` called after `await listSessions()`
**Surprise**: React recycles synthetic events. After any `await`, `e.currentTarget` becomes null, so `getBoundingClientRect()` fails silently and the dropdown doesn't appear.
**Impact**: Code Viewer dropdown didn't open when clicked.
**Workaround**: Capture the rect BEFORE any async call: `const rect = e.currentTarget.getBoundingClientRect();` then do the async work, then use the captured rect.

---

### Stale Rust Build Cache After Project Rename

**Context**: Renamed project from ProductaFlows to Buildor
**Surprise**: Cargo's incremental build cache stored absolute paths to the old directory. Build failed with "failed to read plugin permissions" pointing to `C:\Git\ProductaFlows\...`.
**Impact**: `cargo build` / `tauri dev` completely broken until cache cleared.
**Workaround**: `cargo clean` in src-tauri/ (cleared 5.1GB). Full rebuild required.

---

### changeCounts Double-Counting When Keyed by Both Name and Path

**Context**: Sidebar badge shows total uncommitted changes. We store counts keyed by both `project.name` and `project.repoPath` to support both badge lookup and dropdown lookup.
**Surprise**: `Object.values(changeCounts).reduce(...)` sums ALL values including duplicates, so the badge showed 2x the real count.
**Impact**: Badge showed 46 instead of 23.
**Workaround**: Sum only by project name: `projects.reduce((sum, p) => sum + (changeCounts[p.name] || 0), 0)`.

---

### Claude.ai Usage API Requires Web Session, Not OAuth Token

**Context**: Trying to fetch usage data (session %, weekly %) from `claude.ai/api/organizations/{orgId}/usage`
**Surprise**: The OAuth token from `~/.claude/.credentials.json` (`sk-ant-oat01-*`) works for Claude Code CLI and some `/api/bootstrap` endpoints, but NOT for the usage endpoint. It returns `account_session_invalid`. The usage API requires a web session with HttpOnly cookies that can't be read via `document.cookie`.
**Impact**: Can't fetch usage stats with simple HTTP calls from Rust.
**Workaround**: Open a Tauri webview to `claude.ai` which gets the session cookies. Navigate the webview to the API endpoint. Read JSON from the page body using `win.eval()` + `window.location.hash` (not `document.title` — Tauri doesn't sync document.title to native window title). Store org ID + usage in `%APPDATA%/Buildor/claude_session.json`. For continuous polling, keep a persistent hidden webview (1x1px, off-screen) that refetches every 60 seconds.

---

### Tauri document.title Not Synced to Native Window Title

**Context**: Trying to pass data from injected JS in an external webview back to Rust via `document.title` / `win.title()`
**Surprise**: In Tauri v2, setting `document.title` in a webview (via `win.eval()`) does NOT update what `win.title()` returns in Rust. The native window title is set independently by `WebviewWindowBuilder`.
**Impact**: The `document.title` communication trick used in many Electron apps doesn't work in Tauri.
**Workaround**: Use `window.location.hash` instead — set it from JS via `window.location.hash = 'buildor_data_' + encodedPayload`, then read it from Rust via `win.url()` and parse the hash fragment.

---

### Zustand Stores Not Shared Across Tauri Windows

**Context**: Breakout windows (separate Tauri webviews) had missing usage data and theme despite the main window having it
**Surprise**: Each Tauri webview has its own JavaScript context. Zustand stores are per-window — state changes in the main window don't propagate to breakout windows, even with `persist` middleware (different localStorage scopes).
**Impact**: Breakout windows showed stale/empty data for usage stats and wrong theme.
**Workaround**: Use Tauri events to broadcast across windows. For themes: `applyTheme()` emits `theme-changed` via `@tauri-apps/api/event.emit()`, all windows listen. For usage: a hidden poller webview emits `usage-refreshed`, all StatusBar instances listen. For per-window state that needs fresh data: read from shared files (like `claude_session.json`) or Rust backend on mount.

---

### Silent Failures Hide Real Problems — Always Log Errors

**Context**: `loadProjects` in the project store failed silently — the outer catch set `error` in state but the UI showed an empty project list with no indication of what went wrong.
**Surprise**: Config file had the project, the "already exists" error proved it was persisted, but the UI showed nothing. No log entries were generated for the load attempt.
**Impact**: User sees empty state, tries to re-add, gets "already exists" error. Confusing loop.
**Workaround**: Every failure path must log at `error` or `warn` level. Every operation entry point should log at `debug` level so we can see it was attempted. The project store now logs at each stage: start, listProjects result, branch fetch failures, active project restore, and final count.
