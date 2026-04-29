export interface GeneratePayload {
  model: string;
  contents: unknown;
  generationConfig?: Record<string, unknown>;
  systemInstruction?: { parts: { text: string }[] };
}

export async function callGeminiProxy(
  workerBase: string,
  apiKey: string,
  payload: GeneratePayload,
): Promise<unknown> {
  const base = workerBase.replace(/\/$/, "");
  const url = `${base}/generate`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const msg =
      typeof data === "object" && data && "error" in data
        ? JSON.stringify((data as { error: unknown }).error)
        : text || r.statusText;
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
