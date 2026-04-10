import type { ServerResponse } from "node:http";
import type { Query } from "@anthropic-ai/claude-agent-sdk";

// ---------------------------------------------------------------------------
// Permission types
// ---------------------------------------------------------------------------

export type PermissionMode = "default" | "dontAsk" | "acceptEdits" | "plan";

export interface PendingPermission {
  toolName: string;
  resolve: (decision: PermissionDecision) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface PermissionDecision {
  approved: boolean;
  alwaysAllow?: boolean;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface ManagedSession {
  id: string;
  pid: number | null;
  cwd: string;
  model: string;
  systemPrompt?: string;
  permissionMode: PermissionMode;
  allowedTools: string[];
  disallowedTools: string[];
  settingSources: string[];
  startedAt: number;
  abortController: AbortController;
  sseClients: Set<ServerResponse>;
  pendingPermissions: Map<string, PendingPermission>;
  isRunning: boolean;
  turnActive: boolean;
  /** Timestamp (Date.now()) when turnActive was set to true — used for deadlock detection */
  turnActiveSince: number;
  messageQueue: AsyncMessageQueue;
  /** The active SDK Query object — used for interrupt/setModel control requests */
  activeQuery: Query | null;
}

// ---------------------------------------------------------------------------
// Request / response shapes
// ---------------------------------------------------------------------------

export interface CreateSessionRequest {
  cwd: string;
  model?: string;
  systemPrompt?: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  settingSources?: string[];
}

export interface SendMessageRequest {
  text: string;
}

export interface PermissionResponse {
  requestId: string;
  approved: boolean;
  alwaysAllow?: boolean;
}

// ---------------------------------------------------------------------------
// AsyncMessageQueue
// ---------------------------------------------------------------------------

/**
 * Async iterable queue that feeds user messages into the SDK query() call.
 * push() enqueues a message; end() signals no more messages.
 * The async iterator yields messages as they arrive, blocking when empty.
 */
export class AsyncMessageQueue {
  private queue: string[] = [];
  private waiting: ((value: IteratorResult<string>) => void) | null = null;
  private done = false;

  push(message: string): void {
    if (this.done) return;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: message, done: false });
    } else {
      this.queue.push(message);
    }
  }

  end(): void {
    this.done = true;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: undefined as unknown as string, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: (): Promise<IteratorResult<string>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }
        if (this.done) {
          return Promise.resolve({
            value: undefined as unknown as string,
            done: true,
          });
        }
        return new Promise<IteratorResult<string>>((resolve) => {
          this.waiting = resolve;
        });
      },
    };
  }
}
