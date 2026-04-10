import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteParams } from "../router.js";
import { readBody, json } from "../router.js";
import { getSession } from "../sessions.js";
import { sendMessage } from "../sdk-runner.js";

export async function handleSendMessage(req: IncomingMessage, res: ServerResponse, params: RouteParams): Promise<void> {
  console.log(`[message] POST /sessions/${params.id}/message received`);
  const session = getSession(params.id);
  if (!session) {
    console.log(`[message] 404 — session not found: ${params.id}`);
    json(res, 404, { error: "Session not found" });
    return;
  }

  if (session.turnActive) {
    const staleSec = (Date.now() - session.turnActiveSince) / 1000;
    if (staleSec > 90) {
      // Deadlock recovery: turnActive has been stuck for >90s — force reset
      console.warn(`[message] DEADLOCK RECOVERY — turnActive stuck for ${staleSec.toFixed(0)}s on session=${params.id}, forcing reset`);
      session.turnActive = false;
    } else {
      console.log(`[message] 409 — turnActive is true for ${staleSec.toFixed(0)}s on session=${params.id}`);
      json(res, 409, { error: "Turn already active", staleSeconds: Math.round(staleSec) });
      return;
    }
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

  console.log(`[message] received for session=${params.id} text="${(body.text as string).slice(0, 80)}"`);
  sendMessage(session, body.text as string);
  json(res, 202, { status: "accepted" });
}
