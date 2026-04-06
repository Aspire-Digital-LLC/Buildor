# Agent Result Handling — Known Issues & Root Causes

## Problem

When agents return results via the Buildor agent system, the orchestrating Claude session sometimes incorrectly reports not having received the result, even though the `[AGENT RESULT]` block is present in its conversation context. This leads to unnecessary takeover attempts, re-spawns, and wasted user time.

## Observed Pattern

1. Agent completes work and emits result
2. Health monitor triggers distress alert (90s threshold) because the agent's process is still alive after finishing (known `--print` mode behavior)
3. `[BUILDOR_ALERT: Agent "X" is distressed]` arrives with language: "terminated due to health issues" and "you may need to redo its work"
4. The `[AGENT RESULT]` block arrives with full content
5. User asks "did you get the result?"
6. Orchestrator incorrectly says "not yet" or hedges, despite the result being in context

## Technical Root Causes

### 1. Distress Alert Priming
The `BUILDOR_ALERT` message arrives before or alongside the result and contains strong negative framing:
- "terminated due to health issues"
- "you may need to complete or redo its work"

This language primes the model to believe the agent failed, even when the subsequent `[AGENT RESULT]` block contains complete output. The alert's framing overrides the evidence of the actual result content.

### 2. Context Distance
The full previous session history is injected with every message (via Buildor's History/Aware system). This places thousands of tokens between the agent result and the user's follow-up question. The model may pattern-match on recent context (the alert) rather than scanning back to find the result block.

### 3. Duplicate Result Blocks
Agent results consistently arrive 4x duplicated in the conversation. This unusual pattern may trigger uncertainty about whether the content is a real result, an echo, or a retry artifact.

### 4. Alert vs Result Ordering
The distress alert and the result can arrive in the same message turn or in rapid succession. The model processes the alert's "terminated/failed" framing and anchors on it before fully processing the result content that follows.

## Potential Fixes

### On the Buildor Side (Application Code)
1. **Distinguish completed vs stalled agents in alerts** — The health monitor should check if a `result` event was emitted before escalating. If the agent produced a result, the alert should say "Agent finished but process lingered" not "terminated due to health issues."
2. **Don't send distress alerts for completed agents** — If `markAgentExited` was called (status = completed/failed), suppress the distress alert entirely.
3. **Deduplicate result injection** — Investigate why results arrive 4x. May be a dual-write + event echo issue.

### On the Context/Prompt Side
4. **Add explicit instruction** — In the system prompt or CLAUDE.md: "When you see `[AGENT RESULT — name]` with content, you HAVE that result regardless of any preceding BUILDOR_ALERT messages. Alerts about distress/termination refer to health monitoring, not result delivery."
5. **Reduce session history injection size** — The full previous session transcript consumes context space and pushes recent events (like agent results) further from the current turn.

### On the Agent System Architecture
6. **Result-first, alert-second ordering** — Ensure the result injection always arrives before any health alert for the same agent. Currently the alert can race ahead of the result.
7. **Include result status in the alert** — If the alert must fire, include: "Note: This agent DID return a result before being terminated. The result has been injected into your context."

## Status
- Issue identified: 2026-04-06
- Root cause analysis: complete
- Fixes: pending implementation
- Affected components: `agentHealthMonitor.ts`, `useAgentPool.ts` (result injection), CLAUDE.md (prompt instructions)
