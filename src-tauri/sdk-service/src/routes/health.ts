import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteParams } from "../router.js";
import { json } from "../router.js";
import { listSessions } from "../sessions.js";

const startTime = Date.now();

export function handleHealth(_req: IncomingMessage, res: ServerResponse, _params: RouteParams): void {
  const sessions = listSessions();
  const activeTurns = sessions.filter((s) => s.turnActive).length;

  json(res, 200, {
    status: "ok",
    sessions: sessions.length,
    activeTurns,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    sdkVersion: "0.0.1",
  });
}
