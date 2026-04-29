import type { LlmProviderId } from "./llmProviders";

const KEY_WORKER = "psychedu.geminiWorkerUrl";
const LEGACY_GEMINI_KEY = "psychedu.geminiApiKey";

/** Add https:// if user pasted host only. */
export function withHttpsWorkerUrl(raw: string): string {
  const t = raw.trim().replace(/\/$/, "");
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/**
 * Resolve Worker base for fetch. Rejects same-origin as the web app (e.g. GitHub Pages URL pasted by mistake → POST 405).
 */
export function resolveGeminiWorkerBase(input: string):
  | { ok: true; worker: string }
  | { ok: false; error: string } {
  const withProto = withHttpsWorkerUrl(input);
  if (!withProto) {
    return { ok: false, error: "请填写并保存 Worker URL（部署说明见仓库 workers/gemini-proxy/README.md）。" };
  }
  let u: URL;
  try {
    u = new URL(withProto);
  } catch {
    return { ok: false, error: "Worker URL 格式无效，请检查是否多了空格或少了域名。" };
  }
  if (u.protocol !== "https:") {
    return { ok: false, error: "Worker URL 必须使用 https（例如 https://xxx.workers.dev）。" };
  }
  if (typeof globalThis !== "undefined" && "location" in globalThis) {
    const loc = (globalThis as { location?: { origin?: string } }).location;
    const origin = loc?.origin;
    if (origin && u.origin === origin) {
      return {
        ok: false,
        error:
          "Worker URL 填成了**当前这个网页**的地址（GitHub Pages 等静态站）。大文件上传会向静态站发 POST，服务器会返回 **405 Not Allowed**。\n\n请改成 **Cloudflare Worker** 的地址（部署后一般是 `https://<子域>.workers.dev`，不要填 `sarajir.github.io/psychedu`）。说明见仓库 workers/gemini-proxy/README.md。",
      };
    }
  }
  const worker = withProto.replace(/\/$/, "");
  return { ok: true, worker };
}

function keyForProvider(p: LlmProviderId): string {
  return `psychedu.apiKey.${p}`;
}

export function getApiKeyForProvider(p: LlmProviderId): string {
  try {
    const v = localStorage.getItem(keyForProvider(p))?.trim();
    if (v) return v;
    if (p === "gemini") {
      const legacy = localStorage.getItem(LEGACY_GEMINI_KEY)?.trim();
      return legacy ?? "";
    }
    return "";
  } catch {
    return "";
  }
}

export function setApiKeyForProvider(p: LlmProviderId, value: string): void {
  try {
    const v = value.trim();
    if (!v) {
      localStorage.removeItem(keyForProvider(p));
      if (p === "gemini") localStorage.removeItem(LEGACY_GEMINI_KEY);
    } else {
      localStorage.setItem(keyForProvider(p), v);
      if (p === "gemini") localStorage.setItem(LEGACY_GEMINI_KEY, v);
    }
  } catch {
    /* ignore */
  }
}

/** @deprecated use getApiKeyForProvider("gemini") */
export function getGeminiApiKey(): string {
  return getApiKeyForProvider("gemini");
}

/** @deprecated use setApiKeyForProvider */
export function setGeminiApiKey(value: string): void {
  setApiKeyForProvider("gemini", value);
}

export function getGeminiWorkerBase(): string {
  try {
    const fromLs = localStorage.getItem(KEY_WORKER)?.trim();
    const fromEnv = import.meta.env.VITE_GEMINI_WORKER_URL?.trim();
    const raw = fromLs || fromEnv || "";
    return withHttpsWorkerUrl(raw).replace(/\/$/, "");
  } catch {
    const fromEnv = import.meta.env.VITE_GEMINI_WORKER_URL?.trim() ?? "";
    return withHttpsWorkerUrl(fromEnv).replace(/\/$/, "");
  }
}

export function setGeminiWorkerBase(value: string): void {
  try {
    const v = withHttpsWorkerUrl(value).replace(/\/$/, "");
    if (!v) localStorage.removeItem(KEY_WORKER);
    else localStorage.setItem(KEY_WORKER, v);
  } catch {
    /* ignore */
  }
}
