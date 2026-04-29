/**
 * BYOK proxy: browser sends Authorization: Bearer <Gemini API key>.
 * Body is forwarded to Google generateContent (minus the key).
 * Never log the API key.
 */

export interface Env {
  ALLOWED_ORIGINS?: string;
}

const MAX_BODY_BYTES = 18 * 1024 * 1024; // stay under Worker limits; client caps smaller

function parseAllowed(env: Env): string[] {
  const raw = env.ALLOWED_ORIGINS ?? "";
  const fromEnv = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "https://sarajir.github.io",
  ];
  return [...new Set([...fromEnv, ...defaults])];
}

function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.some((a) => origin === a || origin.startsWith(`${a}/`));
}

function cors(origin: string | null, allowed: string[]): Headers {
  const h = new Headers();
  if (origin && isOriginAllowed(origin, allowed)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

function sanitizeModel(model: unknown): string {
  const s = String(model || "gemini-2.0-flash");
  if (!/^[a-zA-Z0-9._-]+$/.test(s)) return "gemini-2.0-flash";
  return s;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowed = parseAllowed(env);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin, allowed) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "GET" && path === "/") {
      const h = cors(origin, allowed);
      h.set("Content-Type", "application/json");
      return new Response(
        JSON.stringify({
          ok: true,
          service: "psychedu-gemini-proxy",
          usage: "POST /generate with Authorization: Bearer <Gemini API key>",
        }),
        { headers: h },
      );
    }

    if (path !== "/generate" || request.method !== "POST") {
      const h = cors(origin, allowed);
      return new Response("Not Found", { status: 404, headers: h });
    }

    if (!isOriginAllowed(origin, allowed)) {
      return new Response(
        JSON.stringify({ error: "Origin not allowed", origin }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const auth = request.headers.get("Authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m?.[1]?.trim()) {
      const h = cors(origin, allowed);
      h.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ error: "Missing Authorization: Bearer <Gemini API key>" }), {
        status: 401,
        headers: h,
      });
    }
    const apiKey = m[1].trim();

    const len = Number(request.headers.get("Content-Length") || "0");
    if (len > MAX_BODY_BYTES) {
      const h = cors(origin, allowed);
      h.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413,
        headers: h,
      });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      const h = cors(origin, allowed);
      h.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: h,
      });
    }

    const model = sanitizeModel(body.model);
    const contents = body.contents;
    if (!Array.isArray(contents)) {
      const h = cors(origin, allowed);
      h.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ error: "contents must be an array" }), {
        status: 400,
        headers: h,
      });
    }

    const upstreamBody: Record<string, unknown> = { contents };
    if (body.generationConfig && typeof body.generationConfig === "object")
      upstreamBody.generationConfig = body.generationConfig;
    if (body.systemInstruction && typeof body.systemInstruction === "object")
      upstreamBody.systemInstruction = body.systemInstruction;

    const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const gr = await fetch(gUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upstreamBody),
    });

    const h = cors(origin, allowed);
    const ct = gr.headers.get("Content-Type") || "application/json";
    h.set("Content-Type", ct);
    return new Response(gr.body, { status: gr.status, headers: h });
  },
};
