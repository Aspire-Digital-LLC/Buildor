import { randomUUID } from "node:crypto";
import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { ManagedSession, PermissionDecision } from "./types.js";
import { buildPermissionRequest } from "./wire-format.js";
import { sendSSE } from "./session-stream.js";

const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a canUseTool handler for the SDK query() options.
 *
 * Claude Code's built-in permission system (settings.local.json allow lists)
 * handles auto-approvals. This callback is only reached for tools that are
 * NOT in the allow list. It emits an SSE event so the frontend can show
 * a permission card, then blocks until the user responds via POST /permission.
 */
export function createCanUseToolHandler(session: ManagedSession): CanUseTool {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options,
  ): Promise<PermissionResult> => {
    const requestId = randomUUID();
    const toolUseId = options.toolUseID;

    // Emit permission request to frontend via SSE
    const ssePayload = buildPermissionRequest(
      requestId,
      toolName,
      input,
      toolUseId,
    );
    sendSSE(session, "claude-output", ssePayload);

    // Block until the frontend responds or timeout
    const decision = await new Promise<PermissionDecision>((resolve) => {
      const timeout = setTimeout(() => {
        session.pendingPermissions.delete(requestId);
        resolve({ approved: false }); // Timeout → deny
      }, PERMISSION_TIMEOUT_MS);

      session.pendingPermissions.set(requestId, {
        toolName,
        resolve: (d: PermissionDecision) => {
          clearTimeout(timeout);
          session.pendingPermissions.delete(requestId);
          resolve(d);
        },
        timeout,
      });
    });

    if (decision.approved) {
      return {
        behavior: "allow" as const,
        updatedPermissions: decision.alwaysAllow ? options.suggestions : undefined,
      };
    }
    return {
      behavior: "deny" as const,
      message: "User denied permission",
    };
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
  pending.resolve(decision);
  return true;
}
