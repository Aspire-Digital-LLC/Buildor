import { randomUUID } from "node:crypto";
import type {
  HookInput,
  HookJSONOutput,
  PreToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import type { ManagedSession, PermissionDecision } from "./types.js";
import { buildPermissionRequest } from "./wire-format.js";
import { sendSSE } from "./session-stream.js";

// Read-only tools that readonly-auto mode auto-approves
const READONLY_TOOLS = new Set(["Read", "Grep", "Glob"]);

const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Convenience: build an allow result for PreToolUse hooks. */
function allowResult(reason?: string): HookJSONOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse" as const,
      permissionDecision: "allow" as const,
      ...(reason ? { permissionDecisionReason: reason } : {}),
    },
  };
}

/** Convenience: build a deny result for PreToolUse hooks. */
function denyResult(reason?: string): HookJSONOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse" as const,
      permissionDecision: "deny" as const,
      ...(reason ? { permissionDecisionReason: reason } : {}),
    },
  };
}

/**
 * Create a PreToolUse hook callback for the SDK based on session permission mode.
 *
 * This fires FIRST in the permission chain — before Claude Code's built-in
 * permission system (allow lists in .claude/settings.local.json). This ensures
 * our permission UI and operation pool scheduler are never bypassed.
 *
 * - 'auto'          → approve everything
 * - 'readonly-auto' → approve Read/Grep/Glob, prompt for the rest
 * - 'hook'          → always prompt via SSE and wait for frontend response
 */
export function createPermissionHook(
  session: ManagedSession,
): (input: HookInput, toolUseId: string | undefined, options: { signal: AbortSignal }) => Promise<HookJSONOutput> {
  return async (
    input: HookInput,
    _toolUseId: string | undefined,
    _options: { signal: AbortSignal },
  ): Promise<HookJSONOutput> => {
    // Only handle PreToolUse events
    if (input.hook_event_name !== "PreToolUse") {
      return { continue: true };
    }

    const ptInput = input as PreToolUseHookInput;
    const toolName = ptInput.tool_name;
    const toolInput = ptInput.tool_input;
    const toolUseId = ptInput.tool_use_id;

    // Auto mode: approve everything
    if (session.permissionMode === "auto") {
      return allowResult("auto mode");
    }

    // Readonly-auto mode: approve read-only tools, prompt for the rest
    if (session.permissionMode === "readonly-auto" && READONLY_TOOLS.has(toolName)) {
      return allowResult("readonly-auto: read-only tool");
    }

    // Check alwaysAllow list before prompting
    if (session.allowedTools.includes(toolName)) {
      return allowResult("tool in allowedTools list");
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
    const approved = await new Promise<boolean>((resolve) => {
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

    return approved ? allowResult() : denyResult("user denied");
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
