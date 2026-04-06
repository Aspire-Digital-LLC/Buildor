import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteParams } from "../router.js";
import { readBody, json } from "../router.js";
import { createSession, listSessions, destroySession } from "../sessions.js";

export async function handleCreateSession(req: IncomingMessage, res: ServerResponse, _params: RouteParams): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  if (!body.cwd || typeof body.cwd !== "string") {
    json(res, 400, { error: "cwd is required and must be a string" });
    return;
  }

  const session = createSession({
    cwd: body.cwd as string,
    model: body.model as string | undefined,
    systemPrompt: body.systemPrompt as string | undefined,
    permissionMode: body.permissionMode as "hook" | "auto" | "readonly-auto" | undefined,
    allowedTools: body.allowedTools as string[] | undefined,
    disallowedTools: body.disallowedTools as string[] | undefined,
  });

  json(res, 201, { sessionId: session.id, pid: session.pid });
}

export function handleListSessions(_req: IncomingMessage, res: ServerResponse, _params: RouteParams): void {
  const sessions = listSessions().map((s) => ({
    id: s.id,
    pid: s.pid,
    cwd: s.cwd,
    model: s.model,
    permissionMode: s.permissionMode,
    isRunning: s.isRunning,
    startedAt: s.startedAt,
    sseClients: s.sseClients.size,
  }));
  json(res, 200, sessions);
}

export function handleDeleteSession(_req: IncomingMessage, res: ServerResponse, params: RouteParams): void {
  const destroyed = destroySession(params.id);
  if (destroyed) {
    json(res, 200, { success: true });
  } else {
    json(res, 404, { error: "Session not found" });
  }
}
