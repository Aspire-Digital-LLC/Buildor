---
description: Query and analyze ProductaFlows application logs from the SQLite database at ~/.productaflows/logs.db. Use to debug errors, analyze performance, review session timelines, and audit operations.
---

# /read-logs — Retrieve and Read ProductaFlows Application Logs

ProductaFlows stores structured application logs in an SQLite database at `~/.productaflows/logs.db`.

## Quick Start

```bash
# Read recent logs
sqlite3 -header -column ~/.productaflows/logs.db "SELECT timestamp, level, function_area, operation, message FROM logs ORDER BY timestamp DESC LIMIT 20;"

# Read errors only
sqlite3 -header -column ~/.productaflows/logs.db "SELECT timestamp, repo, operation, message, details FROM logs WHERE level = 'error' ORDER BY timestamp DESC LIMIT 20;"

# Read a specific session timeline (all correlated events)
sqlite3 -header -column ~/.productaflows/logs.db "SELECT timestamp, operation, message, duration_ms FROM logs WHERE session_id = '<GUID>' ORDER BY timestamp ASC;"

# Slowest operations
sqlite3 -header -column ~/.productaflows/logs.db "SELECT timestamp, repo, operation, message, duration_ms FROM logs WHERE duration_ms IS NOT NULL ORDER BY duration_ms DESC LIMIT 20;"
```

## Log Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Auto-incrementing primary key |
| `session_id` | text | GUID correlating all events from one worktree session — filter on this to see an entire workflow |
| `timestamp` | text (ISO 8601) | When the event occurred |
| `end_timestamp` | text (ISO 8601) | When the event finished (for timed operations) |
| `duration_ms` | integer | Duration in milliseconds (end - start). Use for performance analysis. |
| `repo` | text | Repository name/path this event relates to (null for global events) |
| `function_area` | text | App area — see list below |
| `level` | text | `debug`, `info`, `warn`, `error` |
| `operation` | text | Specific operation name (e.g., `commit`, `push`, `stage`, `session-start`) |
| `message` | text | Human-readable description |
| `details` | text | Extended details, stack traces, or structured JSON |

### Function Areas
- `source-control` — git operations (commit, push, pull, stage, merge, branch, etc.)
- `code-viewer` — file browsing, file reads
- `claude-chat` — Claude Code sessions
- `flow-builder` — flow execution, stage management
- `worktree` — worktree create/destroy/clean
- `project` — project add/remove/switch
- `system` — app lifecycle, config, updates

## Useful Queries

```sql
-- Recent errors
SELECT timestamp, repo, function_area, operation, message, details
FROM logs WHERE level = 'error' ORDER BY timestamp DESC LIMIT 20;

-- Average duration by operation type
SELECT operation, COUNT(*) as count,
       ROUND(AVG(duration_ms)) as avg_ms,
       MAX(duration_ms) as max_ms,
       MIN(duration_ms) as min_ms
FROM logs WHERE duration_ms IS NOT NULL
GROUP BY operation ORDER BY avg_ms DESC;

-- Full session timeline
SELECT timestamp, function_area, operation, message, duration_ms
FROM logs WHERE session_id = '<GUID>'
ORDER BY timestamp ASC;

-- List all sessions with summary
SELECT session_id,
       MIN(timestamp) as started,
       MAX(timestamp) as last_event,
       COUNT(*) as event_count,
       SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors
FROM logs WHERE session_id IS NOT NULL
GROUP BY session_id ORDER BY started DESC;

-- Errors in the last hour
SELECT * FROM logs
WHERE level = 'error' AND timestamp > datetime('now', '-1 hour')
ORDER BY timestamp DESC;

-- Git operations timeline (excludes debug-level polling)
SELECT timestamp, operation, message, duration_ms
FROM logs WHERE function_area = 'source-control' AND level != 'debug'
ORDER BY timestamp DESC LIMIT 50;
```

## When to Use This Skill

- **Debugging failures**: filter by `level = 'error'` to see what went wrong
- **Performance analysis**: sort by `duration_ms DESC` to find bottlenecks
- **Session review**: filter by `session_id` to replay what happened in a worktree session
- **Audit trail**: filter by `repo` and `function_area` to see all operations on a project
