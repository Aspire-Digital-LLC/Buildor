export interface ClaudeSession {
  id: string;
  workingDir: string;
  status: 'active' | 'idle' | 'terminated';
}

export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  output?: string;
}

export type DisplayMode = 'conversation' | 'verbose';
