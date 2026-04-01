# Skills Build Plan

## Overview

Buildor implements its own skill system stored in shared application storage (`~/.buildor/skills/`). Buildor skills use their own format optimized for Buildor's needs (structured params for modal generation, etc.) — they do not need to conform to Claude Code's SKILL.md format. The palette also displays native project skills from `.claude/skills/` as a separate read-only section. Skills are browsable and clickable from the Skills Palette in the right sidebar.

This approach decouples skills from any specific repository, making them portable across all projects opened in Buildor.

## Why Not Native `.claude/skills/`?

Native skills live inside a repo (`.claude/skills/`) or the user's home (`~/.claude/skills/`). Buildor's constraint is **never touch project repos** — so project-scoped native skills are off the table. Personal-scoped native skills (`~/.claude/skills/`) would work but give Buildor no control over frontmatter features like `allowed-tools`, `context: fork`, or inline shell execution.

By owning the skill loader, Buildor can:
- Pre-process `!`shell commands`` before injection
- Handle `allowed-tools` by auto-accepting permission prompts
- Spawn subagent sessions for `context: fork` skills
- Pass `model`/`effort` as session parameters
- Resolve `${CLAUDE_SKILL_DIR}` to the actual storage path
- Filter skill visibility by `paths` globs against the active project

## Token Efficiency

**Same as native skills.** Claude only sees the skill body text (with shell outputs resolved). Frontmatter is consumed by the loader — whether that's Claude Code's runtime or Buildor's. The payload hitting Claude's context window is identical bytes either way.

## Storage

```
~/.buildor/skills/
  my-skill/
    skill.json          # Required — metadata, params, execution config
    prompt.md           # Required — the prompt template body
    reference.md        # Optional supporting files
    examples.md
    scripts/
      helper.sh         # .sh works cross-platform (Claude Code uses bash everywhere)
      helper.js         # Node scripts for complex cross-platform logic
```

Skills are indexed in a SQLite table (`skills` in `config.db` or `logs.db`) for fast palette rendering, search, and metadata caching. The filesystem is the source of truth; the DB is a read cache rebuilt on startup and file-watch events.

## Buildor Skill Format

Buildor skills use **JSON for metadata + Markdown for the prompt body**, rather than YAML frontmatter. This makes structured fields (especially params for modal generation) easier to parse and validate.

### skill.json

```json
{
  "name": "analyze-performance",
  "description": "Profiles and analyzes performance bottlenecks in the current codebase",
  "tags": ["performance", "debugging"],

  "params": [
    {
      "name": "target",
      "type": "text",
      "required": true,
      "description": "File or module to analyze",
      "placeholder": "src/components/..."
    },
    {
      "name": "depth",
      "type": "select",
      "required": false,
      "options": ["shallow", "deep", "exhaustive"],
      "default": "deep",
      "description": "Analysis depth"
    },
    {
      "name": "include-deps",
      "type": "boolean",
      "required": false,
      "default": false,
      "description": "Include dependency analysis"
    }
  ],

  "execution": {
    "allowedTools": ["Read", "Grep", "Glob", "Bash"],
    "context": "fork",
    "agent": "Explore",
    "model": "opus",
    "effort": "high"
  },

  "visibility": {
    "paths": ["src/**/*.ts", "**/*.rs"],
    "autoLoad": true
  },

  "shell": "bash"
}
```

### prompt.md

```markdown
# Analyze Performance

Target: {{target}}
Depth: {{depth}}
Include dependencies: {{include-deps}}

Analyze the performance characteristics of the specified target.
...

Dynamic context: !`git log --oneline -5 -- {{target}}`
Reference: see [reference.md](reference.md) for detailed methodology.
```

Param values are substituted using `{{param-name}}` placeholders. This is distinct from Claude Code's `$ARGUMENTS` pattern — Buildor controls the substitution, and the JSON schema drives modal generation directly.

### Why Not YAML Frontmatter?

- **Structured params**: JSON natively represents arrays of objects with typed fields. YAML frontmatter would require string-encoded param definitions that Buildor then parses again.
- **Modal generation**: `skill.json` maps directly to form fields — type, options, defaults, placeholders, validation. No intermediate parsing step.
- **Separation of concerns**: Metadata (JSON) and prompt content (Markdown) are cleanly separated into two files. Easier to edit either independently.
- **Tooling**: JSON schema validation, IDE autocomplete, programmatic generation all work out of the box.

## Skill Palette UI

The Skills Palette lives in the right sidebar (already exists as a placeholder). It shows **two distinct sections** because the two skill sources have fundamentally different execution paths:

### Section 1: Project Skills (from `.claude/skills/`)

These are native Claude Code skills discovered in the active project's `.claude/skills/` directory (and `~/.claude/skills/` for personal ones). Buildor scans these directories and lists them, but **does not own their execution**.

- **Visual indicator**: Folder icon or "Claude" badge to show these are native
- **Click to invoke (simple skills)**: Prefills `/<skill-name>` into the chat input box and focuses it. The user can then type additional arguments after the skill name, just as if they typed the slash command themselves. Pressing Enter sends it — Claude Code's own skill loader handles everything from there.
- **Click to invoke (skills with `context: fork`)**: Buildor intercepts the click, translates the native skill into Buildor format at runtime (in memory — the original file is never modified), and spawns it as a Buildor-managed agent. The user sees a brief "Loading Skill..." indicator during translation. This ensures all forking agents are in Buildor's flat pool with full control.
- **Runtime translation**: A lightweight agent reads the SKILL.md, extracts the body and frontmatter, and maps it to the Buildor `skill.json` + `prompt.md` format in memory. A schema validator checks the result; if it fails, the agent retries with the validation errors. Default values are provided for any fields a poorly-written skill might lack (e.g., missing `description` defaults to the skill name, missing `execution` defaults to `{ model: current, effort: "medium" }`).
- **Read-only in palette**: Buildor displays them but doesn't edit/delete them (they belong to the repo or `~/.claude/`)
- **Auto-refresh**: Re-scan on project switch or file-watch events
- **Why separate?**: These skills get full native Claude Code support for simple invocations. Skills with `context: fork` are intercepted and run as Buildor agents to maintain full orchestration control.

### Section 2: Buildor Skills (from `~/.buildor/skills/`)

These are Buildor-managed skills stored in shared application storage. Buildor **owns the full execution pipeline** — parsing, pre-processing, and injection.

- **Visual indicator**: Buildor icon or "Buildor" badge
- **Click to invoke**: Opens argument dialog (if `argument-hint` set), then Buildor pre-processes and injects into the session
- **Full management**: Edit, Delete, Duplicate, Create, Import via right-click context menu
- **Search/filter**: By name, description, tags, or `paths` relevance to current project
- **Import**: Drag-and-drop a skill folder, or paste a SKILL.md
- **Create**: In-app skill editor (Monaco) for writing SKILL.md + supporting files

### Why Two Sections?

| | Project Skills | Buildor Skills |
|---|---|---|
| Location | `.claude/skills/` or `~/.claude/skills/` | `~/.buildor/skills/` |
| Execution | Claude Code runtime (slash command) | Buildor pre-processes + injects |
| Frontmatter handling | Claude Code handles natively | Buildor handles |
| Management | Read-only in Buildor | Full CRUD in Buildor |
| Portability | Tied to repo or user's Claude config | Portable across all Buildor installs |
| Subagent support | Claude Code handles `context: fork` | Buildor spawns subprocess |

## Skill Interaction Modes

Each Buildor skill in the palette has **two interaction icons**, handling the distinction between passive awareness and active invocation:

### Eyeball Icon — Activate (Aware Mode)

Makes the session "aware" of the skill, identical to how native `.claude/skills/` auto-loading works:

- **Only the skill's description** is added to the session context (not the full body)
- Claude decides if/when the skill is relevant and loads the full content on-demand
- Token cost: just the description string — same as native skills

**How it works mid-session:**
1. User clicks eyeball on a skill while chatting
2. Buildor silently stops the Claude Code session
3. Restarts with the skill description(s) included in the initial context
4. Replays conversation history into the new session
5. User continues chatting — Claude now "sees" the skill and can auto-load it when relevant

The silent restart is invisible to the user. This is the same mechanism already used for model switching (protocol-level interrupt). The result is **functionally identical to having the skill in `.claude/skills/`** — same discovery, same on-demand loading, same token cost.

Multiple skills can be eyeball-activated simultaneously. Their descriptions compose naturally — Claude sees a list of available skills just like it would with native ones.

**Eyeball state is visual:** Filled eyeball = active, hollow = inactive. Toggling off triggers another silent restart without that skill's description.

### Action Icon — Run (Direct Invocation)

Directly executes the skill as an explicit command, like typing `/<name>` for a native skill:

- Opens a params modal if the skill defines `argument-hint` or params
- Full skill body is pre-processed and injected as a user message
- One-shot execution — the skill runs, produces output, done

**This is the path that uses Buildor's full pre-processing pipeline** (see below).

### Comparison

| | Eyeball (Activate) | Action (Run) |
|---|---|---|
| What enters context | Description only | Full processed body |
| When content loads | On-demand (Claude decides) | Immediately |
| Token cost | Minimal (description string) | Full skill body |
| Persistence | Stays active until toggled off | One-shot |
| Params modal | No | Yes (if skill has params) |
| Session restart needed | Yes (silent) | No |

## Execution Flow — Action (Run)

Project skills are simply invoked via `/<name>` slash command — no Buildor processing needed.

For Buildor skills when the user clicks the Action icon:

### 1. User clicks Action on a Buildor skill

```
User clicks action icon
  -> If skill.json has params, show generated modal (fields from params array)
  -> User fills in form and confirms (or skips optional fields)
  -> Buildor reads skill.json + prompt.md from ~/.buildor/skills/<name>/
```

### 2. Pre-processing (Buildor handles, not Claude)

```
a. Substitute {{param-name}} placeholders in prompt.md with modal values
b. Resolve ${CLAUDE_SKILL_DIR} -> absolute path to skill directory
c. Find all !`command` blocks in body
   -> Execute each via Rust backend (shell subprocess)
   -> Replace block with command output
d. Resolve relative links (reference.md -> absolute path)
e. Final body text is ready for injection
```

### 3. Session parameter handling

```
If skill.json.execution has `model`:        -> pass to Claude session as model override
If skill.json.execution has `effort`:       -> pass to Claude session as effort level
If skill.json.execution has `allowedTools`: -> auto-accept these tool permission prompts
```

### 4. Injection (two paths based on `context` field)

**Default (no fork):** Inject the processed body text into the active Claude session as a user message.

**`context: fork`:** Spawn a new Claude Code subprocess with:
- The processed body as the initial prompt
- `agent` type from frontmatter (defaults to general-purpose)
- Model/effort overrides from frontmatter
- Result flows back to the parent session as a collapsed inline block

## Execution Flow — Eyeball (Activate)

### 1. User clicks Eyeball on a Buildor skill

```
User clicks eyeball icon
  -> Skill is marked as "active" in palette (filled eyeball)
  -> Buildor reads SKILL.md frontmatter (description only)
  -> Adds to list of active skill descriptions
```

### 2. Silent session restart

```
a. Interrupt current Claude Code session (same as model switch flow)
b. Collect all active Buildor skill descriptions
c. Restart session with descriptions in initial context
d. Replay conversation history
e. Session resumes — Claude sees the skills as available
```

**Critical: This is one session in history, not two.** The silent restart is an implementation detail — the user sees a continuous conversation. See "History and Skill Injection Continuity" below for how this works.

### 3. On-demand loading

When Claude determines a skill is relevant based on its description, it needs to read the full content. Buildor makes the skill's prompt.md and supporting files accessible by path so Claude's `Read` tool can access them. No extra token cost until Claude actually decides to load.

### 4. Deactivation

```
User clicks filled eyeball -> unfills
  -> Remove skill from active list
  -> Silent restart without that description
```

## Hard Requirement: Token Efficiency

Buildor's philosophy is efficiency — at minimum, functionally the same token usage as native skills, ideally less.

- **Eyeball mode**: Description-only injection matches native skill discovery exactly. Full content loads on-demand only when Claude needs it. Same token cost.
- **Action mode**: Full body injection is the same as typing `/<name>` for a native skill. Same token cost.
- **No constant re-injection**: Skills are NOT pinned or re-sent every turn. Eyeball mode uses the session restart to bake descriptions into initial context once. Action mode is a single message injection.
- **Silent restart cost**: Replaying conversation history uses the same tokens as the original conversation. This is a one-time cost on activation change, not per-turn.

## History and Skill Injection Continuity

### One Session, Not Two

When a silent restart occurs (eyeball activation/deactivation), the pre-restart and post-restart Claude Code processes are **compiled into a single session** in history. The user had one conversation — the fact that the underlying process restarted is invisible.

Buildor maintains the same `session_id` across restarts. Messages from both processes are stored under the same session. The history viewer shows one continuous thread.

### Skill Injection Markers

When a skill is activated or deactivated mid-session, Buildor inserts a **skill injection marker** into the message history. This is a metadata-only record (not a user or assistant message) that captures:

```
chat_messages table:
  + role: 'system-event'              // distinct from 'user' | 'assistant'
  + event_type: 'skill-activated' | 'skill-deactivated' | 'skill-run'
  + metadata: JSON {
      skillName: string,              // e.g., "analyze-performance"
      skillDescription: string,       // for Aware re-injection context
      skillSource: 'buildor',         // always buildor for managed skills
      params?: Record<string, any>,   // if Action mode was used with params
      timestamp: string
    }
```

In the history viewer, these render as a subtle inline marker:

```
┌─────────────────────────────────────────────┐
│  ○ analyze-performance activated            │
│  ───────────────────────────────────────     │
│  [conversation continues...]                │
└─────────────────────────────────────────────┘
```

### Aware Re-injection: Skill Awareness

When a past session is re-injected via the Aware system (eyeball in History panel), the AI receives the full conversation including skill injection markers. This creates an important interaction:

- **Buildor skills**: The AI sees markers like `[skill-activated: analyze-performance]` in the transcript. It knows a Buildor skill was used but **cannot invoke it via slash command** — these skills don't exist in `.claude/skills/`. The AI should recognize this and ask: *"This session used the Buildor skill 'analyze-performance' — would you like me to activate it for this session too?"* Buildor can facilitate this by showing a prompt or auto-suggesting activation.

- **Native project skills**: These appear in the transcript as normal `/<skill-name>` invocations. The AI can see them in the history and invoke them again directly via slash command if needed — no special handling required.

This distinction is why the marker metadata includes `skillSource: 'buildor'` — it tells both the AI and Buildor's UI how to handle re-invocation.

## Panel Layout

### Consistent Across Claude Chat and Workflows

Both the Claude Chat screen and the Workflow/Worktree screen share the **identical** right-side panel layout. The panels, their behavior, and their content are the same in both contexts.

### Three Panels, One Open at a Time

```
┌──────────────────────────────────────────────────────────────────┐
│  Chat/Workflow Area     │ Skills(28px) │ Agents(28px) │ History(28px)│
│  (flex: 1)              │  or 220px    │  or 250px    │  or 280px   │
└──────────────────────────────────────────────────────────────────┘
```

- **Collapsed**: Each panel is a 28px vertical tab label
- **Expanded**: Only one panel open at a time. Opening one closes any currently open panel.
- **Total collapsed width**: 84px (3 x 28px) — minimal footprint

### Agents Panel — Active Indicator

The Agents tab shows a **live activity badge** on the collapsed vertical label when agents are running:

- **No active agents**: Plain "Agents" label, same styling as other tabs
- **Active agents**: Pulsing green dot + count badge visible on the 28px collapsed tab
- Badge updates in real-time as agents start/complete
- Clicking opens the panel to see agent details (status, output, progress)

### Breakout Worktree Window

The breakout window also includes all three panels. The Skills palette in the breakout window is where worktree-scoped skill activation happens (eyeball toggling triggers silent restart of that worktree's Claude session).

## Agent Architecture

### Flat Agent Pool

All agents live in a **flat pool** managed directly by Buildor. There is no nested subprocess tree — every agent is a first-class entry that Buildor owns, monitors, and can kill.

```
Implementation (flat):
  Agent Pool: [A, B, C, D]
  A: { parent: null,  returnTo: "main-chat" }
  B: { parent: "A",   returnTo: "A" }
  C: { parent: "A",   returnTo: "A" }
  D: { parent: "A",   returnTo: "A" }

UI (hierarchical):
  A
  ├─ B
  ├─ C
  └─ D
```

The `parent` field is **routing metadata only** — it determines where to inject results when an agent completes, and how to display hierarchy in the UI. It does not imply subprocess nesting. Buildor talks to every agent directly via its own PTY.

**Why flat?**
- Buildor can kill any agent directly (no "ask A to ask B to stop")
- Permissions from any agent route to the main screen equally
- Status card shows all agents with equal visibility
- No recursive subprocess management

### Enforced Agent Control: `--disallowedTools "Agent"`

Buildor spawns Claude Code with the Agent tool **disabled**:

```bash
claude --disallowedTools "Agent" --output-format stream-json --input-format stream-json ...
```

This is a hard constraint at the CLI level — Claude **cannot** spawn its own subagents. All agent spawning goes through Buildor via the marker pattern.

### Marker-Based Agent Requests

Since Claude can't use the Agent tool, it is instructed (via system prompt / context injection) to emit a structured marker when it wants a subagent:

```
-<*{ "action": "spawn_agent", "type": "Explore", "prompt": "research API rate limits", "name": "research-rate-limits" }*>-
```

Buildor's stream parser detects the `-<*{` ... `}*>-` pattern, intercepts it, strips it from displayed output, and spawns a new Claude Code subprocess in the flat pool. The marker is unique enough to never collide with normal output.

This applies to **every** Claude session Buildor manages — main chat, worktree sessions, and agents themselves. When agent A emits a marker requesting subagents B, C, D, Buildor spawns all three as peers in the pool with `parent: "A"` and `returnTo: "A"`.

### Native Skill Edge Case

Native `.claude/skills/` with `context: fork` are handled by Claude Code's skill loader, not the Agent tool. The `--disallowedTools "Agent"` flag does not prevent this. For this edge case:

- **Detection**: `SubagentStart`/`SubagentStop` hooks registered in Claude Code's settings.json (Buildor adds these hooks on session start, removes on session end, preserving any pre-existing hooks)
- **Visibility**: Lifecycle events (started, stopped) + JSONL transcript file tailing at `~/.claude/projects/<hash>/sessions/<agent-id>.jsonl` (written incrementally in real-time)
- **Management**: None — Buildor observes but cannot control these agents
- **UI**: Shown in the Agents panel and status card with a distinct Claude icon badge and limited status ("Running..." / "Completed")
- **Kill option**: The only way to kill a runaway native skill agent is to interrupt the entire parent Claude session

This is an acceptable tradeoff: native skills are displayed as read-only convenience shortcuts in the palette. If a skill needs forking and full control, it should be a Buildor skill.

### Hook Management

Buildor registers hooks in Claude Code's settings.json for native agent observation:

```json
{
  "hooks": {
    "SubagentStart": "buildor-hook subagent-start",
    "SubagentStop": "buildor-hook subagent-stop"
  }
}
```

**Important**: Buildor checks for existing hooks before adding its own (append, don't overwrite). On session end, Buildor removes only its own hooks. Hooks are never committed to the repo.

### Core Principle: Buildor Orchestrates, AI Reports

The main chat session is the **user-facing caretaker/orchestrator**. But the actual orchestration — process management, permission routing, progress tracking — is handled by **Buildor code**, not AI tokens. The main chat AI only gets involved when:

- The user asks about agent status ("how is it going?")
- A decision requires human input (surfaced via Buildor, not AI polling)
- An agent completes and results need summarizing

This keeps token usage minimal. Buildor tracks everything; the AI reads Buildor's tracking data on demand.

### Agent Lifecycle

```
1. Skill with context: fork is activated (Action or Eyeball triggers it)
   -> Buildor spawns a Claude Code subprocess
   -> Registers it in the flat agent pool (in-memory + SQLite)
   -> Sets health state to "healthy"
   -> Agents panel badge updates: pulsing dot + count

2. Agent runs independently
   -> Its messages stream into its own message log (same DB, linked session_id)
   -> Buildor code monitors the subprocess output in real-time
   -> Buildor health monitor tracks output frequency and patterns
   -> No tokens spent on the main chat unless the user asks

3. Agent needs permission
   -> Permission request surfaces on the MAIN screen (not buried in the agent panel)
   -> Same permission card UI as the main chat (Approve/Always Allow/Deny)
   -> User approves/denies, Buildor routes the response back to the subprocess
   -> Main chat AI is NOT involved — this is pure code routing

4. Agent completes
   -> Buildor captures the result
   -> Injects a SUMMARY (not full transcript) into the return-to session
   -> Full transcript saved in history for human review
   -> Agents panel badge decrements
```

### Result Routing

When an agent completes, its output is handled according to its **return mode**. This is configured in the skill's `skill.json` or in the marker that spawned it.

#### Three Return Modes

| Mode | What happens on completion | Token cost to caller |
|---|---|---|
| `summary` | Concise summary injected into return-to session | Low (summary only) |
| `file` | Agent writes output to a specified file path, caller gets only "done + filepath" | Minimal (one line) |
| `both` | Writes to file AND injects summary into return-to session | Low (summary only) |

#### Mode: `summary` (default)

The return-to session receives a concise result summary — not the full transcript.

```
Agent B completes after 47 messages and 12 tool calls:

What B's return-to (Agent A) receives:
  "web-search-3 completed: Found 3 relevant articles on API rate limiting.
   Key findings: Stripe uses token bucket (1000/min), AWS uses leaky bucket (500/min).
   Files read: none. Duration: 43s."

What history stores:
  Full 47-message transcript under B's session_id, viewable in Agents panel / History.
```

The summary is generated by Buildor code — extracting the agent's final text output and key metrics (duration, tool calls, files touched). Not an AI summarization step unless the output is too complex for code extraction.

#### Mode: `file`

The agent writes its output to a file (e.g., `research.md`, `test-report.md`). The return-to session receives **only a completion notice with the filepath** — zero context payload.

```
Agent B (researcher) completes:

What B does before exiting:
  Writes findings to /tmp/buildor/agents/research-rate-limits.md

What B's return-to (Agent A) receives:
  "research-rate-limits completed. Output: /tmp/buildor/agents/research-rate-limits.md (Duration: 43s)"

Agent A (or the next flow stage) reads the file when it needs the data.
```

This is the key pattern for **flow pipelines**: researcher writes `research.md`, planner reads it, planner writes `plan.md`, implementer reads it. Each stage is decoupled — no context bleed between agents. The file is the interface.

**File location**: Buildor manages output files in a temp workspace (e.g., `~/.buildor/agent-output/<session-id>/`). Files persist for the duration of the parent session and are cleaned up when the session ends (or archived if the user wants to keep them).

#### Mode: `both`

Writes to file AND sends a summary. Useful when the parent agent needs enough context to make a decision, but the full output also needs to be available for a later stage.

```
Agent B (test-runner) completes:

Writes full report to: /tmp/buildor/agents/test-report.md

Injects into Agent A:
  "test-runner completed. 148/312 tests passed.
   14 failures in src/api/. Full report: /tmp/buildor/agents/test-report.md"
```

#### Configuration

In `skill.json`:

```json
{
  "execution": {
    "returnMode": "file",
    "outputPath": "research-{{name}}.md"
  }
}
```

Or in the marker:

```
-<*{ "action": "spawn_agent", "type": "Explore", "name": "research-rates",
     "prompt": "...", "returnMode": "file", "outputPath": "research-rates.md" }*>-
```

`outputPath` supports `{{name}}` and `{{timestamp}}` substitutions. If omitted, defaults to `<agent-name>.md`.

### Agent Health States

Buildor code monitors every agent in the pool and maintains a health state. This is pure code — pattern matching on the output stream, no AI tokens.

#### Agent Completion Signals

Buildor accepts two completion signals:

| Signal | Meaning |
|---|---|
| Process exit (code 0) | Agent finished cleanly |
| Process exit (non-zero) | Agent crashed or was killed |

There is no marker-based completion signal. If an agent finishes its work but the process doesn't exit (Claude waiting for input, idle), this is handled by the `idle` health state — the parent determines whether the agent is actually done and kills it.

#### Health States

```
healthy     — producing tool calls / output at normal intervals
idle        — process alive but no output AND no pending tool calls (possibly done, not exited)
stalling    — was producing output, then stopped mid-task
looping     — repeated similar tool calls detected (same file, same pattern, same error)
erroring    — consecutive errors or failed tool calls
distressed  — any unhealthy state persisted past threshold
```

#### Detection (Buildor Code)

- **Idle**: Agent's last message was a final text response (not a tool call), and no new output for X seconds. This is distinct from stalling — stalling means interrupted mid-work, idle means possibly finished. Buildor alerts the parent with a different message: "Agent may be complete."
- **Stalling**: Timer resets on every new tool call or message. Last activity was a tool call or mid-task output. If timer exceeds threshold (default 30s, configurable per skill), flip to `stalling`.
- **Looping**: Buildor maintains a rolling window of recent tool calls. If the same tool + same input appears N times (default 3), flip to `looping`.
- **Erroring**: Count consecutive `tool_result` blocks with `isError: true`. If count exceeds threshold (default 3), flip to `erroring`.
- **Distressed**: Any unhealthy state persists past a second threshold (default 45s). Distress flag set, escalation timer starts.

#### Escalation Flow

```
1. Buildor detects an unhealthy state in agent B (child of agent A)

   If IDLE:
   -> Buildor injects into agent A's stdin:
      [BUILDOR_ALERT: Agent "web-search-3" appears idle (no output for 30s, last activity was text response).
       It may have completed without exiting.
       -<*{ "action": "kill_agent", "agent_id": "web-search-3", "mark": "completed" }*>-
       -<*{ "action": "extend_agent", "agent_id": "web-search-3", "seconds": 60 }*>-]
   -> Parent decides: mark as complete (kill + flag success) or give more time

   If DISTRESSED (stalling/looping/erroring):
   -> Status card updates: 🔴 web-search-3  ⚠ Looping (45s) — parent alerted
   -> Buildor injects into agent A's stdin:
      [BUILDOR_ALERT: Agent "web-search-3" is in distress (looping) for 45s.
       Last activity: repeated Read calls on src/api/rateLimit.ts
       Options:
       -<*{ "action": "kill_agent", "agent_id": "web-search-3" }*>-
       -<*{ "action": "extend_agent", "agent_id": "web-search-3", "seconds": 120 }*>-
       -<*{ "action": "takeover_agent", "agent_id": "web-search-3" }*>-]

2. Agent A (the parent) decides:
   -> kill_agent: Buildor kills B's subprocess. If mark: "completed", flag as success. Otherwise flag as failed.
   -> extend_agent: Buildor resets timers, gives more time
   -> takeover_agent: Buildor kills B, injects summary of B's work so far
      into A's context, A continues the task itself

3. If agent A is ALSO in an unhealthy state (or has no parent):
   -> Escalation reaches the user via the status card
   -> Status card shows: 🔴 research-agent  ⚠ Distressed — needs attention
   -> User can click to open Agents panel, review transcript, manually kill/extend
```

#### Escalation Chain

```
Unhealthy agent with parent     → alert injected into parent agent
Unhealthy agent without parent  → alert shown to user in status card
Unhealthy parent + child        → both escalate to user
```

The parent agent's decision uses the same marker pattern — Buildor parses and acts. Token cost: one alert injection + one agent response. Health monitoring itself is zero tokens.

#### Configurable Thresholds

Thresholds can be set globally or per-skill in `skill.json`:

```json
{
  "execution": {
    "health": {
      "idleSeconds": 30,
      "stallSeconds": 30,
      "loopDetectionWindow": 5,
      "loopThreshold": 3,
      "errorThreshold": 3,
      "distressSeconds": 45
    }
  }
}
```

### "How Is It Going?" — Live Status Without Stopping

The user can ask the main chat "how is it going?" at any time. This does NOT stop or interrupt the subagent. The flow:

```
User: "how is it going?"
  -> Buildor intercepts (or the main chat AI triggers a status check)
  -> Buildor reads from its own agent tracker:
     - Agent name, skill that spawned it
     - Running duration
     - Last N messages (or a summary)
     - Current status (working, waiting for permission, idle)
     - Tool calls made, files touched
  -> This status snapshot is injected into the main chat context
  -> Main chat AI formats a human-friendly update
  -> Subagent continues running uninterrupted the entire time
```

Token cost: one small status payload + one AI response. The subagent's full conversation history is NOT dumped into the main chat — only Buildor's tracked metadata.

### Agents Panel

When opened (250px), the Agents panel shows:

- **List of active agents**: Each entry shows name, source skill, duration, status indicator
- **Click to expand**: Opens a read-only transcript viewer (same component as History transcript viewer) showing the agent's live message stream
- **Completed agents**: Collapsed section at the bottom showing recent completions with duration and outcome
- **Permission alerts**: If an agent is waiting for permission, its entry pulses/highlights — clicking it or clicking the permission card on the main screen both work

### Permission Surfacing

Agent permissions **always surface to the main screen**, not the Agents panel. Rationale:

- The user might have the Agents panel closed (only one panel open at a time)
- Permissions are blocking — they need immediate visibility
- They render as the same PermissionCard component used for main chat permissions
- The card indicates which agent is requesting: "Agent: analyze-performance wants to use Edit on src/utils/foo.ts"
- Approval routes back to the correct subprocess via Buildor code

### Main Chat as Caretaker

The main chat session is the top-level orchestrator. It can:

- **Peek at agent logs**: When the user asks, Buildor injects a status summary (code-level, not AI-to-AI communication)
- **Give updates**: AI formats Buildor's tracking data into natural language
- **Pass requests forward**: If the user says "tell the performance agent to also check the database module," Buildor can inject that as a message into the subagent's input stream
- **Receive results**: When an agent completes, Buildor injects the result summary into the main chat so the AI can incorporate it

**What the main chat AI does NOT do:**
- Constantly poll subagents (Buildor's event system handles notifications)
- Manage subprocess lifecycle (Buildor code does this)
- Route permissions (Buildor code does this)
- Duplicate the subagent's full conversation in its own context (only summaries)

### History Model

All agents exist in the flat pool, but history preserves the logical hierarchy via metadata:

```
chat_sessions table:
  + parent_session_id (nullable)    — routing metadata (who to return results to)
  + return_to: string (nullable)    — "main-chat" or a session_id
  + session_type: 'chat' | 'agent' | 'worktree'
  + source_skill: string (nullable) — which skill spawned this agent
  + agent_source: 'buildor' | 'native' (nullable) — full control vs observed
  + started_at: timestamp
  + ended_at: timestamp (nullable)

chat_messages table:
  (unchanged — messages belong to their session_id)

Agent lifecycle markers in the RETURN-TO session's messages:
  + role: 'system-event'
  + event_type: 'agent-started' | 'agent-completed' | 'agent-failed' | 'agent-permission'
  + metadata: JSON {
      agentSessionId: string,
      skillName: string,
      agentSource: 'buildor' | 'native',
      status: string,
      parentSessionId: string | null,
      durationMs?: number,
      resultSummary?: string,
      filesChanged?: string[]
    }
```

The `parent_session_id` field drives UI hierarchy. The `return_to` field drives result routing. These are usually the same, but separating them allows flexibility (e.g., an agent could return results to main chat even if it was spawned by another agent).

### Reviewing History with Agent Context

When reviewing a past session in the History panel (or via Aware re-injection):

- The main session shows **agent lifecycle markers** inline (started, completed, permissions granted)
- Expanding an agent marker shows the **full subagent transcript** nested inside
- A top-level AI reviewing this history can see:
  - When each agent was spawned and by which skill
  - What the agent did (its full message log)
  - How long it took
  - What permissions it needed
  - What it produced
- This gives complete traceability without the subagent's messages cluttering the main conversation flow

### Rendering

#### Agent Status Card (Pinned to Bottom)

A persistent card pinned above the input area (same position as the existing task tracker card). This is the **primary at-a-glance view** — the user never needs to open the Agents panel just to know what's happening.

```
┌─────────────────────────────────────────────────────────┐
│ 🔵 analyze-performance  Scanning src/utils/db.ts...     │
│ 🔵 run-tests            148/312 tests passed (47%)      │
│ 🟡 lint-check            Waiting for permission (Edit)  │
└─────────────────────────────────────────────────────────┘
```

- **One line per top-level agent**: Name + single-line status derived from latest activity
- **Child count badge**: `(4)` when an agent has spawned children. The status line shows the most recently active child's status.
- **Status indicators**: Running (blue spinner), waiting for permission (amber pulse), completed (green check, fades after a few seconds), failed (red x, persists until dismissed)
- **Buildor code generates the status line** by parsing the agent's most recent tool call or message — no AI tokens spent. Examples:
  - Agent called `Read` on `foo.ts` → "Reading foo.ts..."
  - Agent called `Edit` on `bar.rs` → "Editing bar.rs..."
  - Agent called `Bash` with `cargo test` → "Running cargo test..."
  - Agent sent a text message → truncated first line of message

**Accordion expand (click a parent row with children):**

```
┌─────────────────────────────────────────────────────────┐
│ 🔵 analyze-performance  Scanning src/utils/db.ts...     │
│ 🔵 research-agent (4)   ▼                               │
│    🔵 web-search-1     Fetching docs.stripe.com/rate... │
│    🟢 web-search-2     Done — 3 results                 │
│    🔵 web-search-3     Fetching stackoverflow.com/q...  │
│    🔵 code-search      Grepping for rateLimiter...      │
│ 🟡 lint-check            Waiting for permission (Edit)  │
└─────────────────────────────────────────────────────────┘
```

- **Accordion behavior**: Only one parent expanded at a time. Clicking expands it and collapses any other. Re-clicking collapses back to one line.
- **Max depth in card: 2 levels.** If a child spawns grandchildren, the child shows `(N)` but grandchild depth truncates with "N more → Agents panel" to prevent unbounded nesting.
- **Auto-collapse on completion**: When all children finish, parent collapses to one summary line.
- **Vertical space cap**: If expanded children exceed ~6-7 rows, truncate with "N more..." linking to the Agents panel.

**General card behavior:**
- **Clicking any agent line** opens the Agents panel focused on that agent's transcript
- **Card auto-hides** when no agents are active (same as task tracker)
- **Compact**: This is a status ticker, not a log viewer

#### Meaningful Output → Main Chat

When an agent produces **output worth seeing** (not just status), Buildor surfaces it directly into the main chat stream. This is code-level decision making — Buildor inspects the agent's output and decides what deserves promotion:

**What gets surfaced:**
- Structured results: test summaries, lint reports, analysis tables, charts
- Completion summaries: "Agent completed: 5 files changed, all tests passing"
- Errors or failures that need user attention
- Any output the skill explicitly marks as `surface: true` in its config

**What stays in the agent transcript only:**
- Intermediate tool calls (reading files, searching)
- Thinking/reasoning steps
- Routine confirmations

**How it renders in main chat:**
- As a distinct "agent output" block with a header badge showing which agent produced it
- Collapsible — shows summary by default, expand for full output
- Not a message from the main chat AI — it's a Buildor-injected content block
- The main chat AI can see it and reference it if the user asks follow-up questions

Example flow:
```
User: "run the test suite and check for regressions"
  -> User clicks Action on "run-tests" skill
  -> Agent card appears at bottom: "🔵 run-tests  Running npm test..."
  -> Agent card updates: "🔵 run-tests  148/312 tests passed..."
  -> Agent completes
  -> Main chat receives surfaced output:

  ┌─ Agent: run-tests ──────────────────────────────────┐
  │  Test Results                                        │
  │  ✅ src/utils:     42/42  passed                     │
  │  ✅ src/components: 89/89  passed                    │
  │  ❌ src/api:       17/31  passed (14 failures)       │
  │  ⚠️  src/hooks:     0/150 skipped (dependency error) │
  │                                                      │
  │  [Expand full report]                                │
  └──────────────────────────────────────────────────────┘

  -> Agent card fades out (completed)
  -> User can now ask: "what failed in src/api?"
  -> Main chat AI has the surfaced summary in context, responds
```

**Token cost of surfacing**: Only the surfaced content enters the main chat context — not the full agent transcript. If a test report is 20 lines, that's 20 lines of tokens. The agent's 500-message investigation to get there stays in the agent's own session.

#### In Agents Panel (250px, scrollable):

Expandable sections with **accordion behavior** — only one agent expanded at a time. Clicking one collapses the rest.

```
┌─ Agents ─────────────────────────────────────────┐
│                                                    │
│ ▶ analyze-performance              5m 31s  🔵     │
│   Scanning src/utils/db.ts...                      │
│                                                    │
│ ▼ research-agent (4)               2m 14s  🔵     │
│   ▶ web-search-1                   0m 43s  🔵     │
│   ▶ web-search-2                   1m 02s  ✅     │
│   ▶ web-search-3                   0m 28s  🔵     │
│   ▶ code-search                    0m 15s  🔵     │
│   [View full transcript]                           │
│                                                    │
│ ▶ lint-check                       1m 12s  🟡     │
│   Waiting for permission (Edit)                    │
│                                                    │
│ ── Completed ─────────────────────────────         │
│ ▶ test-runner                      3m 45s  ✅     │
└────────────────────────────────────────────────────┘
```

- **Collapsed row**: Name + duration + status icon + one-line summary
- **Expanded row**: Shows children (if any) with same accordion — expanding a child collapses sibling children. Plus a [View full transcript] link that opens the read-only transcript viewer.
- **Completed section**: Collapsed at bottom, shows recently finished agents
- **Scrollable**: Panel scrolls if agents exceed visible space — this is the escape valve for the pinned card's space constraints

#### In History:
- Single parent session entry — agents are nested children
- Agent entries show: skill name, duration, outcome, files touched
- Expandable to read the full agent transcript
- Surfaced output blocks are preserved in the main session's message stream

## Cross-Platform Script Considerations

- Claude Code uses **bash on all platforms** (including Windows via Git Bash), so `.sh` scripts work everywhere
- For complex logic, prefer **Node scripts** (`.js`/`.ts`) since the stack already depends on Node
- Avoid `.ps1` or `.bat` — they break on macOS/Linux
- The `shell` frontmatter field defaults to `bash` — leave it as-is for cross-platform compatibility

## Type Updates Needed

The existing `Skill` interface in `src/types/skill.ts` needs to be updated to reflect the two skill sources and the Buildor-native JSON format:

```typescript
// --- Buildor Skills (from ~/.buildor/skills/) ---

export interface BuildorSkill {
  // From skill.json
  name: string;
  description: string;
  tags?: string[];
  params?: SkillParam[];
  execution?: SkillExecution;
  visibility?: SkillVisibility;
  shell?: 'bash' | 'powershell';

  // Resolved at load time
  skillDir: string;                   // absolute path to skill directory
  promptContent: string;              // raw prompt.md content (pre-processing at invoke time)
  supportingFiles?: string[];         // other files in the skill directory
  lastModified?: number;              // for cache invalidation
}

export interface SkillParam {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  required: boolean;
  default?: string | number | boolean;
  options?: string[];                 // for select type
  description?: string;
  placeholder?: string;               // hint text in modal input
}

export interface SkillExecution {
  allowedTools?: string[];
  context?: 'fork';
  agent?: string;                     // subagent type (Explore, Plan, general-purpose)
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'max';
}

export interface SkillVisibility {
  paths?: string[];                   // glob patterns for project relevance
  autoLoad?: boolean;                 // whether Claude can auto-discover via description
}

// --- Project Skills (from .claude/skills/) ---

export interface ProjectSkill {
  name: string;
  description: string;                // parsed from SKILL.md frontmatter
  source: 'project' | 'personal';    // .claude/skills/ vs ~/.claude/skills/
  skillDir: string;                   // absolute path (read-only display)
}

// --- Union for palette rendering ---

export type PaletteSkill =
  | { type: 'buildor'; skill: BuildorSkill }
  | { type: 'project'; skill: ProjectSkill };
```

## Implementation Order

1. **Storage + parsing**: Read skill.json + prompt.md from `~/.buildor/skills/`, scan `.claude/skills/` for project skills, build index
2. **Palette UI**: Two-section palette — project skills (click to prefill `/name`) and Buildor skills (eyeball + action icons)
3. **Action mode**: Modal generation from `params`, `{{param}}` substitution, injection into active session
4. **Pre-processing**: `!`shell`` execution, `${CLAUDE_SKILL_DIR}` resolution, relative link resolution
5. **Eyeball mode**: Silent session restart with description injection, on-demand full content loading
6. **Session parameters**: model/effort overrides, allowed-tools auto-accept
7. **Subagent support**: `context: fork` spawning, inline rendering, history nesting
8. **Skill editor**: In-app creation and editing of skills (Monaco for prompt.md, form builder for skill.json)
9. **Shared repo sync**: Sync skills across an org via shared git repo (see below)

## Org-Level Skill Sharing

A core goal of Buildor skills is **organizational portability** — teams can curate, refine, and version-control skills as a shared asset across all projects.

### Shared Skills Repository

Skills in `~/.buildor/skills/` can be backed by a shared git repository:

- **Setup**: Point Buildor at a git repo URL in Settings (e.g., `github.com/org/buildor-skills`)
- **Sync**: Buildor clones/pulls to `~/.buildor/skills/` on startup or manual refresh
- **Contribute**: Users edit skills locally, then push changes back to the shared repo
- **Versioning**: Git history tracks skill evolution — who changed what, when, why
- **Branching**: Teams can experiment with skill variants on branches before merging to main

This means a skill written and refined by one team member is immediately available to everyone in the org, across all their projects. No copying files between repos, no per-project duplication.

### Shared Repo Structure

The shared repo mirrors the `~/.buildor/skills/` directory exactly — each skill is a directory with `skill.json` + `prompt.md`:

```
buildor-skills/                    # root of the shared git repo
├── README.md                      # optional: repo docs for contributors
├── defaults.json                  # optional: org-wide default thresholds, model preferences
├── analyze-performance/
│   ├── skill.json
│   ├── prompt.md
│   ├── reference.md
│   └── scripts/
│       └── profiler.js
├── run-tests/
│   ├── skill.json
│   └── prompt.md
├── research-api/
│   ├── skill.json
│   ├── prompt.md
│   └── examples.md
└── deploy-staging/
    ├── skill.json
    ├── prompt.md
    └── scripts/
        └── deploy.sh
```

**Key points for code orchestration:**
- Each skill directory is self-contained — `skill.json` is the machine-readable entry point for Buildor to parse, validate, and execute
- Buildor scans the repo root for directories containing `skill.json` — that's the discovery mechanism
- `defaults.json` at repo root provides org-wide fallbacks (default model, effort level, health thresholds) that individual skills can override in their own `skill.json`
- The structure is the same locally and in the repo — `git pull` updates `~/.buildor/skills/` directly, no transformation step
- Skills can reference their own supporting files (scripts, references) via relative paths from their directory

### Sync Flow

```
1. User configures shared repo URL in Buildor Settings
2. On startup (or manual refresh):
   a. If ~/.buildor/skills/ is not a git repo: clone the shared repo into it
   b. If it is: git pull (fast-forward only to avoid conflicts)
   c. Rebuild the skills index cache in SQLite
3. On skill edit (via in-app editor):
   a. Changes written to ~/.buildor/skills/<name>/
   b. User explicitly clicks "Push Changes" in Settings to push back
   c. No auto-push — avoids accidental commits of half-finished work
4. Conflict handling:
   a. If pull fails (diverged), show a warning in Settings
   b. User resolves manually or resets to remote
```

### Contractor / Multi-Org Use Case

The two-source architecture (project skills vs Buildor skills) naturally supports contractor workflows. A contractor working inside a client's repository sees the client's `.claude/skills/` in the palette as read-only project skills — they can use them as-is via slash commands. Meanwhile, the contractor's own team skills live in `~/.buildor/skills/`, backed by their org's shared repo, completely outside the client's codebase.

When the engagement ends, the contractor leaves zero footprint. No skills were added to the client's repo, no cleanup PR needed, no accidental tooling leakage. The client's repo is exactly as it was. Conversely, when a contractor moves to a different client, their full skill library comes with them — same `~/.buildor/skills/`, new project, immediate productivity.

This also works in reverse: a client can onboard a contractor by simply giving them repo access. The contractor's palette automatically picks up the project's native skills alongside their own. Both skill sets compose in the same session without either side modifying the other's tooling.
