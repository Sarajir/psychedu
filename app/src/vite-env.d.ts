/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional default Gemini proxy (Cloudflare Worker) URL, no trailing slash */
  readonly VITE_GEMINI_WORKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
