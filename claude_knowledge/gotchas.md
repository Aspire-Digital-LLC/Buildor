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
