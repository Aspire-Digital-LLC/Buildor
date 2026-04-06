// ---------------------------------------------------------------------------
// Wire-format helpers — pure functions, zero dependencies.
//
// SDK message objects ARE the wire format. JSON.stringify(sdkMessage) produces
// the exact NDJSON that Claude CLI emits.
// ---------------------------------------------------------------------------

/**
 * Convert an SDK message object to an NDJSON line.
 * Since the SDK wire format is already JSON, this is just JSON.stringify.
 */
export function sdkMessageToNDJSON(message: unknown): string {
  return JSON.stringify(message);
}

/**
 * Build a control_request wire event for permission prompts.
 * The SDK handles permissions via callback (not stream), so we synthesize
 * this event to send over SSE so the frontend can display a permission dialog.
 */
export function buildPermissionRequest(
  requestId: string,
  toolName: string,
  toolInput: unknown,
  toolUseId: string,
  _description?: string,
): string {
  return JSON.stringify({
    type: "control_request",
    request_id: requestId,
    request: {
      subtype: "can_use_tool",
      tool_name: toolName,
      tool_use_id: toolUseId,
      input: toolInput,
    },
  });
}

/**
 * Build an error wire event.
 */
export function buildErrorEvent(message: string): string {
  return JSON.stringify({
    type: "error",
    error: { message },
  });
}
