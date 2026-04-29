/**
 * BYOK LLM proxy: browser sends Authorization: Bearer <user API key for that provider>.
 * Routes: Google Gemini | DeepSeek | Groq (OpenAI-compatible chat completions).
 * Gemini large files: resumable Files API upload (chunked via /gemini/file-upload/*).
 * Never log API keys.
 */

export interface Env {
  ALLOWED_ORIGINS?: string;
}

const MAX_GENERATE_JSON_BYTES = 40 * 1024 * 1024;
const MAX_CHUNK_BYTES = 32 * 1024 * 1024;
const GEMINI_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

const GEMINI_UPLOAD_START =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";

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
  h.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Gemini-Upload-Url, X-Goog-Upload-Offset, X-Goog-Upload-Command",
  );
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

function requireBearer(request: Request): string | null {
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const k = m?.[1]?.trim();
  return k || null;
}

function isAllowedGeminiUploadUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return false;
    return url.hostname === "generativelanguage.googleapis.com";
  } catch {
    return false;
  }
}

/** Returns full resource name `files/<id>` for polling. */
function sanitizeFileResourceName(name: string): string | null {
  const n = name.trim();
  if (n.length < 8 || n.length > 512) return null;
  if (!n.startsWith("files/")) return null;
  const id = n.slice("files/".length);
  if (!id || !/^[a-zA-Z0-9_.-]+$/.test(id)) return null;
  return n;
}

function fileIdFromResourceName(name: string): string | null {
  const n = sanitizeFileResourceName(name);
  if (!n) return null;
  return n.slice("files/".length);
}

async function geminiStartUpload(
  apiKey: string,
  byteSize: number,
  mimeType: string,
  displayName: string,
): Promise<string> {
  const url = `${GEMINI_UPLOAD_START}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(byteSize),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`start ${res.status}: ${text}`);
  }
  const uploadUrl =
    res.headers.get("x-goog-upload-url")?.trim() ||
    res.headers.get("X-Goog-Upload-URL")?.trim() ||
    "";
  if (!uploadUrl) {
    throw new Error(`missing X-Goog-Upload-Url (status ${res.status})`);
  }
  if (!isAllowedGeminiUploadUrl(uploadUrl)) {
    throw new Error("upload URL host not allowed");
  }
  return uploadUrl;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowed = parseAllowed(env);
    const origin = request.headers.get("Origin");
    const hBase = cors(origin, allowed);
    const ctJson = "application/json";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: hBase });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "GET" && path === "/") {
      const h = cors(origin, allowed);
      h.set("Content-Type", ctJson);
      return new Response(
        JSON.stringify({
          ok: true,
          service: "psychedu-llm-proxy",
          usage:
            "POST /generate — JSON body + Authorization: Bearer <key>. Large Gemini files: POST /gemini/file-upload/start then POST /gemini/file-upload/part (chunked); GET /gemini/file?name=files/...",
        }),
        { headers: h },
      );
    }

    if (!isOriginAllowed(origin, allowed)) {
      return new Response(
        JSON.stringify({ error: "Origin not allowed", origin }),
        { status: 403, headers: { "Content-Type": ctJson } },
      );
    }

    /** ---------- GET /gemini/file ---------- */
    if (request.method === "GET" && path === "/gemini/file") {
      const apiKey = requireBearer(request);
      if (!apiKey) {
        const h = cors(origin, allowed);
        h.set("Content-Type", ctJson);
        return new Response(
          JSON.stringify({ error: "Missing Authorization: Bearer <Gemini API key>" }),
          { status: 401, headers: h },
        );
      }
      const rawName = url.searchParams.get("name") || "";
      const name = sanitizeFileResourceName(rawName);
      const fileId = name ? fileIdFromResourceName(name) : null;
      if (!name || !fileId) {
        const h = cors(origin, allowed);
        h.set("Content-Type", ctJson);
        return new Response(JSON.stringify({ error: "Invalid name query" }), {
          status: 400,
          headers: h,
        });
      }
      const gUrl = `https://generativelanguage.googleapis.com/v1beta/files/${encodeURIComponent(fileId)}?key=${encodeURIComponent(apiKey)}`;
      const gr = await fetch(gUrl, { method: "GET" });
      const h = cors(origin, allowed);
      h.set("Content-Type", gr.headers.get("Content-Type") || ctJson);
      return new Response(gr.body, { status: gr.status, headers: h });
    }

    /** ---------- POST /gemini/file-upload/start ---------- */
    if (request.method === "POST" && path === "/gemini/file-upload/start") {
      const apiKey = requireBearer(request);
      if (!apiKey) {
        const h = cors(origin, allowed);
        h.set("Content-Type", ctJson);
        return new Response(
          JSON.stringify({ error: "Missing Authorization: Bearer <Gemini API key>" }),
          { status: 401, headers: h },
        );
      }
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        const h = cors(origin, allowed);
        h.set("Content-Type", ctJson);
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: h,
        });
      }
      const mimeType = String(body.mimeType || "").trim();
      const byteSize = Number(body.byteSize);
      const displayName = String(body.displayName || "upload").trim().slice(0, 512);
      if (!mimeType || !Number.isFinite(byteSize) || byteSize < 1 || byteSize > GEMINI_MAX_FILE_BYTES) {
        const h = cors(origin, allowed);
        h.set("Content-Type", ctJson);
        return new Response(JSON.stringify({ error: "Invalid mimeType or byteSize" }), {
          status: 400,
          headers: h,
        });
      }
      const h = cors(origin, allowed);
      h.set("Content-Type", ctJson);
      try {
        const uploadUrl = await geminiStartUpload(apiKey, byteSize, mimeType, displayName);
        return new Response(JSON.stringify({ ok: true, uploadUrl, byteSize }), { headers: h });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return new Response(JSON.stringify({ error: msg }), { status: 502, headers: h });
      }
    }

    /** ---------- POST /gemini/file-upload/part ---------- */
    if (request.method === "POST" && path === "/gemini/file-upload/part") {
      const apiKey = requireBearer(request);
      if (!apiKey) {
        const h = cors(origin, allowed);
        h.set("Content-Type", ctJson);
        return new Response(
          JSON.stringify({ error: "Missing Authorization: Bearer <Gemini API key>" }),
          { status: 401, headers: h },
        );
      }
      const uploadUrl = request.headers.get("X-Gemini-Upload-Url")?.trim() || "";
      if (!uploadUrl || !isAllowedGeminiUploadUrl(uploadUrl)) {
        const h = cors(origin, allowed);
        h.set("Content-Type", ctJson);
        return new Response(JSON.stringify({ error: "Invalid X-Gemini-Upload-Url" }), {
          status: 400,
          headers: h,
        });
      }
      const offsetRaw = request.headers.get("X-Goog-Upload-Offset");
      const offset = Number(offsetRaw);
      if (!Number.isFinite(offset) || offset < 0) {
        const h = cors(origin, allowed);
        h.set("Content-Type", ctJson);
        return new Response(JSON.stringify({ error: "Invalid X-Goog-Upload-Offset" }), {
          status: 400,
          headers: h,
        });
      }
      const command = request.headers.get("X-Goog-Upload-Command")?.trim() || "";
      if (command !== "upload" && command !== "upload, finalize") {
        const h = cors(origin, allowed);
        h.set("Content-Type", ctJson);
        return new Response(JSON.stringify({ error: "Invalid X-Goog-Upload-Command" }), {
          status: 400,
          headers: h,
        });
      }
      const len = Number(request.headers.get("Content-Length") || "0");
      if (!Number.isFinite(len) || len < 1 || len > MAX_CHUNK_BYTES) {
        const h = cors(origin, allowed);
        h.set("Content-Type", ctJson);
        return new Response(
          JSON.stringify({ error: `Chunk body must be 1..${MAX_CHUNK_BYTES} bytes` }),
          { status: 413, headers: h },
        );
      }
      if (!request.body) {
        const h = cors(origin, allowed);
        h.set("Content-Type", ctJson);
        return new Response(JSON.stringify({ error: "Missing body" }), {
          status: 400,
          headers: h,
        });
      }

      const gr = await fetch(uploadUrl, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Length": String(len),
          "X-Goog-Upload-Offset": String(offset),
          "X-Goog-Upload-Command": command,
        },
        body: request.body,
      });

      const h = cors(origin, allowed);
      h.set("Content-Type", gr.headers.get("Content-Type") || ctJson);
      return new Response(gr.body, { status: gr.status, headers: h });
    }

    /** ---------- POST /generate ---------- */
    if (path !== "/generate" || request.method !== "POST") {
      const h = cors(origin, allowed);
      return new Response("Not Found", { status: 404, headers: h });
    }

    const apiKey = requireBearer(request);
    if (!apiKey) {
      const h = cors(origin, allowed);
      h.set("Content-Type", ctJson);
      return new Response(
        JSON.stringify({
          error: "Missing Authorization: Bearer <API key for the selected provider>",
        }),
        { status: 401, headers: h },
      );
    }

    const len = Number(request.headers.get("Content-Length") || "0");
    if (len > MAX_GENERATE_JSON_BYTES) {
      const h = cors(origin, allowed);
      h.set("Content-Type", ctJson);
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
      h.set("Content-Type", ctJson);
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: h,
      });
    }

    const provider = inferProvider(body);
    const h = cors(origin, allowed);

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
    const upstreamUrl = provider === "groq" ? UPSTREAM.groq() : UPSTREAM.deepseek();

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
