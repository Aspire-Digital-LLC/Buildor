import { createServer } from "node:http";
import { Router } from "./router.js";
import { destroyAllSessions } from "./sessions.js";
import { handleHealth } from "./routes/health.js";
import { handleCreateSession, handleListSessions, handleDeleteSession } from "./routes/sessions-crud.js";
import { handleSessionStream } from "./routes/sessions-stream.js";
import { handleSendMessage } from "./routes/sessions-message.js";
import { handlePermission } from "./routes/sessions-permission.js";
import { handleInterrupt } from "./routes/sessions-interrupt.js";
import { handleSetModel } from "./routes/sessions-model.js";

const PORT = parseInt(process.env.BUILDOR_SDK_PORT ?? "3456", 10);

const router = new Router();

router.add("GET", "/health", handleHealth);
router.add("POST", "/sessions", handleCreateSession);
router.add("GET", "/sessions", handleListSessions);
router.add("DELETE", "/sessions/:id", handleDeleteSession);
router.add("GET", "/sessions/:id/stream", handleSessionStream);
router.add("POST", "/sessions/:id/message", handleSendMessage);
router.add("POST", "/sessions/:id/permission", handlePermission);
router.add("POST", "/sessions/:id/interrupt", handleInterrupt);
router.add("POST", "/sessions/:id/model", handleSetModel);

const server = createServer((req, res) => {
  void router.handle(req, res);
});

server.listen(PORT, () => {
  console.log(`[sdk-service] listening on http://localhost:${PORT}`);
  console.log("  GET  /health");
  console.log("  POST /sessions");
  console.log("  GET  /sessions");
  console.log("  DEL  /sessions/:id");
  console.log("  GET  /sessions/:id/stream");
  console.log("  POST /sessions/:id/message");
  console.log("  POST /sessions/:id/permission");
  console.log("  POST /sessions/:id/interrupt");
  console.log("  POST /sessions/:id/model");
});

function shutdown(): void {
  console.log("[sdk-service] shutting down...");
  destroyAllSessions();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
