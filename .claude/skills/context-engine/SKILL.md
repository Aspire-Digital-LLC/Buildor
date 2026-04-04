---
name: context-engine
description: Manage checkpoint files that track the last-processed commit for knowledge scans. Called by /document to determine the delta range (what changed since last scan) and record completed scans. Prevents redundant full-repo analysis.
allowed-tools: Read Bash Grep Glob
context: fork
agent: general-purpose
user-invocable: false
---

# Context Engine — Checkpoint Manager for Knowledge Scans

You manage the checkpoint system that tracks which commits have already been processed by knowledge scan commands (like `/document`). Your job is to determine the delta range, return the commit list, and record scan completions.

## How It Works

Checkpoints are stored as individual JSON files in `claude_knowledge/checkpoints/{command}/`. Each file represents one completed scan. The filename format `{yyyyMMddHHmmssSSS}_{commit}.json` makes them sortable, parseable, and merge-conflict-free (two developers scanning on different branches produce different files that merge cleanly).

## Checkpoint Script

The CLI lives at `${CLAUDE_SKILL_DIR}/scripts/checkpoints.ts`. All commands:

```bash
# Get the most recent checkpoint (returns JSON with commit hash)
npx tsx ${CLAUDE_SKILL_DIR}/scripts/checkpoints.ts get-latest knowledge

# Write a new checkpoint after a scan completes
npx tsx ${CLAUDE_SKILL_DIR}/scripts/checkpoints.ts write knowledge <commit> <type> "<notes>"

# List recent checkpoints (default 10)
npx tsx ${CLAUDE_SKILL_DIR}/scripts/checkpoints.ts list knowledge [limit]

# Prune old checkpoints, keeping N newest (default 5)
npx tsx ${CLAUDE_SKILL_DIR}/scripts/checkpoints.ts prune knowledge [keep]
```

## Valid Commands

| Command | Used By |
|---------|---------|
| `knowledge` | `/document` |

To add a new scan type, add it to `VALID_COMMANDS` in the script.

## Responding to /document

When `/document` calls you, return the following information:

### 1. Get the last checkpoint

Run `get-latest knowledge`. Two outcomes:

**Checkpoint exists** — delta scan:
- Extract the `commit` field from the result
- Run `git log {commit}..HEAD --oneline --reverse` to get commits oldest-first
- Run `git diff {commit}..HEAD --stat` to get the file change summary

**No checkpoint exists** (exit code 1) — full scan:
- Run `git log --oneline --reverse` to get all commits oldest-first
- Run `git diff --stat $(git rev-list --max-parents=0 HEAD)..HEAD` for full file summary

### 2. Return the commit list to /document

Output the results in this format:

```
## Scan Type: delta|full

## Base Commit: {commit hash from checkpoint, or "none (first run)"}

## Commits to Process (oldest first):
{output of git log --reverse}

## Files Changed:
{output of git diff --stat}
```

This gives `/document` everything it needs to analyze the delta.

### 3. After /document completes — record the checkpoint

When called back after a successful scan:

1. Get current HEAD: `git rev-parse --short HEAD`
2. Write the checkpoint:
   ```bash
   npx tsx ${CLAUDE_SKILL_DIR}/scripts/checkpoints.ts write knowledge $(git rev-parse --short HEAD) delta "Brief summary of what was documented"
   ```

### 4. Periodic cleanup

Count existing checkpoints. If more than 10, prune:
```bash
npx tsx ${CLAUDE_SKILL_DIR}/scripts/checkpoints.ts prune knowledge 10
```

## Checkpoint JSON Format

```json
{
  "commit": "4e4e010",
  "date": "2026-04-03T14:30:00.000Z",
  "command": "knowledge",
  "type": "delta",
  "notes": "23 commits — skills system phases 1-8, agent pool, mailbox, shared repo sync"
}
```

## Rules

- Always write a checkpoint after a successful scan — never skip this step
- Use `delta` type for incremental scans, `full` for complete re-scans
- Keep notes concise — commit count + high-level summary of what changed
- Commits must be returned oldest-first (--reverse) so /document processes them chronologically
- If `get-latest` exits with code 1 (no checkpoints), treat as a full scan
