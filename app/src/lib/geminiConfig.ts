const KEY_API = "psychedu.geminiApiKey";
const KEY_WORKER = "psychedu.geminiWorkerUrl";

export function getGeminiApiKey(): string {
  try {
    return localStorage.getItem(KEY_API)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setGeminiApiKey(value: string): void {
  try {
    const v = value.trim();
    if (!v) localStorage.removeItem(KEY_API);
    else localStorage.setItem(KEY_API, v);
  } catch {
    /* ignore */
  }
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
