import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteParams } from "../router.js";
import { readBody, json } from "../router.js";
import { getSession } from "../sessions.js";
import { sendMessage } from "../sdk-runner.js";

export async function handleSendMessage(req: IncomingMessage, res: ServerResponse, params: RouteParams): Promise<void> {
  const session = getSession(params.id);
  if (!session) {
    json(res, 404, { error: "Session not found" });
    return;
  }

  if (session.turnActive) {
    json(res, 409, { error: "Turn already active" });
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

  if (!body.text || typeof body.text !== "string") {
    json(res, 400, { error: "text is required and must be a string" });
    return;
  }

  sendMessage(session, body.text as string);
  json(res, 202, { status: "accepted" });
}
