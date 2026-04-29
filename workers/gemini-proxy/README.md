# psychedu LLM BYOK proxy (Cloudflare Worker)

This worker forwards requests so your static site (e.g. GitHub Pages) can call **Google Gemini**, **DeepSeek**, or **Groq** with **BYOK** (`Authorization: Bearer <that provider’s API key>`). The worker does **not** store keys.

Supported upstreams (allowlisted only):

| `provider` (JSON body) | Upstream |
|--------------------------|----------|
| `gemini` (default if `contents` array present) | `generativelanguage.googleapis.com` |
| `deepseek` | `https://api.deepseek.com/chat/completions` |
| `groq` | `https://api.groq.com/openai/v1/chat/completions` |

## Deploy

1. Install deps: `cd workers/gemini-proxy && npm install`
2. Login: `npx wrangler login`
3. Edit `wrangler.toml` → `ALLOWED_ORIGINS` to include your site’s `Origin` (exact scheme + host, no path). Examples:
   - `https://YOURNAME.github.io`
   - `http://localhost:5173`
4. Deploy: `npm run deploy`
5. Copy the worker URL (e.g. `https://psychedu-gemini-proxy.YOUR_SUBDOMAIN.workers.dev`) into the psychedu web app **AI** tab → “Worker URL”, or set build-time `VITE_GEMINI_WORKER_URL`.

## Endpoints

- `GET /` — health + usage JSON
- `OPTIONS` — CORS preflight for any route below
- `POST /generate` — Header: `Authorization: Bearer <API key for the provider you chose>`.

### Gemini large files (Files API, chunked)

The web app can upload files **larger than the inline base64 limit** by calling these routes (same `Authorization: Bearer <Gemini API key>` as `/generate`):

1. **`POST /gemini/file-upload/start`** — JSON body `{ "mimeType", "byteSize", "displayName" }`. Returns `{ "ok": true, "uploadUrl", "byteSize" }` where `uploadUrl` is Google’s resumable session URL (opaque; do not log).
2. **`POST /gemini/file-upload/part`** — Raw body = one chunk (≤ 32 MiB). Headers:
   - `X-Gemini-Upload-Url`: exact `uploadUrl` from step 1 (host must be `generativelanguage.googleapis.com`)
   - `X-Goog-Upload-Offset`: byte offset (string)
   - `X-Goog-Upload-Command`: `upload` or `upload, finalize` (last chunk uses `upload, finalize`)
   - `Content-Length`: chunk size  
   Forwards to Google using the same protocol as [Files API resumable upload](https://ai.google.dev/gemini-api/docs/files). Final chunk response body is Google’s JSON (contains `file.uri` for `generateContent`).
3. **`GET /gemini/file?name=files%2F…`** — Proxies `GET …/v1beta/files/{id}` so the browser can poll until `state` is `ACTIVE`.

**Gemini** (same as before; optional `"provider": "gemini"`):

- Body: `{ "model", "contents", optional "generationConfig", "systemInstruction" }`  
- Backward compatible: if `"provider"` is omitted but `contents` is an array, it is treated as Gemini.

**DeepSeek / Groq** (OpenAI-style chat):

- Body: `{ "provider": "deepseek" | "groq", "model", "messages": [{ "role","content" }, ...], optional "temperature", "max_tokens" }`

## Limits

- **`POST /generate`**: JSON body capped (~40 MB). Inline PDF/Office in JSON is impractical beyond ~10 MB raw; use **chunked file upload** above instead (per-file up to **2 GB** on Google’s side; each chunk ≤ **32 MiB** through the worker).
- **Cloudflare**: each `POST /gemini/file-upload/part` must stay under the chunk limit; total file size is limited by Google (2 GB) and your account quotas.

## Security notes

- Anyone who knows the worker URL can **attempt** to use it; abuse hits **their** API key only if they have one, but you should still monitor Cloudflare analytics and tighten `ALLOWED_ORIGINS` to your domains only.
