import { spawn } from "node:child_process";
import {
  query,
  type SDKUserMessage,
  type SpawnedProcess,
  type SpawnOptions,
  AbortError,
} from "@anthropic-ai/claude-agent-sdk";
import type { ManagedSession } from "./types.js";
import { AsyncMessageQueue } from "./types.js";
import { sdkMessageToNDJSON } from "./wire-format.js";
import { createCanUseToolHandler } from "./permission-gate.js";
import { sendSSE, closeSSEClients } from "./session-stream.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Async generator that maps queued strings into SDKUserMessage objects
 * consumable by the SDK query() call.
 */
async function* promptFromQueue(
  session: ManagedSession,
): AsyncGenerator<SDKUserMessage> {
  for await (const text of session.messageQueue) {
    yield {
      type: "user",
      message: { role: "user" as const, content: text },
      parent_tool_use_id: null,
    } as SDKUserMessage;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the SDK query loop for a managed session.
 * Spawns the Claude Code child process with windowsHide and pumps messages
 * from the SDK async generator out to SSE clients.
 */
export function startSession(session: ManagedSession): void {
  session.isRunning = true;

  const q = query({
    prompt: promptFromQueue(session),
    options: {
      abortController: session.abortController,
      cwd: session.cwd,
      model: session.model,
      systemPrompt: session.systemPrompt,
      permissionMode: "default",
      allowedTools: session.allowedTools.length
        ? session.allowedTools
        : undefined,
      disallowedTools: session.disallowedTools.length
        ? session.disallowedTools
        : undefined,
      canUseTool: createCanUseToolHandler(session),
      spawnClaudeCodeProcess: (opts: SpawnOptions): SpawnedProcess => {
        const child = spawn(opts.command, opts.args, {
          cwd: opts.cwd,
          env: opts.env as NodeJS.ProcessEnv,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          signal: opts.signal,
        });

        session.pid = child.pid ?? null;

        return {
          stdin: child.stdin!,
          stdout: child.stdout!,
          get killed() {
            return child.killed;
          },
          get exitCode() {
            return child.exitCode;
          },
          kill(signal: NodeJS.Signals) {
            return child.kill(signal);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          on(event: any, listener: any) {
            child.on(event, listener);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          once(event: any, listener: any) {
            child.once(event, listener);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          off(event: any, listener: any) {
            child.off(event, listener);
          },
        };
      },
    },
  });

  // Background pump — iterate SDK messages and send to SSE clients
  void (async () => {
    try {
      for await (const message of q) {
        sendSSE(session, "claude-output", sdkMessageToNDJSON(message));
        if (message && typeof message === "object" && "type" in message && (message as Record<string, unknown>).type === "result") {
          session.turnActive = false;
        }
      }
    } catch (err: unknown) {
      if (err instanceof AbortError) {
        // Graceful abort — not an error
      } else {
        const errMsg = err instanceof Error ? err.message : String(err);
        sendSSE(
          session,
          "claude-output",
          JSON.stringify({ type: "error", error: { message: errMsg } }),
        );
      }
    } finally {
      session.isRunning = false;
      session.turnActive = false;
      sendSSE(session, "claude-exit", JSON.stringify({ type: "exit" }));
    }
  })();
}

/**
 * Push a user message into the session's async queue.
 * The SDK query() loop will pick it up as the next turn.
 */
export function sendMessage(
  session: ManagedSession,
  text: string,
  _images?: string[],
): void {
  session.turnActive = true;
  session.messageQueue.push(text);
}

/**
 * Interrupt the current turn by aborting the session's AbortController,
 * then restart the query pump with a fresh controller so the session
 * remains usable for subsequent messages.
 */
export function interruptSession(session: ManagedSession): void {
  session.abortController.abort();
  session.turnActive = false;
  // End old queue so the old promptFromQueue generator finishes
  session.messageQueue.end();
  // Replace controller and queue, then restart the query pump
  session.abortController = new AbortController();
  session.messageQueue = new AsyncMessageQueue();
  startSession(session);
}

/**
 * Store a new model — takes effect on the next session start.
 */
export function setModel(session: ManagedSession, model: string): void {
  session.model = model;
}

/**
 * Fully stop a session: abort, deny pending permissions, end the queue.
 */
export function stopSession(session: ManagedSession): void {
  session.abortController.abort();
  session.messageQueue.end();

  // Deny all pending permission requests
  for (const [, pending] of session.pendingPermissions) {
    clearTimeout(pending.timeout);
    pending.resolve({ approved: false });
  }
  session.pendingPermissions.clear();

  session.isRunning = false;
  session.turnActive = false;
  closeSSEClients(session);
}
