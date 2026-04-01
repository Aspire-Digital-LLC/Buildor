# Skills & Agent System — Phased Implementation Plan

Reference design: `SKILLS_BUILD.md` (read it for full rationale, format specs, and UI mockups).
Skill authoring guide: `claude_knowledge/buildor_skills_guide.md` (schema, syntax, demos).

---

## Progress Tracker

**Instructions**: Update the status of each phase as work progresses. Mark `started` when you begin, `complete` when all acceptance criteria pass. If a phase is blocked, note the reason.

| Phase | Name | Status | Notes |
|---|---|---|---|
| 1 | Data Model, Types, Backend Foundations | complete | All types, Rust commands, DB migration, events done |
| 2 | Skill Palette UI | complete | All components, hook, panel refactor, type-check pass |
| 3 | Skill Execution Pipeline (Action Mode) | pending | |
| 4 | Eyeball Mode (Silent Restart) | pending | |
| 5 | Agent Pool Foundation | pending | |
| 6 | Agent Health Monitoring & Escalation | pending | |
| 7 | Agent UI (Status Card, Panel, History) | pending | |
| 8 | Shared Skills Repository Sync | pending | |

---

## Phase 1: Data Model, Types, and Backend Foundations

**Goal**: Establish the complete type system, DB schema extensions, and Rust backend commands for skills and agents — no UI yet.

**Dependencies**: None (starting point)

**Files to create**:
- `src/types/skill.ts` — full rewrite with `BuildorSkill`, `ProjectSkill`, `PaletteSkill`, `SkillParam`, `SkillExecution`, `SkillVisibility` types (spec in `SKILLS_BUILD.md` "Type Updates Needed" section). `ProjectSkill` must include `hasFork: boolean` flag (detected during SKILL.md frontmatter scan) to drive palette click behavior.
- `src/types/agent.ts` — `Agent`, `AgentHealthState`, `AgentReturnMode`, `AgentMarker`, `AgentPoolEntry` types
- `src/utils/commands/skills.ts` — Tauri command wrappers: `listBuildorSkills`, `getBuildorSkill`, `listProjectSkills`, `saveBuildorSkill`, `deleteBuildorSkill`, `indexSkills`
- `src/utils/commands/agents.ts` — Tauri command wrappers: `spawnAgent`, `killAgent`, `extendAgent`, `listAgents`, `getAgentStatus`
- `src-tauri/src/commands/skills.rs` — Rust commands for skill filesystem operations (scan `~/.buildor/skills/`, parse `skill.json` + `prompt.md`, scan `.claude/skills/`)
- `src-tauri/src/commands/agents.rs` — Rust commands for agent pool management (spawn subprocess, kill, list, get status)

**Files to modify**:
- `src-tauri/src/logging/db.rs` — Add new columns to `chat_sessions` table: `session_type` (TEXT, default 'chat'), `parent_session_id` (TEXT nullable), `return_to` (TEXT nullable), `source_skill` (TEXT nullable), `agent_source` (TEXT nullable, 'buildor' | 'native'). Add `skills` table for index cache (name, description, tags, skill_dir, last_modified, skill_type). Add DB migration logic (ALTER TABLE for existing installs).
- `src-tauri/src/commands/mod.rs` — Register new `skills` and `agents` modules
- `src-tauri/src/lib.rs` — Register new Tauri commands in the handler list
- `src/utils/buildorEvents.ts` — Add event types: `agent-spawned`, `agent-completed`, `agent-failed`, `agent-health-changed`, `agent-permission`, `skill-activated`, `skill-deactivated`, `skill-invoked`

**What to implement**:
- Full TypeScript type definitions matching the SKILLS_BUILD.md spec
- `ChatSession` Rust struct gains optional agent fields (backward compatible — all nullable)
- DB migration: detect existing schema, ALTER TABLE to add new columns, CREATE TABLE for `skills` index
- Rust `skills.rs`: `list_buildor_skills` (scan `~/.buildor/skills/`, parse each `skill.json` + read `prompt.md`), `list_project_skills` (scan `.claude/skills/` and `~/.claude/skills/`, parse SKILL.md frontmatter for description), `save_buildor_skill` (write skill.json + prompt.md to disk), `delete_buildor_skill` (rm -rf skill dir), `index_skills` (rebuild SQLite cache from filesystem)
- Rust `agents.rs`: Stubs only in this phase — `spawn_agent` (returns error "not implemented"), `list_agents` (returns empty vec), `kill_agent`, `get_agent_status`. These will be filled in Phase 6.
- TypeScript command wrappers calling each Rust command via `invoke()`
- New event types added to `BuildorEventType` union and documented in `claude_knowledge/events.md`

**Acceptance criteria**:
- `cargo build` succeeds with new Rust modules
- `tsc --noEmit` succeeds with new TypeScript types
- Calling `list_buildor_skills` from frontend returns an empty array (or populated if test skills placed in `~/.buildor/skills/`)
- Calling `list_project_skills` with a repo path returns discovered skills from `.claude/skills/`
- DB migration runs cleanly on fresh install AND on existing DB with chat_sessions data
- All new event types compile

---

## Phase 2: Skill Palette UI — Two Sections

**Goal**: Replace the placeholder palette sidebar with a working two-section skills palette showing project skills and Buildor skills.

**Dependencies**: Phase 1 (types + backend commands)

**Files to create**:
- `src/components/claude-chat/SkillsPalette.tsx` — Main palette component with two collapsible sections, search/filter bar, and skill entries
- `src/components/claude-chat/SkillEntry.tsx` — Individual skill row component (name, description, eyeball icon, action icon for Buildor skills; name + click-to-prefill for project skills)
- `src/components/claude-chat/SkillParamsModal.tsx` — Modal dialog auto-generated from `skill.json` params array (text inputs, selects, booleans, validation)
- `src/hooks/useSkills.ts` — Hook that loads both skill lists, handles search filtering, manages eyeball activation state, and refreshes on project switch

**Files to modify**:
- `src/components/claude-chat/ClaudeChat.tsx` — Replace the existing "Skills & Flows" placeholder sidebar with `<SkillsPalette />`. Wire up: `onPrefillInput` (project skills without `context: fork` — click-to-prefill into chat input), `onTranslateAndSpawn` (project skills WITH `context: fork` — triggers runtime translation), `onInvokeSkill` (Buildor skill action click), `onToggleEyeball` (activate/deactivate). The palette becomes one of three right-side panels (Skills, Agents, History) — refactor the panel toggle state from `paletteOpen`/`historyOpen` booleans to a single `activePanel: 'skills' | 'agents' | 'history' | null` state so only one panel is open at a time.
- `src/windows/breakout/BreakoutApp.tsx` — Add all three panel tabs (Skills, Agents, History) to the breakout window layout. The breakout window uses the same ClaudeChat component, so panel support comes from the refactor above.

**What to implement**:
- `useSkills` hook: calls `listBuildorSkills()` and `listProjectSkills(repoPath)` on mount and project switch. Caches results. Provides `search(query)` filtering by name/description/tags. Manages `activeEyeballs: Set<string>` state (skill names with eyeball toggled on). Returns `{ buildorSkills, projectSkills, filteredSkills, activeEyeballs, toggleEyeball, search }`.
- `SkillsPalette` component:
  - Search input at top
  - "Project Skills" section header with count badge — lists `ProjectSkill` entries. Each entry: name + description + click handler. If skill has `context: fork` (detected during scan), click triggers `onTranslateAndSpawn` (shows "Loading Skill..." indicator). Otherwise, click calls `onPrefillInput('/<name> ')`.
  - "Buildor Skills" section header with count badge — lists `BuildorSkill` entries. Each entry: name + description + eyeball icon (toggle) + action icon (play button). Eyeball click calls `onToggleEyeball(name)`. Action click opens `SkillParamsModal` if params exist, otherwise calls `onInvokeSkill(name, {})`.
  - Empty state per section when no skills found
  - Collapsed state: 28px vertical tab labeled "Skills" (matching existing History pattern)
  - Expanded state: 220px width (matching existing placeholder width)
- `SkillParamsModal` component: Renders a form from `SkillParam[]` — text input, number input, checkbox (boolean), select dropdown. Required field validation. Confirm/Cancel buttons. Returns `Record<string, string | number | boolean>` on confirm.
- Panel toggle refactor in `ClaudeChat.tsx`: Replace `paletteOpen` + `historyOpen` with `activePanel` enum. Three collapsed tabs (28px each) always visible. Clicking one opens it (220-280px) and closes any other. This sets up the layout for the Agents panel in Phase 7.

**Acceptance criteria**:
- Skills palette renders with two sections when skills exist in either location
- Clicking a simple project skill prefills the chat input with `/<name> ` and focuses it
- Clicking a project skill with `context: fork` shows "Loading Skill..." (translation happens in Phase 3)
- Clicking the action icon on a Buildor skill with params opens a modal with correct fields
- Clicking the action icon on a parameterless Buildor skill fires `onInvokeSkill` directly
- Eyeball icons toggle visual state (filled/hollow) on click
- Search filters both sections by name and description
- Only one right panel (Skills/Agents/History) can be open at a time
- Collapsed state shows three 28px vertical tabs

---

## Phase 3: Skill Execution Pipeline — Action Mode

**Goal**: Implement the full Buildor skill execution pipeline: param substitution, shell command execution, variable resolution, and injection into the active Claude session.

**Dependencies**: Phase 2 (palette UI wired up with onInvokeSkill callback)

**Files to create**:
- `src/utils/skillProcessor.ts` — Pre-processing pipeline: `{{param}}` substitution, `${CLAUDE_SKILL_DIR}` resolution, `!`command`` shell execution (via Rust backend), relative link resolution. Exports `processSkillPrompt(skill, params): Promise<string>`.
- `src/utils/nativeSkillTranslator.ts` — Runtime translation of native SKILL.md → Buildor format (in memory). Parses YAML frontmatter + body, maps to `BuildorSkill` with defaults for missing fields. Includes JSON schema validator. On validation failure, retries with error feedback.
- `src-tauri/src/commands/shell.rs` — Rust command `execute_shell_command(command: String, cwd: Option<String>): Result<String, String>` for running `!`command`` blocks in skill prompts

**Phase 2 addendum**: Re-add `loadingForkSkill` state (`useState<string | null>(null)`) to `ClaudeChat.tsx` — it was removed during Phase 2 to pass `tsc --noEmit` (unused variable). Phase 3 needs it to drive the "Loading Skill..." indicator in the palette and to gate duplicate clicks during translation.

**Files to modify**:
- `src/components/claude-chat/ClaudeChat.tsx` — Re-add `loadingForkSkill` state. Wire `onInvokeSkill` handler: calls `processSkillPrompt()`, then injects the processed text as a user message via `sendClaudeMessage()`. Handle `execution.model` override (call `setSessionModel` if different). Handle `execution.allowedTools` (store in state for auto-accept logic). Save a `system-event` message with `event_type: 'skill-run'` to chat history via `saveMessage()`. Wire `onTranslateAndSpawn` handler for project skills with `context: fork`: shows "Loading Skill..." indicator, calls `translateNativeSkill()`, spawns as Buildor agent.
- `src/utils/parseClaudeStream.ts` �� Add auto-accept logic for `allowedTools`: when a `permission_request` event arrives, check if the tool name is in the active skill's `allowedTools` array. If yes, automatically call `respondToPermission(sessionId, requestId, true)` and emit `permission-resolved` instead of showing the card.
- `src/components/claude-chat/useChatHistory.ts` — Add `saveSystemEvent(eventType, metadata)` helper for recording skill injection markers
- `src-tauri/src/commands/mod.rs` — Register `shell` module
- `src-tauri/src/lib.rs` — Register `execute_shell_command` command

**What to implement**:
- `skillProcessor.ts`:
  - `substituteParams(template, params)`: Replace `{{param-name}}` with values from the params record
  - `resolveSkillDir(template, skillDir)`: Replace `${CLAUDE_SKILL_DIR}` with absolute path
  - `executeShellBlocks(template)`: Find all `` !`command` `` patterns, execute each via Rust `execute_shell_command`, replace with output
  - `resolveRelativeLinks(template, skillDir)`: Convert `[text](relative.md)` to absolute paths
  - `processSkillPrompt(skill, params)`: Chain all above steps, return final text
- `nativeSkillTranslator.ts`:
  - `translateNativeSkill(projectSkill: ProjectSkill): Promise<BuildorSkill>` — reads SKILL.md from the skill directory, parses YAML frontmatter and markdown body, maps to BuildorSkill format in memory (original file untouched)
  - **Default values for missing fields**: `description` defaults to skill name, `execution.model` defaults to current session model, `execution.effort` defaults to "medium", `params` defaults to empty array (any `$ARGUMENTS` in body mapped to a single text param), `tags` defaults to empty, `visibility.autoLoad` defaults to true, `shell` defaults to "bash"
  - **Schema validation**: validate the translated BuildorSkill against a JSON schema. If validation fails, log the errors and retry translation with adjusted defaults (max 2 retries). If still failing, fall back to a minimal valid BuildorSkill with just name + description + raw body.
  - Result is held in memory only — never written to disk, never modifies the original SKILL.md
- `execute_shell_command` in Rust: spawn bash subprocess, capture stdout, return as string. Timeout of 30s. Working directory defaults to skill dir.
- Auto-accept in `parseClaudeStream.ts`: Add an `autoAcceptTools` parameter (or read from a shared state/store). When a permission request matches, auto-respond and skip UI display.
- Skill injection marker saved to history: `{ role: 'system-event', event_type: 'skill-run', metadata: { skillName, params, timestamp } }`
- Emit `skill-invoked` event after injection

**Acceptance criteria**:
- Clicking Action on a Buildor skill with params shows modal, fills params, processes the prompt, and injects the final text into the active Claude session
- `{{param}}` placeholders are correctly substituted
- `` !`git log -5` `` in a prompt.md is replaced with actual git log output
- `${CLAUDE_SKILL_DIR}` resolves to the absolute skill directory path
- If skill has `allowedTools: ["Read", "Grep"]`, permission prompts for Read and Grep are auto-accepted
- A skill-run marker appears in chat history when viewed
- `skill-invoked` event emits correctly
- Clicking a project skill with `context: fork` shows "Loading Skill..." then spawns a Buildor-managed agent
- A native skill with missing frontmatter fields translates successfully with defaults filled in
- Translation never modifies the original SKILL.md file

---

## Phase 4: Eyeball Mode — Silent Restart with Description Injection

**Goal**: Implement the Eyeball (Activate) interaction: toggling a skill on triggers a silent session restart that bakes the skill's description into the initial context. The user sees one continuous conversation.

**Dependencies**: Phase 3 (action mode working, skill types and processing established)

**Files to modify**:
- `src/components/claude-chat/ClaudeChat.tsx` — Implement `handleToggleEyeball(skillName)`: (1) update eyeball state in `useSkills`, (2) collect all active skill descriptions, (3) interrupt the current session via `interruptSession()`, (4) stop the session via `stopSession()`, (5) restart with descriptions included in the system prompt via `buildSystemPrompt()`, (6) replay all user messages from the current session by re-sending them, (7) maintain the same `sessionId` across the restart (or map old->new internally). Insert a `system-event` message for skill-activated/deactivated.
- `src/utils/buildSystemPrompt.ts` — Accept an optional `activeSkillDescriptions: Array<{name, description}>` parameter. When provided, append a "Available Buildor skills" section listing each skill's name and description, with instructions for Claude to read the full content via the Read tool when relevant.
- `src/components/claude-chat/useChatHistory.ts` — Add logic to save `skill-activated` and `skill-deactivated` system-event markers. Ensure the same session ID is maintained across silent restarts (no new session created).
- `src/hooks/useSkills.ts` — Persist eyeball state per project (so toggling off and back to the chat remembers which skills are active). Store in Zustand or localStorage keyed by project name.

**What to implement**:
- Silent restart flow:
  1. User clicks eyeball -> `handleToggleEyeball(name)` called
  2. Save a `skill-activated` or `skill-deactivated` system-event marker
  3. Interrupt current session (protocol-level, preserves nothing — we're restarting)
  4. Stop the session process
  5. Build new system prompt including active skill descriptions
  6. Start a new Claude session with the augmented system prompt
  7. Replay user messages: iterate through `messages` state, re-send each `role: 'user'` message via `sendClaudeMessage()`. Do NOT display replay messages as new messages — suppress output events during replay (add a `replaying` flag that `parseStreamEvent` checks).
  8. After replay completes, unflag replaying, resume normal output display
  9. Map the new session ID internally but keep the same ID in chat history
- Handle multiple concurrent eyeball skills: descriptions compose naturally as a list
- Persist active eyeballs in `useSkills` so they survive component re-renders and panel switches
- The system prompt addition looks like:
  ```
  ## Available Buildor Skills
  The following skills are available. Read the full skill content when relevant:
  - analyze-performance: Profiles and analyzes performance bottlenecks
  - run-tests: Executes the test suite and reports results
  ```
- Skill files accessible via Read tool: ensure `~/.buildor/skills/<name>/prompt.md` is at a path Claude can access with its Read tool

**Acceptance criteria**:
- Toggling an eyeball on a skill triggers a silent restart — the user sees a brief pause, then the conversation continues
- After restart, Claude's init message shows the skill in the available tools/skills
- User can ask Claude about the skill and Claude knows its description
- Multiple skills can be eyeball-activated simultaneously
- Toggling an eyeball off triggers another restart without that description
- Skill activation/deactivation markers appear in history
- The entire conversation appears as one session in history (not two separate sessions)
- Eyeball state persists across panel open/close cycles

---

## Phase 5: Agent Pool Foundation — Marker Interception and Subprocess Spawning

**Goal**: Implement the flat agent pool, the `--disallowedTools "Agent"` flag, marker-based agent requests (`-<*{...}*>-`), and basic agent lifecycle (spawn, run, complete, kill).

**Dependencies**: Phase 3 (skill execution pipeline working, event system updated)

**Files to modify**:
- `src-tauri/src/commands/claude.rs` — Add `--disallowedTools "Agent"` to the `start_session` args. Create new function `start_agent_session(app, working_dir, model, system_prompt, parent_session_id, return_to, source_skill, return_mode)` — similar to `start_session` but registers the session in the agent pool with agent-specific metadata. Agent sessions also get `--disallowedTools "Agent"`.
- `src-tauri/src/commands/agents.rs` — Fill in the stubs from Phase 1:
  - `spawn_agent(app, working_dir, prompt, name, parent_session_id, return_to, source_skill, model, return_mode, output_path)` — calls `start_agent_session` internally, registers in flat pool (HashMap in static), returns agent session ID
  - `kill_agent(session_id, mark_completed)` — kills the subprocess, optionally marks as completed vs failed
  - `extend_agent(session_id, seconds)` — resets health timers (Phase 6 detail, stub here)
  - `list_agents()` — returns all entries in the flat pool with current status
  - `get_agent_status(session_id)` — returns single agent details
  - `inject_into_agent(session_id, message)` — writes to agent's stdin (for escalation messages, user pass-through)
- `src/utils/parseClaudeStream.ts` — Add marker detection: scan every text block for the `-<*{...}*>-` pattern. When found: (1) strip the marker from displayed text, (2) parse the JSON payload, (3) emit appropriate event (`agent-spawned` for `spawn_agent` action, etc.), (4) call the corresponding Rust command (`spawnAgent`, `killAgent`, `extendAgent`). Handle `spawn_agent`, `kill_agent`, `extend_agent`, `takeover_agent` action types.
- `src/utils/commands/agents.ts` — Fill in the command wrappers from Phase 1 to call the new Rust commands
- `src/utils/buildorEvents.ts` — Events already added in Phase 1; ensure `agent-spawned` carries `{ agentSessionId, name, parentSessionId, sourceSkill }` and `agent-completed` carries `{ agentSessionId, resultSummary, durationMs }`
- `src-tauri/src/logging/db.rs` — Use the new `chat_sessions` columns from Phase 1 when creating agent sessions (session_type='agent', parent_session_id, return_to, source_skill, agent_source='buildor')

**Files to create**:
- `src/utils/agentMarker.ts` — Marker parsing utility: `parseAgentMarker(text: string): { cleanText: string, markers: AgentMarker[] }`. Extracts all `-<*{...}*>-` patterns, returns cleaned text and parsed marker objects. Handles edge cases (partial markers across chunk boundaries, malformed JSON).

**What to implement**:
- `--disallowedTools "Agent"` added to ALL session starts (main chat, worktree, agent) — Claude cannot spawn its own subagents
- Marker format: `-<*{ "action": "spawn_agent", "type": "Explore", "prompt": "...", "name": "..." }*>-`
- Agent pool: in-memory `HashMap<String, AgentPoolEntry>` in Rust (static, mutex-protected). Each entry: session_id, name, parent_session_id, return_to, source_skill, status (running/completed/failed), started_at, health_state, return_mode, output_path
- When agent process exits (code 0): mark as completed, capture last text output as result summary, inject summary into return-to session via `send_message`. Emit `agent-completed`.
- When agent process exits (non-zero): mark as failed, inject failure notice into return-to session. Emit `agent-failed`.
- Result routing by return_mode:
  - `summary` (default): inject concise summary into return-to session
  - `file`: inject only "Agent completed. Output: <path>"
  - `both`: write file AND inject summary
- Agent output files written to `~/.buildor/agent-output/<parent-session-id>/`
- Context injection for agents: system prompt tells Claude it's an agent, what its task is, and how to emit markers for sub-agents
- `context: fork` skills: when action mode triggers a skill with `execution.context === 'fork'`, spawn it as an agent instead of injecting into the current session
- Native skill `context: fork` edge case: palette clicks are already intercepted in Phase 3 (runtime translation → Buildor agent). The only remaining edge case is if Claude autonomously invokes a native skill that has `context: fork` — this is caught by `SubagentStart`/`SubagentStop` hooks registered in Claude Code's settings.json. Buildor adds its hooks on session start (preserving existing hooks) and removes them on session end. Native agents detected via hooks are added to the pool as `agent_source: 'native'` (observe-only, no management).

**Acceptance criteria**:
- `--disallowedTools "Agent"` appears in the Claude CLI args for all sessions
- When Claude emits a `-<*{...}*>-` marker, it is stripped from chat output and a new subprocess spawns
- `list_agents` returns the spawned agent with correct metadata
- When agent completes (process exit 0), result summary is injected into the parent session
- `kill_agent` terminates the subprocess and updates the pool
- A Buildor skill with `context: fork` spawns as an agent when invoked via Action mode
- Agent sessions appear in the DB with `session_type='agent'` and correct parent linkage

---

## Phase 6: Agent Health Monitoring and Escalation

**Goal**: Implement agent health state tracking (healthy, idle, stalling, looping, erroring, distressed) and the escalation flow to parent agents or the user.

**Dependencies**: Phase 5 (agents spawn and run)

**Files to create**:
- `src/utils/agentHealthMonitor.ts` — Class `AgentHealthMonitor` that tracks per-agent health state. Runs timers, analyzes tool call patterns, detects idle/stalling/looping/erroring, triggers escalation. Configurable thresholds per skill.
- `src-tauri/src/commands/agent_health.rs` — Optional Rust-side health tracking (if timer precision or background thread needed). Alternatively, all health monitoring can run in the frontend via the event bus.

**Files to modify**:
- `src/utils/parseClaudeStream.ts` — For agent sessions: feed tool_use and tool_result events into the health monitor. Track last activity timestamp, consecutive errors, rolling tool call window.
- `src/utils/buildorEvents.ts` — `agent-health-changed` event carries `{ agentSessionId, previousState, newState, details }`
- `src/components/claude-chat/ClaudeChat.tsx` — Subscribe to `agent-health-changed` events. When an agent with no parent reaches `distressed`, show a notification/banner prompting the user to check the Agents panel.
- `src-tauri/src/commands/agents.rs` — Add `extend_agent` implementation: resets health timers for the specified agent. Add `takeover_agent`: kills the agent, generates a summary of its work so far, injects that summary into the parent session.

**What to implement**:
- `AgentHealthMonitor`:
  - Instantiated per agent session when spawned
  - Subscribes to `tool-executing`, `tool-completed`, `message-received` events for that agent's sessionId
  - Tracks: `lastActivityAt`, `lastActivityType` ('tool_call' | 'text'), `recentToolCalls` (rolling window of last N), `consecutiveErrors`
  - State transitions:
    - `healthy` -> `idle`: last activity was text (not tool_call), no new activity for `idleSeconds` (default 30)
    - `healthy` -> `stalling`: last activity was tool_call or mid-task, no new activity for `stallSeconds` (default 30)
    - `healthy` -> `looping`: same tool+input appears `loopThreshold` times (default 3) in `loopDetectionWindow` (default 5)
    - `healthy` -> `erroring`: `errorThreshold` consecutive tool_result with isError (default 3)
    - Any unhealthy -> `distressed`: unhealthy state persists for `distressSeconds` (default 45)
  - Emits `agent-health-changed` on every transition
- Escalation flow:
  - When agent becomes idle/distressed: check if it has a parent
  - If parent exists: inject `[BUILDOR_ALERT: ...]` message into parent's stdin via `inject_into_agent`, including marker options (kill, extend, takeover)
  - If no parent (top-level agent): emit `user-attention-needed` event, update agent status card
  - Parent agent's response (containing markers) is intercepted by the same marker parser from Phase 5
- Configurable thresholds: read from `skill.json` `execution.health` object, fall back to global defaults
- Cleanup: destroy health monitor when agent completes/killed

**Acceptance criteria**:
- An agent that stops producing output for 30s transitions to `idle` or `stalling` (depending on last activity type)
- An agent making repeated identical tool calls transitions to `looping`
- An agent with consecutive errors transitions to `erroring`
- Any unhealthy state persisting 45s transitions to `distressed`
- Escalation injects an alert into the parent agent with correct marker options
- Parent can respond with `kill_agent`, `extend_agent`, or `takeover_agent` markers and they work
- Top-level agents with no parent escalate to the user via attention event
- Health thresholds from skill.json override defaults

---

## Phase 7: Agent UI — Status Card, Agents Panel, and History Integration

**Goal**: Build the visual layer for agents: the pinned status card above input, the Agents panel (third right-side panel), permission routing display, and history integration with agent markers.

**Dependencies**: Phase 5 + Phase 6 (agents run with health monitoring)

**Files to create**:
- `src/components/claude-chat/AgentStatusCard.tsx` — Pinned card above input (same position as TaskTracker). Shows one line per top-level agent with name, status icon, single-line status text. Accordion expand for agents with children (max 2 levels). Click any line to open Agents panel. Auto-hides when no agents active.
- `src/components/claude-chat/AgentsPanel.tsx` — Right-side panel (250px expanded, 28px collapsed). Lists active agents with expandable detail view. Shows completed agents section at bottom. Each entry: name, duration timer, health status indicator, one-line status. Expanded view includes read-only transcript viewer (reuse `ChatMessage` component). Permission alert highlighting on waiting agents.
- `src/components/claude-chat/AgentOutputBlock.tsx` — Surfaced agent output rendered inline in main chat. Distinct visual treatment: header badge with agent name, collapsible content area, not an AI message.
- `src/hooks/useAgentPool.ts` — Hook that subscribes to agent events (`agent-spawned`, `agent-completed`, `agent-failed`, `agent-health-changed`, `agent-permission`), maintains in-memory agent list with live status. Provides: `{ agents, activeCount, expandedAgentId, expandAgent, getAgentMessages }`.

**Files to modify**:
- `src/components/claude-chat/ClaudeChat.tsx` — Add `<AgentStatusCard />` below the TaskTracker. Wire the Agents panel as the third right-side panel tab (between Skills and History). Route agent permission events to the main screen's permission card display (agent permissions show same PermissionCard but with "Agent: <name>" badge). Subscribe to `agent-completed` to inject `AgentOutputBlock` into messages when surfaceable output exists.
- `src/components/claude-chat/ChatHistory.tsx` — Render `system-event` messages with `event_type: 'agent-started' | 'agent-completed' | 'agent-failed'` as subtle inline markers (skill icon + text). When viewing a session with agent markers, show expandable nested transcript link.
- `src/components/claude-chat/ChatMessage.tsx` — Add rendering for `role: 'system-event'` messages: skill activation/deactivation markers (Phase 4) and agent lifecycle markers. Render as subtle divider lines with icon + text, not full message bubbles.
- `src/utils/parseClaudeStream.ts` — When a permission request comes from an agent session (not main chat), emit `agent-permission` event with the agent's name/sessionId so the UI can badge it correctly.

**What to implement**:
- `useAgentPool` hook:
  - Subscribes to all agent events on mount
  - Maintains `Map<string, AgentPoolEntry>` with live data
  - Computes hierarchy from `parentSessionId` for display
  - Provides `activeCount` for the Agents tab badge
  - Fetches agent messages via `getChatMessages(agentSessionId)` for transcript viewer
- `AgentStatusCard`:
  - Renders only when `activeCount > 0`
  - One row per top-level agent: status icon (blue spinner / amber pulse / green check / red X) + name + truncated status line
  - Status line generated from latest tool call: `Read foo.ts` -> "Reading foo.ts...", `Bash cargo test` -> "Running cargo test...", text message -> truncated first line
  - Accordion for agents with children: click to expand, only one expanded at a time
  - Max 2 levels in the card; deeper nesting shows "N more -> Agents panel"
  - Click any row to open Agents panel focused on that agent
- `AgentsPanel`:
  - Collapsed: 28px vertical tab with "Agents" label + pulsing green dot + count badge when agents active
  - Expanded: 250px with scrollable agent list
  - Each agent row: expand/collapse arrow + name + duration timer + status icon
  - Expanded row shows children (if any) + [View full transcript] link
  - Completed section at bottom (collapsed by default)
  - Permission-waiting agents highlighted with amber background
- `AgentOutputBlock`:
  - Rendered in main chat message stream when agent completes with surfaceable output
  - Header: "Agent: <name>" badge with status
  - Body: collapsible, shows summary by default
  - Not a user/assistant message — distinct visual styling
- Agent permissions on main screen:
  - Same PermissionCard component but with prefix "Agent: <name> wants to use..."
  - Approval routes to correct agent subprocess via `respondToPermission(agentSessionId, ...)`
- History integration:
  - `system-event` role messages render as thin divider markers
  - Agent markers show: "Agent started: <name> (from <skill>)" / "Agent completed: <name> (45s, 12 tool calls)"
  - Clicking an agent marker in history expands to show the agent's transcript inline (lazy-loaded)

**Acceptance criteria**:
- Agent status card appears above input when agents are running, auto-hides when empty
- Status card shows live one-line status per agent, updating as tools execute
- Agents panel shows full list with expand/collapse and transcript viewer
- Agents tab has pulsing dot + count badge when agents are active
- Agent permissions surface on the main screen with agent name badge
- Approving an agent permission routes correctly to the agent subprocess
- Completed agents show in the "Completed" section of the Agents panel
- History viewer shows agent lifecycle markers inline
- Agent transcripts are viewable from both the Agents panel and the History panel
- Only one right panel open at a time (Skills / Agents / History)

---

## Phase 8: Shared Skills Repository Sync

**Goal**: Implement org-level skill sharing via a git-backed shared repository, including clone/pull sync, push-back, and org-wide defaults.

**Dependencies**: Phase 2 (palette loads skills from `~/.buildor/skills/`)

**Files to create**:
- `src-tauri/src/commands/skill_sync.rs` — Rust commands for git operations on the skills directory: `configure_shared_repo(url)`, `sync_skills()` (clone or pull), `push_skill_changes(message)`, `get_sync_status()` (clean/dirty/diverged/not-configured)
- `src/utils/commands/skillSync.ts` — Tauri command wrappers for the sync commands

**Files to modify**:
- `src-tauri/src/commands/mod.rs` — Register `skill_sync` module
- `src-tauri/src/lib.rs` — Register new commands
- `src/components/settings/SettingsPanel.tsx` — Add "Shared Skills Repository" section: repo URL input, Sync Now button, Push Changes button, sync status indicator (last synced, clean/dirty/diverged), conflict warning banner
- `src/hooks/useSkills.ts` — After sync completes, trigger a skill list refresh (re-call `listBuildorSkills`)
- `src-tauri/src/commands/skills.rs` — When scanning `~/.buildor/skills/`, also look for a `defaults.json` at root and merge org defaults into skills that don't override them

**What to implement**:
- `configure_shared_repo`: save repo URL to Buildor config (SQLite or config file). Does not clone yet.
- `sync_skills`:
  - If `~/.buildor/skills/` is not a git repo and URL is configured: `git clone <url> ~/.buildor/skills/`
  - If it is a git repo: `git pull --ff-only`
  - If pull fails (diverged): return error status, don't force
  - After success: trigger skill index rebuild
- `push_skill_changes`: `git add -A && git commit -m "<message>" && git push`. Only runs if URL is configured and repo is dirty.
- `get_sync_status`: check if URL configured, if repo exists, if working tree is clean/dirty, if diverged from remote
- `defaults.json` parsing: read `~/.buildor/skills/defaults.json` if it exists. Provides fallback values for `execution.model`, `execution.effort`, `health` thresholds. Individual `skill.json` values take precedence.
- Startup sync: on app launch, if a shared repo is configured, auto-pull (non-blocking, background). Show a toast notification if sync fails.
- Palette refresh: after sync, the skill list updates automatically (existing `useSkills` hook re-fetches)

**Shared repo structure** (what the repo contains):
```
buildor-skills/
├── defaults.json              # org-wide fallback config
├── analyze-performance/
│   ├── skill.json             # machine-readable entry point
│   ├── prompt.md              # prompt template
│   └── scripts/profiler.js    # supporting files
├── run-tests/
│   ├── skill.json
│   └── prompt.md
└── ...
```

Discovery: Buildor scans for directories containing `skill.json` at the repo root — that's the canonical skill detection mechanism.

**Acceptance criteria**:
- User can configure a shared repo URL in Settings
- Clicking "Sync Now" clones (first time) or pulls (subsequent) into `~/.buildor/skills/`
- Skills from the shared repo appear in the Buildor Skills section of the palette
- Clicking "Push Changes" commits and pushes local skill edits
- Sync status shows last synced time, clean/dirty state
- If remote has diverged, a warning is shown (no force pull)
- `defaults.json` values are applied as fallbacks to skills missing those fields
- Startup auto-sync runs in background without blocking the UI
