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
