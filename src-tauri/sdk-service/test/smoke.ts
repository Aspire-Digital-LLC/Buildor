import http from "node:http";

const BASE = process.env.BUILDOR_SDK_URL ?? "http://localhost:3456";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

async function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const url = new URL(path, BASE);
  const payload = body ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(text) as Record<string, unknown> });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: { raw: text } });
          }
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function connectSSE(path: string): Promise<{ events: string[]; close: () => void }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const req = http.get(url, (res) => {
      const events: string[] = [];
      res.setEncoding("utf-8");
      res.on("data", (chunk: string) => {
        events.push(chunk);
      });
      resolve({ events, close: () => { req.destroy(); } });
    });
    req.on("error", reject);
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function run(): Promise<void> {
  console.log("\n=== SDK Service Smoke Test ===\n");

  // 1. Health check
  console.log("1. GET /health");
  const health = await request("GET", "/health");
  assert(health.status === 200, "status 200");
  assert(health.data.status === "ok", "status ok");

  // 2. Create session
  console.log("2. POST /sessions");
  const create = await request("POST", "/sessions", {
    cwd: process.cwd(),
    permissionMode: "auto",
  });
  assert(create.status === 201, "status 201");
  assert(typeof create.data.sessionId === "string", "sessionId returned");
  const sessionId = create.data.sessionId as string;

  // 3. List sessions
  console.log("3. GET /sessions");
  const list = await request("GET", "/sessions");
  assert(list.status === 200, "status 200");
  assert(Array.isArray(list.data) || (list.data as unknown as unknown[]).length > 0, "sessions in list");

  // 4. Connect SSE
  console.log("4. GET /sessions/:id/stream");
  const sse = await connectSSE(`/sessions/${sessionId}/stream`);
  assert(true, "SSE connected");

  // 5. Send message
  console.log("5. POST /sessions/:id/message");
  const msg = await request("POST", `/sessions/${sessionId}/message`, {
    text: "what is 2+2? reply with just the number",
  });
  assert(msg.status === 202, "status 202 accepted");

  // 6. Wait for turn-completion (result message in claude-output events)
  console.log("6. Waiting for SSE events (30s timeout)...");
  const deadline = Date.now() + 30_000;
  let gotOutput = false;
  let gotResult = false;

  while (Date.now() < deadline && !gotResult) {
    await sleep(500);
    const combined = sse.events.join("");
    if (combined.includes("event: claude-output")) gotOutput = true;
    // A result-type message signals the turn is complete
    if (combined.includes('"type":"result"') || combined.includes('"type": "result"')) gotResult = true;
  }

  assert(gotOutput, "received claude-output event");
  assert(gotResult, "received result message (turn complete)");
  sse.close();

  // 7. Delete session (triggers claude-exit as the query loop ends)
  console.log("7. DELETE /sessions/:id");
  const del = await request("DELETE", `/sessions/${sessionId}`);
  assert(del.status === 200, "status 200");

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
