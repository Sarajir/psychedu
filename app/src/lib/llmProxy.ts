/**
 * Unified POST /generate to Cloudflare worker.
 * Body must include `provider`: gemini | deepseek | groq
 */

export interface GeminiGenerateBody {
  provider: "gemini";
  model: string;
  contents: unknown;
  generationConfig?: Record<string, unknown>;
  systemInstruction?: { parts: { text: string }[] };
}

export interface ChatGenerateBody {
  provider: "deepseek" | "groq";
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
}

export type GenerateBody = GeminiGenerateBody | ChatGenerateBody;

export async function callGenerateProxy(
  workerBase: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const base = workerBase.replace(/\/$/, "");
  const url = `${base}/generate`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const errObj =
      typeof data === "object" && data !== null
        ? (data as { error?: unknown })
        : null;
    let msg = text || r.statusText;
    if (errObj?.error) {
      const e = errObj.error;
      msg = typeof e === "string" ? e : JSON.stringify(e);
    }
    throw new Error(msg || `HTTP ${r.status}`);
  }
  return data;
}

export function extractGeminiText(data: unknown): string {
  const d = data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const parts = d?.candidates?.[0]?.content?.parts;
  if (!parts?.length) return "";
  return parts.map((p) => p.text ?? "").join("");
}

export function extractGeminiBlockReason(data: unknown): string | null {
  const d = data as { promptFeedback?: { blockReason?: string } };
  const br = d?.promptFeedback?.blockReason;
  return br ? String(br) : null;
}

export function extractChatCompletionText(data: unknown): string {
  const d = data as {
    choices?: { message?: { content?: string | null } }[];
  };
  const c = d?.choices?.[0]?.message?.content;
  return c == null ? "" : String(c);
}
