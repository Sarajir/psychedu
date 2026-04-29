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
- `OPTIONS /generate` — CORS preflight
- `POST /generate` — Header: `Authorization: Bearer <API key for the provider you chose>`.

**Gemini** (same as before; optional `"provider": "gemini"`):

- Body: `{ "model", "contents", optional "generationConfig", "systemInstruction" }`  
- Backward compatible: if `"provider"` is omitted but `contents` is an array, it is treated as Gemini.

**DeepSeek / Groq** (OpenAI-style chat):

- Body: `{ "provider": "deepseek" | "groq", "model", "messages": [{ "role","content" }, ...], optional "temperature", "max_tokens" }`

## Limits

- Request body capped in worker (~40 MB JSON). The web UI caps **raw** upload to **~10 MB** per file (base64 inflates the payload). Decks with many images often exceed this — export a **subset of slides to PDF** or compress media, then upload.

## Security notes

- Anyone who knows the worker URL can **attempt** to use it; abuse hits **their** API key only if they have one, but you should still monitor Cloudflare analytics and tighten `ALLOWED_ORIGINS` to your domains only.
