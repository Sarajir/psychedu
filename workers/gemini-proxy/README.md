# psychedu Gemini BYOK proxy (Cloudflare Worker)

This worker forwards `generateContent` requests to Google’s Gemini API so your static site (e.g. GitHub Pages) can call Gemini **without exposing API keys in the frontend bundle**. Each user still brings **their own** Gemini API key (`Authorization: Bearer …`); the worker does **not** store keys.

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
- `POST /generate` — body matches Gemini `generateContent` JSON (`model`, `contents`, optional `generationConfig`, `systemInstruction`). Header: `Authorization: Bearer <Gemini API key>`.

## Limits

- Request size capped in worker (~18 MB). The web UI also caps inline PDFs smaller than that for reliability.

## Security notes

- Anyone who knows the worker URL can **attempt** to use it; abuse hits **their** API key only if they have one, but you should still monitor Cloudflare analytics and tighten `ALLOWED_ORIGINS` to your domains only.
