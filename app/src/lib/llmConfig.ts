import type { LlmProviderId } from "./llmProviders";

const KEY_WORKER = "psychedu.geminiWorkerUrl";
const LEGACY_GEMINI_KEY = "psychedu.geminiApiKey";

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
    return raw.replace(/\/$/, "");
  } catch {
    return import.meta.env.VITE_GEMINI_WORKER_URL?.trim().replace(/\/$/, "") ?? "";
  }
}

export function setGeminiWorkerBase(value: string): void {
  try {
    const v = value.trim().replace(/\/$/, "");
    if (!v) localStorage.removeItem(KEY_WORKER);
    else localStorage.setItem(KEY_WORKER, v);
  } catch {
    /* ignore */
  }
}
