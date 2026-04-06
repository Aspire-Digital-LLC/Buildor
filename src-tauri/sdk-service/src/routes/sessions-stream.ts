import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteParams } from "../router.js";
import { json } from "../router.js";
import { getSession } from "../sessions.js";
import { attachSSEClient } from "../session-stream.js";

export function handleSessionStream(_req: IncomingMessage, res: ServerResponse, params: RouteParams): void {
  const session = getSession(params.id);
  if (!session) {
    json(res, 404, { error: "Session not found" });
    return;
  }
  attachSSEClient(session, res);
}
