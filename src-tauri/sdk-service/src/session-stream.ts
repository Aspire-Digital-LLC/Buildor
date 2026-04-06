import type { ServerResponse } from "node:http";
import type { ManagedSession } from "./types.js";

const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Attach an SSE client to a session. Sets up headers, heartbeat, and cleanup.
 */
export function attachSSEClient(session: ManagedSession, res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  session.sseClients.add(res);

  // 15s heartbeat to keep the connection alive
  const heartbeat = setInterval(() => {
    if (!res.destroyed) {
      res.write(":heartbeat\n\n");
    }
  }, HEARTBEAT_INTERVAL_MS);

  res.on("close", () => {
    clearInterval(heartbeat);
    session.sseClients.delete(res);
  });
}

/**
 * Broadcast an SSE event to all connected clients on the session.
 */
export function sendSSE(
  session: ManagedSession,
  eventType: string,
  data: string,
): void {
  const frame = `event: ${eventType}\ndata: ${data}\n\n`;
  for (const client of session.sseClients) {
    if (!client.destroyed) {
      client.write(frame);
    }
  }
}

/**
 * Send a claude-exit event, end all SSE connections, and clear the set.
 */
export function closeSSEClients(session: ManagedSession): void {
  sendSSE(session, "claude-exit", JSON.stringify({ type: "exit" }));

  for (const client of session.sseClients) {
    if (!client.destroyed) {
      client.end();
    }
  }
  session.sseClients.clear();
}
