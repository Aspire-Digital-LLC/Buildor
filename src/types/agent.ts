// --- Agent Health States ---

export type AgentHealthState =
  | 'healthy'
  | 'idle'
  | 'stalling'
  | 'looping'
  | 'erroring'
  | 'distressed';

// --- Agent Return Mode ---

export type AgentReturnMode = 'summary' | 'file' | 'both';

// --- Agent Source ---

export type AgentSource = 'buildor' | 'native';

// --- Agent Status ---

export type AgentStatus = 'running' | 'completed' | 'failed';

// --- Agent Pool Entry ---

export interface AgentPoolEntry {
  sessionId: string;
  name: string;
  parentSessionId: string | null;
  returnTo: string | null;            // session ID or 'main-chat'
  sourceSkill: string | null;
  agentSource: AgentSource;
  status: AgentStatus;
  healthState: AgentHealthState;
  startedAt: string;
  endedAt: string | null;
  model: string | null;
  returnMode: AgentReturnMode;
  outputPath: string | null;
}

// --- Agent Marker (parsed from stream output) ---

export type AgentMarkerAction = 'spawn_agent' | 'kill_agent' | 'extend_agent' | 'takeover_agent';

export interface AgentMarker {
  action: AgentMarkerAction;
  // spawn_agent fields
  type?: string;              // agent type: 'Explore' | 'Plan' | 'general-purpose'
  prompt?: string;
  name?: string;
  returnMode?: AgentReturnMode;
  outputPath?: string;
  dependencies?: string[];    // sessionIds or agent names that must complete first
  // kill_agent / extend_agent / takeover_agent fields
  agentId?: string;           // session ID or agent name
  mark?: 'completed' | 'failed';   // for kill_agent
  seconds?: number;           // for extend_agent
}

// --- Agent Spawn Request (sent to Rust backend) ---

export interface AgentSpawnRequest {
  workingDir: string;
  prompt: string;
  name: string;
  parentSessionId: string | null;
  returnTo: string | null;
  sourceSkill: string | null;
  model: string | null;
  returnMode: AgentReturnMode;
  outputPath: string | null;
}

// --- Mailbox Entry (persisted agent result) ---

export interface MailboxEntry {
  sessionId: string;
  name: string;
  parentSessionId: string | null;
  status: 'completed' | 'failed';
  startedAt: string;
  endedAt: string;
  output: string | null;
  outputPath: string | null;
  returnMode: AgentReturnMode;
  durationMs: number;
  model: string | null;
}
