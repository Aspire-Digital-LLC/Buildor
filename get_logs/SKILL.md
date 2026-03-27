# /get_logs — Retrieve and Read Application Logs

ProductaFlows stores structured application logs in an SQLite database at `~/.productaflows/logs.db`.

## Log Schema

Each log entry contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Auto-incrementing primary key |
| `timestamp` | text (ISO 8601) | When the event occurred |
| `end_timestamp` | text (ISO 8601) | When the event finished (for timed operations) |
| `duration_ms` | integer | Duration in milliseconds (end - start) |
| `repo` | text | Repository name this event relates to (null for global events) |
| `function_area` | text | Which app area: `source-control`, `code-viewer`, `claude-chat`, `flow-builder`, `worktree`, `project`, `system` |
| `level` | text | Severity: `debug`, `info`, `warn`, `error` |
| `operation` | text | Specific operation: `commit`, `push`, `pull`, `merge`, `stage`, `session-start`, `flow-execute`, etc. |
| `message` | text | Human-readable description |
| `details` | text | Extended details, stack traces, or structured JSON data |

## How to Query Logs

### Via SQLite directly

```bash
sqlite3 ~/.productaflows/logs.db
```

Useful queries:

```sql
-- Recent errors
SELECT timestamp, repo, function_area, operation, message
FROM logs WHERE level = 'error' ORDER BY timestamp DESC LIMIT 20;

-- Slowest operations
SELECT timestamp, repo, operation, message, duration_ms
FROM logs WHERE duration_ms IS NOT NULL ORDER BY duration_ms DESC LIMIT 20;

-- All git operations for a specific repo
SELECT timestamp, operation, message, duration_ms
FROM logs WHERE repo = 'my-project' AND function_area = 'source-control'
ORDER BY timestamp DESC;

-- Average duration by operation type
SELECT operation, COUNT(*) as count, AVG(duration_ms) as avg_ms, MAX(duration_ms) as max_ms
FROM logs WHERE duration_ms IS NOT NULL
GROUP BY operation ORDER BY avg_ms DESC;

-- Errors in the last hour
SELECT * FROM logs
WHERE level = 'error' AND timestamp > datetime('now', '-1 hour')
ORDER BY timestamp DESC;

-- Process timeline for a session (useful for understanding what happened)
SELECT timestamp, function_area, operation, message, duration_ms
FROM logs WHERE timestamp BETWEEN '2024-01-01' AND '2024-01-02'
ORDER BY timestamp ASC;
```

### Via Tauri IPC (from the app)

```typescript
import { getLogs } from '@/utils/commands/logging';

// Get recent logs
const logs = await getLogs({ limit: 50 });

// Filter by repo and function
const gitLogs = await getLogs({
  repo: 'my-project',
  functionArea: 'source-control',
  limit: 100
});

// Get only errors
const errors = await getLogs({ level: 'error' });
```

## Extracting Process Times

Log entries with `duration_ms` set represent timed operations. To analyze performance:

1. **Single operation duration**: Look at `duration_ms` directly
2. **Workflow duration**: Query entries between two timestamps and sum `duration_ms`
3. **Average performance**: Use SQL `AVG(duration_ms)` grouped by `operation`
4. **Bottleneck detection**: Sort by `duration_ms DESC` to find the slowest operations

## Log Levels

- `debug`: Verbose internal state (only when troubleshooting)
- `info`: Normal operations (commits, pushes, file opens)
- `warn`: Recoverable issues (network timeout, retry succeeded)
- `error`: Failures (command failed, file not found, git conflict)

## When Logs Are Written

- Every git operation (commit, push, pull, merge, stage, etc.)
- Claude Code session start/stop
- Flow execution (each stage start/complete)
- Project add/remove
- Worktree create/destroy
- Any error from any operation
