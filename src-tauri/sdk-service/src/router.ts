import type { IncomingMessage, ServerResponse } from "node:http";

export interface RouteParams {
  [key: string]: string;
}

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: RouteParams,
) => void | Promise<void>;

interface Route {
  method: string;
  regex: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

const MAX_BODY_SIZE = 1_048_576; // 1 MB

/**
 * Read the full request body as a string. Rejects with a 413 error if the
 * body exceeds MAX_BODY_SIZE.
 */
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds 1 MB limit");
  }
}

/**
 * Send a JSON response with the given status code.
 */
export function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...corsHeaders(),
  });
  res.end(payload);
}

export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const pattern = path.replace(/:([^/]+)/g, (_, name: string) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    const regex = new RegExp(`^${pattern}$`);
    this.routes.push({ method: method.toUpperCase(), regex, paramNames, handler });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.regex);
      if (!match) continue;

      const params: RouteParams = {};
      for (let i = 0; i < route.paramNames.length; i++) {
        params[route.paramNames[i]] = decodeURIComponent(match[i + 1]);
      }

      try {
        await route.handler(req, res, params);
      } catch (err: unknown) {
        if (!res.headersSent) {
          if (err instanceof BodyTooLargeError) {
            json(res, 413, { error: err.message });
          } else {
            const message = err instanceof Error ? err.message : String(err);
            json(res, 500, { error: message });
          }
        }
      }
      return;
    }

    // No match
    json(res, 404, { error: "Not found" });
  }
}
