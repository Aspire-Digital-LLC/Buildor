import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteParams } from "../router.js";
import { readBody, json } from "../router.js";
import { getSession } from "../sessions.js";
import { setModel } from "../sdk-runner.js";

export async function handleSetModel(req: IncomingMessage, res: ServerResponse, params: RouteParams): Promise<void> {
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

  if (!body.model || typeof body.model !== "string") {
    json(res, 400, { error: "model is required and must be a string" });
    return;
  }

  const model = body.model as string;
  await setModel(session, model);
  json(res, 200, { model });
}
