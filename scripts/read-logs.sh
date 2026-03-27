#!/usr/bin/env bash
# Buildor Log Reader CLI
# Usage: bash scripts/read-logs.sh [options]
#
# Options:
#   --errors          Show only error-level logs
#   --warnings        Show only warn-level logs
#   --info            Show only info-level logs (excludes debug)
#   --session <GUID>  Show all logs for a specific session
#   --repo <name>     Filter by repository (partial match)
#   --func <area>     Filter by function area (source-control, project, etc.)
#   --slow            Show slowest operations by duration
#   --stats           Show operation statistics (count, avg, max duration)
#   --sessions        List all sessions with summary
#   --last <N>        Show last N entries (default: 30)
#   --since <time>    Show logs since time (e.g., '1 hour', '30 minutes', '2 days')
#   --clear           Clear all logs (requires confirmation)
#   --help            Show this help

# Try OS-standard location first, fall back to legacy
if [ -f "$APPDATA/Buildor/logs.db" ]; then
  DB="$APPDATA/Buildor/logs.db"
elif [ -f "$HOME/Library/Application Support/Buildor/logs.db" ]; then
  DB="$HOME/Library/Application Support/Buildor/logs.db"
elif [ -f "${XDG_CONFIG_HOME:-$HOME/.config}/Buildor/logs.db" ]; then
  DB="${XDG_CONFIG_HOME:-$HOME/.config}/Buildor/logs.db"
elif [ -f "$APPDATA/ProductaFlows/logs.db" ]; then
  DB="$APPDATA/ProductaFlows/logs.db"
elif [ -f "$HOME/.buildor/logs.db" ]; then
  DB="$HOME/.buildor/logs.db"
elif [ -f "$HOME/.productaflows/logs.db" ]; then
  DB="$HOME/.productaflows/logs.db"
else
  echo "No log database found."
  echo "Searched: %APPDATA%/Buildor/, %APPDATA%/ProductaFlows/, ~/.config/Buildor/"
  echo "The database is created when Buildor first writes a log entry."
  exit 1
fi

echo "Using: $DB"

LIMIT=30
MODE="recent"
FILTER_LEVEL=""
FILTER_SESSION=""
FILTER_REPO=""
FILTER_FUNC=""
SINCE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --errors)    FILTER_LEVEL="error"; shift ;;
    --warnings)  FILTER_LEVEL="warn"; shift ;;
    --info)      FILTER_LEVEL="info"; shift ;;
    --session)   FILTER_SESSION="$2"; MODE="session"; shift 2 ;;
    --repo)      FILTER_REPO="$2"; shift 2 ;;
    --func)      FILTER_FUNC="$2"; shift 2 ;;
    --slow)      MODE="slow"; shift ;;
    --stats)     MODE="stats"; shift ;;
    --sessions)  MODE="sessions"; shift ;;
    --last)      LIMIT="$2"; shift 2 ;;
    --since)     SINCE="$2"; shift 2 ;;
    --clear)     MODE="clear"; shift ;;
    --help|-h)   head -18 "$0" | tail -17; exit 0 ;;
    *)           echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Build WHERE clause
WHERE="WHERE 1=1"
[ -n "$FILTER_LEVEL" ] && WHERE="$WHERE AND level = '$FILTER_LEVEL'"
[ -n "$FILTER_SESSION" ] && WHERE="$WHERE AND session_id = '$FILTER_SESSION'"
[ -n "$FILTER_REPO" ] && WHERE="$WHERE AND repo LIKE '%$FILTER_REPO%'"
[ -n "$FILTER_FUNC" ] && WHERE="$WHERE AND function_area = '$FILTER_FUNC'"
[ -n "$SINCE" ] && WHERE="$WHERE AND timestamp > datetime('now', '-$SINCE')"

case $MODE in
  recent)
    sqlite3 -header -column "$DB" \
      "SELECT datetime(timestamp, 'localtime') as time, level, function_area as func, operation, message, duration_ms as ms
       FROM logs $WHERE AND level != 'debug'
       ORDER BY timestamp DESC LIMIT $LIMIT;"
    ;;
  session)
    echo "=== Session: $FILTER_SESSION ==="
    sqlite3 -header -column "$DB" \
      "SELECT datetime(timestamp, 'localtime') as time, level, function_area as func, operation, message, duration_ms as ms
       FROM logs WHERE session_id = '$FILTER_SESSION'
       ORDER BY timestamp ASC;"
    ;;
  slow)
    sqlite3 -header -column "$DB" \
      "SELECT datetime(timestamp, 'localtime') as time, repo, operation, message, duration_ms as ms
       FROM logs $WHERE AND duration_ms IS NOT NULL
       ORDER BY duration_ms DESC LIMIT $LIMIT;"
    ;;
  stats)
    sqlite3 -header -column "$DB" \
      "SELECT operation, COUNT(*) as count,
              ROUND(AVG(duration_ms)) as avg_ms,
              MAX(duration_ms) as max_ms,
              MIN(duration_ms) as min_ms
       FROM logs $WHERE AND duration_ms IS NOT NULL
       GROUP BY operation ORDER BY avg_ms DESC;"
    ;;
  sessions)
    sqlite3 -header -column "$DB" \
      "SELECT session_id,
              datetime(MIN(timestamp), 'localtime') as started,
              COUNT(*) as events,
              SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
              ROUND(SUM(duration_ms)/1000.0, 1) as total_sec
       FROM logs WHERE session_id IS NOT NULL
       GROUP BY session_id ORDER BY started DESC LIMIT $LIMIT;"
    ;;
  clear)
    echo "This will permanently delete all log entries."
    read -p "Type 'clear all logs' to confirm: " confirm
    if [ "$confirm" = "clear all logs" ]; then
      sqlite3 "$DB" "DELETE FROM logs;"
      echo "All logs cleared."
    else
      echo "Cancelled."
    fi
    ;;
esac
