/**
 * BYOK LLM proxy: browser sends Authorization: Bearer <user API key for that provider>.
 * Routes: Google Gemini | DeepSeek | Groq (OpenAI-compatible chat completions).
 * Never log API keys.
 */

export interface Env {
  ALLOWED_ORIGINS?: string;
}

const MAX_BODY_BYTES = 18 * 1024 * 1024;

const UPSTREAM = {
  gemini: (model: string, apiKey: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
  deepseek: () => "https://api.deepseek.com/chat/completions",
  groq: () => "https://api.groq.com/openai/v1/chat/completions",
} as const;

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

function sanitizeGeminiModel(model: unknown): string {
  const s = String(model || "gemini-2.0-flash");
  if (!/^[a-zA-Z0-9._-]+$/.test(s)) return "gemini-2.0-flash";
  return s;
}

function sanitizeChatModel(model: unknown): string {
  const s = String(model || "deepseek-chat");
  if (!/^[a-zA-Z0-9._:-]+$/.test(s)) return "deepseek-chat";
  return s;
}

function inferProvider(body: Record<string, unknown>): "gemini" | "deepseek" | "groq" {
  const p = String(body.provider || "").toLowerCase();
  if (p === "deepseek") return "deepseek";
  if (p === "groq") return "groq";
  if (p === "gemini") return "gemini";
  if (Array.isArray(body.contents)) return "gemini";
  return "gemini";
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
          service: "psychedu-llm-proxy",
          usage:
            "POST /generate — body: { provider: gemini|deepseek|groq, ... } + Authorization: Bearer <that provider's API key>",
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
      return new Response(
        JSON.stringify({
          error: "Missing Authorization: Bearer <API key for the selected provider>",
        }),
        { status: 401, headers: h },
      );
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

    const provider = inferProvider(body);
    const h = cors(origin, allowed);
    const ctJson = "application/json";

    if (provider === "gemini") {
      const model = sanitizeGeminiModel(body.model);
      const contents = body.contents;
      if (!Array.isArray(contents)) {
        h.set("Content-Type", ctJson);
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

      const gUrl = UPSTREAM.gemini(model, apiKey);
      const gr = await fetch(gUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upstreamBody),
      });
      h.set("Content-Type", gr.headers.get("Content-Type") || ctJson);
      return new Response(gr.body, { status: gr.status, headers: h });
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      h.set("Content-Type", ctJson);
      return new Response(JSON.stringify({ error: "messages must be a non-empty array" }), {
        status: 400,
        headers: h,
      });
    }

    const model = sanitizeChatModel(body.model);
    const upstreamUrl =
      provider === "groq" ? UPSTREAM.groq() : UPSTREAM.deepseek();

    const payload: Record<string, unknown> = {
      model,
      messages,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.35,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 8192,
      stream: false,
    };

    const gr = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    h.set("Content-Type", gr.headers.get("Content-Type") || ctJson);
    return new Response(gr.body, { status: gr.status, headers: h });
  },
};
