import { randomUUID } from "node:crypto";
import type { CreateSessionRequest, ManagedSession } from "./types.js";
import { AsyncMessageQueue } from "./types.js";
import { startSession, stopSession } from "./sdk-runner.js";

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

const sessions = new Map<string, ManagedSession>();

/**
 * Create a new managed session, add it to the store, and start the SDK loop.
 */
export function createSession(req: CreateSessionRequest): ManagedSession {
  const id = randomUUID();

  const session: ManagedSession = {
    id,
    pid: null,
    cwd: req.cwd,
    model: req.model ?? "claude-sonnet-4-20250514",
    systemPrompt: req.systemPrompt,
    permissionMode: req.permissionMode ?? "default",
    allowedTools: req.allowedTools ?? [],
    disallowedTools: req.disallowedTools ?? [],
    settingSources: req.settingSources ?? [],
    startedAt: Date.now(),
    abortController: new AbortController(),
    sseClients: new Set(),
    pendingPermissions: new Map(),
    isRunning: false,
    turnActive: false,
    turnActiveSince: 0,
    messageQueue: new AsyncMessageQueue(),
    activeQuery: null,
  };

  sessions.set(id, session);

  // Fire-and-forget — startSession runs the pump in the background
  startSession(session);

  return session;
}

/**
 * Look up a session by ID. Returns undefined if not found.
 */
export function getSession(id: string): ManagedSession | undefined {
  return sessions.get(id);
}

/**
 * Return all active sessions.
 */
export function listSessions(): ManagedSession[] {
  return Array.from(sessions.values());
}

/**
 * Stop and fully tear down a single session.
 */
export function destroySession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;

  stopSession(session);
  sessions.delete(id);
  return true;
}

/**
 * Tear down every session — used for graceful shutdown.
 */
export function destroyAllSessions(): void {
  for (const [id] of sessions) {
    destroySession(id);
  }
}
