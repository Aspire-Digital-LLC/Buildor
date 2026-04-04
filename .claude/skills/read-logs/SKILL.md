---
name: read-logs
description: Query and analyze Buildor application logs from the SQLite database. Use to debug errors, analyze performance, review session timelines, and audit operations.
allowed-tools: Read Bash
context: fork
agent: general-purpose
---

# /read-logs — Retrieve and Read Buildor Application Logs

Buildor stores structured application logs in an SQLite database.

## Database Location

The database is at the OS-standard app data directory:
- **Windows**: `%APPDATA%\Buildor\logs.db`
- **macOS**: `~/Library/Application Support/Buildor/logs.db`
- **Linux**: `~/.config/Buildor/logs.db`
- **Legacy fallback**: `~/.buildor/logs.db`

## Quick Start

```bash
# Use the CLI script (auto-detects DB location)
bash ${CLAUDE_SKILL_DIR}/scripts/read-logs.sh                    # Recent 30 logs
bash ${CLAUDE_SKILL_DIR}/scripts/read-logs.sh --errors           # Errors only
bash ${CLAUDE_SKILL_DIR}/scripts/read-logs.sh --session <GUID>   # Full session timeline
bash ${CLAUDE_SKILL_DIR}/scripts/read-logs.sh --repo <name>      # Filter by repo
bash ${CLAUDE_SKILL_DIR}/scripts/read-logs.sh --slow             # Slowest operations
bash ${CLAUDE_SKILL_DIR}/scripts/read-logs.sh --stats            # Operation statistics
bash ${CLAUDE_SKILL_DIR}/scripts/read-logs.sh --sessions         # List all sessions
bash ${CLAUDE_SKILL_DIR}/scripts/read-logs.sh --since "1 hour"   # Recent timeframe

# Or query directly
sqlite3 -header -column "$APPDATA/Buildor/logs.db" "SELECT timestamp, level, function_area, operation, message FROM logs ORDER BY timestamp DESC LIMIT 20;"
```

## Log Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Auto-incrementing primary key |
| `session_id` | text | GUID correlating all events from one worktree session |
| `timestamp` | text (ISO 8601) | When the event occurred |
| `end_timestamp` | text (ISO 8601) | When the event finished |
| `duration_ms` | integer | Duration in milliseconds |
| `repo` | text | Repository name/path (null for global events) |
| `function_area` | text | `source-control`, `code-viewer`, `claude-chat`, `flow-builder`, `worktree`, `project`, `system` |
| `level` | text | `debug`, `info`, `warn`, `error` |
| `operation` | text | Specific operation name |
| `message` | text | Human-readable description |
| `details` | text | Extended details or stack traces |

## Useful Queries

```sql
-- Recent errors
SELECT timestamp, repo, function_area, operation, message, details
FROM logs WHERE level = 'error' ORDER BY timestamp DESC LIMIT 20;

-- Slowest operations
SELECT timestamp, repo, operation, message, duration_ms
FROM logs WHERE duration_ms IS NOT NULL ORDER BY duration_ms DESC LIMIT 20;

-- Full session timeline
SELECT timestamp, function_area, operation, message, duration_ms
FROM logs WHERE session_id = '<GUID>' ORDER BY timestamp ASC;

-- List all sessions
SELECT session_id, MIN(timestamp) as started, COUNT(*) as events,
       SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors
FROM logs WHERE session_id IS NOT NULL
GROUP BY session_id ORDER BY started DESC;

-- Operation performance stats
SELECT operation, COUNT(*) as count, ROUND(AVG(duration_ms)) as avg_ms, MAX(duration_ms) as max_ms
FROM logs WHERE duration_ms IS NOT NULL GROUP BY operation ORDER BY avg_ms DESC;
```

## When to Use

- **Debugging failures**: `--errors` to see what went wrong
- **Performance**: `--slow` or `--stats` to find bottlenecks
- **Session review**: `--session <GUID>` to replay a worktree session
- **Audit**: `--repo <name>` to see all operations on a project
