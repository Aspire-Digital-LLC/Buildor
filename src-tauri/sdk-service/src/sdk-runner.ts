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

  // Only attach canUseTool for interactive sessions (permissionMode: "default").
  // For "dontAsk" sessions (agents), the SDK handles denials natively —
  // no callback needed, no settings.local.json pollution.
  const useInteractivePermissions = session.permissionMode === "default";
  console.log(`[sdk-runner] startSession: id=${session.id} permissionMode=${session.permissionMode} useInteractivePermissions=${useInteractivePermissions} allowedTools=${JSON.stringify(session.allowedTools)} settingSources=${JSON.stringify(session.settingSources)}`);

  const q = query({
    prompt: promptFromQueue(session),
    options: {
      abortController: session.abortController,
      cwd: session.cwd,
      model: session.model,
      systemPrompt: session.systemPrompt,
      permissionMode: session.permissionMode,
      allowedTools: session.allowedTools.length
        ? session.allowedTools
        : undefined,
      disallowedTools: session.disallowedTools.length
        ? session.disallowedTools
        : undefined,
      ...(session.settingSources.length > 0 && { settingSources: session.settingSources }),
      ...(useInteractivePermissions && { canUseTool: createCanUseToolHandler(session) }),
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

  // Store the active query so interrupt/setModel can use SDK control methods
  session.activeQuery = q;

  // Background pump — iterate SDK messages and send to SSE clients
  void (async () => {
    try {
      for await (const message of q) {
        const m = message as Record<string, unknown>;
        if (m.type === 'assistant') {
          const content = (m.message as Record<string, unknown>)?.content as Array<Record<string, unknown>> | undefined;
          const tools = content?.filter(b => b.type === 'tool_use').map(b => b.name) ?? [];
          if (tools.length) console.log(`[sdk-runner] tool_use: ${tools.join(', ')}`);
        } else if (m.type !== 'system' && m.type !== 'user') {
          console.log(`[sdk-runner] message type=${m.type}`);
        }
        sendSSE(session, "claude-output", sdkMessageToNDJSON(message));
        if (message && typeof message === "object" && "type" in message && (message as Record<string, unknown>).type === "result") {
          const turnDuration = session.turnActiveSince ? ((Date.now() - session.turnActiveSince) / 1000).toFixed(1) : '?';
          console.log(`[sdk-runner] result received for session=${session.id} — turn took ${turnDuration}s`);
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
      session.activeQuery = null;
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
  session.turnActiveSince = Date.now();
  session.messageQueue.push(text);
}

/**
 * Interrupt the current turn using the SDK's built-in interrupt() method.
 * This stops the current response but keeps the process alive with full
 * conversation history intact — no restart needed.
 */
export async function interruptSession(session: ManagedSession): Promise<void> {
  if (session.activeQuery) {
    await session.activeQuery.interrupt();
  }
  session.turnActive = false;
}

/**
 * Change the model mid-session via the SDK's setModel() control request.
 * Takes effect immediately for subsequent responses.
 */
export async function setModel(session: ManagedSession, model: string): Promise<void> {
  session.model = model;
  if (session.activeQuery) {
    await session.activeQuery.setModel(model);
  }
}

/**
 * Fully stop a session: abort, deny pending permissions, end the queue.
 */
export function stopSession(session: ManagedSession): void {
  // Use close() on the query if available — forcefully terminates the process
  if (session.activeQuery) {
    session.activeQuery.close();
    session.activeQuery = null;
  } else {
    session.abortController.abort();
  }
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
