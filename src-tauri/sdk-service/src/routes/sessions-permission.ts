import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteParams } from "../router.js";
import { readBody, json } from "../router.js";
import { getSession } from "../sessions.js";
import { resolvePermission } from "../permission-gate.js";

export async function handlePermission(req: IncomingMessage, res: ServerResponse, params: RouteParams): Promise<void> {
  const session = getSession(params.id);
  if (!session) {
    json(res, 404, { error: "Session not found" });
    return;
  }

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  if (!body.requestId || typeof body.requestId !== "string") {
    json(res, 400, { error: "requestId is required and must be a string" });
    return;
  }

  const resolved = resolvePermission(session, body.requestId as string, {
    approved: Boolean(body.approved),
    alwaysAllow: body.alwaysAllow as boolean | undefined,
  });

  if (resolved) {
    json(res, 200, { success: true });
  } else {
    json(res, 404, { error: "Permission request not found" });
  }
}
