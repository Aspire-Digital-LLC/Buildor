import { randomUUID } from "node:crypto";
import type { ManagedSession, PermissionDecision } from "./types.js";
import { buildPermissionRequest } from "./wire-format.js";
import { sendSSE } from "./session-stream.js";

// Read-only tools that readonly-auto mode auto-approves
const READONLY_TOOLS = new Set(["Read", "Grep", "Glob"]);

const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a canUseTool callback for the SDK based on session permission mode.
 *
 * - 'auto'          → approve everything
 * - 'readonly-auto' → approve Read/Grep/Glob, prompt for the rest
 * - 'hook'          → always prompt via SSE and wait for frontend response
 */
export function createPermissionHandler(
  session: ManagedSession,
): (toolName: string, toolInput: unknown, toolUseId: string) => Promise<boolean> {
  return async (
    toolName: string,
    toolInput: unknown,
    toolUseId: string,
  ): Promise<boolean> => {
    // Auto mode: approve everything
    if (session.permissionMode === "auto") {
      return true;
    }

    // Readonly-auto mode: approve read-only tools, prompt for the rest
    if (session.permissionMode === "readonly-auto" && READONLY_TOOLS.has(toolName)) {
      return true;
    }

    // Check alwaysAllow list before prompting
    if (session.allowedTools.includes(toolName)) {
      return true;
    }

    // Hook mode (or non-readonly tool in readonly-auto): emit SSE and block
    const requestId = randomUUID();
    const ssePayload = buildPermissionRequest(
      requestId,
      toolName,
      toolInput,
      toolUseId,
    );

    // Broadcast to all SSE clients
    sendSSE(session, "claude-output", ssePayload);

    // Block until the frontend responds or timeout
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        session.pendingPermissions.delete(requestId);
        resolve(false); // Timeout → deny
      }, PERMISSION_TIMEOUT_MS);

      session.pendingPermissions.set(requestId, {
        toolName,
        resolve: (decision: PermissionDecision) => {
          clearTimeout(timeout);
          session.pendingPermissions.delete(requestId);
          resolve(decision.approved);
        },
        timeout,
      });
    });
  };
}

/**
 * Resolve a pending permission request. Called by POST /permission route.
 * Returns false if requestId is unknown (safe no-op for destroyed sessions).
 */
export function resolvePermission(
  session: ManagedSession,
  requestId: string,
  decision: PermissionDecision,
): boolean {
  const pending = session.pendingPermissions.get(requestId);
  if (!pending) {
    return false;
  }
  if (decision.alwaysAllow && decision.approved && !session.allowedTools.includes(pending.toolName)) {
    session.allowedTools.push(pending.toolName);
  }
  pending.resolve(decision);
  return true;
}
