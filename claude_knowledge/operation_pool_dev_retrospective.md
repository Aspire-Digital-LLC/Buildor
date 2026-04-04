# Operation Pool Development Retrospective

First multi-agent orchestrated development cycle in Buildor. Manual orchestration with AI context passing across 7 phases.

---

## What Worked

### Phased Pipeline with File-Based Handoffs
Each agent got only the docs it needed. No context bloat. The analysis agent read code, the planner read analysis + research, dev agents read only the plan. Clean separation.

### Parallel Agent Spawning
Phase A (4 foundation tasks) and Phase E (5 integration tasks) ran in parallel. Total wall-clock time was bounded by the slowest agent, not the sum. Real speedup.

### The Review Loop
This was the star. 4 review passes caught increasingly subtle issues:
- **Review 1**: Basic gaps — shutdown never called, persisted limits dead, no timeouts, no backpressure
- **Review 2**: Architectural issues — lock ordering violation, tier priority inversion, contention from write locks
- **Review 3**: Passed clean (proof the fixes worked)
- **Adversarial review**: Constructed concrete thread interleavings that proved catch_unwind was incomplete, shutdown drain could panic-abort, and active_count could leak

Without the loop, we'd have shipped a concurrency primitive with at least 2 data-loss bugs and a functional deadlock path.

### Self-Contained Task Descriptions in the Plan
The planner embedded file paths, line numbers, struct names, and code patterns directly into each task. Dev agents never needed to read the analysis or research docs. This was critical — it meant dev agents had small, focused contexts.

### Orchestrator Staying Clean
I never read the spec or research docs myself. I dispatched, judged agent output, fixed compile errors, and made triage decisions. This kept my context window lean for the entire multi-hour session.

## What Didn't Work

### Sub-Agent Spawning from Agents
The research agent spawned 5 sub-agents but immediately exited without waiting for them. Two orphaned sub-agents wrote partial files, three were lost. Root cause: the agent wasn't instructed to wait for sub-agent results before exiting. We had to add explicit "Do NOT exit until all sub-agents have returned" instructions.

### Marker Syntax in Nested Prompts
The `-<*{` marker contains an asterisk that gets consumed by markdown italic parsing when embedded inside another marker's prompt string. This caused Phase 2's initial spawn to silently fail (marker rendered without asterisk = not recognized by Buildor). Fix: write sub-agent spawning instructions to a file and tell the agent to read it, rather than embedding marker syntax in the prompt.

### Agent Context for Integration Tasks
The Claude integration agent (Task #10) took 247s and had to make nuanced decisions about what to pool-gate vs not (e.g., avoiding double-pooling `start_agent_session_sync`). It handled it well, but these judgment calls would benefit from more explicit guidance in the plan.

### Compile Error Fixing
4 compile errors after Phase E required me to read code and fix manually. The agents couldn't coordinate on shared types (e.g., `PoolConfig::load()` returning `Result` but caller expecting bare struct). A "compilation check" step between phases would catch this earlier.

## Lessons Learned

1. **Review loops are not optional for concurrency code.** The cost of one extra clean pass is negligible vs shipping a race condition. The adversarial pass found 3 more fixable issues after a clean pass.

2. **File-based context passing > prompt stuffing.** Agents that read files have reproducible context. Agents that receive everything in their prompt are at the mercy of truncation and formatting.

3. **The orchestrator should never do the work.** My job was dispatch, triage, and compile-fix. Every time I was tempted to read the spec myself, it would have bloated my context for the rest of the session.

4. **Sub-agent spawning needs explicit wait instructions.** Agents default to "spawn and report done." Must say: "Do NOT exit or report completion until all sub-agents have returned their results."

5. **Marker syntax cannot be nested in prompts.** Use instruction files instead.

6. **Build checks between phases catch integration errors early.** Don't wait until all agents finish to compile.

7. **Adversarial review is higher signal-to-noise than repeated standard review.** Standard review re-reads everything and finds diminishing returns. Adversarial review targets specific fixes and tries to break them — finds different classes of bugs.

## Thoughts Going Forward

### For the Flow Builder
This session is a proof-of-concept for what flows should automate:
- Phase sequencing with dependency tracking
- Parallel agent dispatch within a phase
- File-based context handoff between phases
- Review loops with exit conditions
- The orchestrator role (dispatch + triage) should be the flow engine, not a Claude session

### Recommended Default Flow Template
```
Analysis → Research (parallel sub-agents) → Planning → Development (parallel) → Build Check → Review Loop (until clean) → Adversarial Review → Document → Cleanup
```

### Review Depth Tiers for Flows
- **Light**: Single review pass, fix-and-go. For UI, docs, config.
- **Standard**: Review loop until clean. For features, integrations.
- **Thorough**: Review loop + adversarial. For concurrency, data integrity, security.

The planner should tag each task with a review depth based on what it touches.

### Build Check as a Gate
Add a mandatory build-check stage between dev and review. If it fails, loop back to dev with the error output — don't waste a review agent on code that doesn't compile.

---

## How to Test the Operation Pool

### Basic Verification
1. **Start the app** — pool initializes in `lib.rs:run()`. Check console for errors.
2. **Open source control** — triggers `git status`, `git diff`, `git log` calls. These now route through the pool. If source control works, the git integration is correct.
3. **Commit and push** — exercises `run_git` through the pool with multiple sequential operations.
4. **Start a Claude session** — session spawn routes through pool. If chat works, Claude integration is correct.
5. **Spawn an agent** — agent spawn routes through pool as Tier::Subagent.
6. **Close the app** — should persist limits to `~/.buildor/pool_limits.json`. Check the file exists after first use.
7. **Restart the app** — pool should load persisted limits. Lanes should start at learned concurrency levels, not 1.

### Diagnostic Command
Call `get_pool_status` from the frontend (Tauri invoke) to see:
- Current pool size and max
- Active lane count
- Per-lane queue depths and concurrency levels
- Pool state (-1/0/+1)

### Stress Testing
1. Open multiple projects simultaneously — creates multiple `process/git/{repo}` lanes
2. Rapid git operations (stage, unstage, stage, unstage) — tests concurrent submit to same lane
3. Start multiple worktree sessions — tests parallel Claude session spawning
4. Close app during active operations — tests shutdown drain

### What to Watch For
- Operations completing successfully (same behavior as before pool)
- No hung operations (would indicate stuck active_count or deadlock)
- `pool_limits.json` growing with lane entries over time
- Pool size adapting up (check via diagnostic command after sustained use)

---

## Out of Scope — Follow-Up Items

### 1. Claude Tool Permission Pipeline (Spec Section: "Unified Permission Pipeline")
The spec defines a PreToolUse hook that forces all Claude tool calls to `"ask"` and routes them through the pool before approval. This crosses the Rust/JS boundary (permission responses flow through `parseClaudeStream.ts`) and was explicitly deferred. **This is the biggest remaining piece** — it means Claude agent tool calls currently bypass the pool entirely.

### 2. setup_worktree_deps Bypass
`src-tauri/src/commands/worktree.rs:524-565` — `pnpm install` / `npm install` during worktree setup calls `no_window_command()` directly, bypassing the pool. These are heavy process spawns that should be routed.

### 3. query_claude_status and run_claude_cli Bypass
`src-tauri/src/commands/claude.rs:744, 757` — Two low-frequency Claude CLI calls bypass the pool. Minor but inconsistent.

### 4. Timeout Ghost Threads (Tokio Limitation)
When `tokio::time::timeout` fires on a `spawn_blocking` handle, the blocking thread continues running. No fix within Tokio's model — would require restructuring to async process spawning with `kill_on_drop`.

### 5. Frontend Pool Status UI
The `get_pool_status` Tauri command exists but no frontend component consumes it. A status widget showing lane health, queue depths, and adaptive sizing would aid debugging.

### 6. Pool Config Hot-Reload
`PoolConfig` is loaded once at startup. No mechanism to update config without restart. The lock ordering supports future write-locking of config, but no code path does it.

### 7. Metrics / Observability
No counters for total ops processed, total timeouts, total rejections, average queue wait time. These would be valuable for tuning config values.
