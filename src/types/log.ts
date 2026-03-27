export interface LogEntry {
  id: number | null;
  sessionId: string | null;
  timestamp: string;
  endTimestamp: string | null;
  durationMs: number | null;
  repo: string | null;
  functionArea: string;
  level: string;
  operation: string;
  message: string;
  details: string | null;
}
