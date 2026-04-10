import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteParams } from "../router.js";
import { json } from "../router.js";
import { getSession } from "../sessions.js";
import { interruptSession } from "../sdk-runner.js";

export async function handleInterrupt(_req: IncomingMessage, res: ServerResponse, params: RouteParams): Promise<void> {
  const session = getSession(params.id);
  if (!session) {
    json(res, 404, { error: "Session not found" });
    return;
  }

  await interruptSession(session);
  json(res, 200, { success: true });
}
