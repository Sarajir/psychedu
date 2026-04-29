import { useCallback, useMemo, useState } from "react";
import {
  buildPresetPayload,
  listPresets,
  type PresetId,
} from "../lib/aiPrompts";
import {
  callGeminiProxy,
  extractGeminiBlockReason,
  extractGeminiText,
  type GeneratePayload,
} from "../lib/geminiProxy";
import {
  getGeminiApiKey,
  getGeminiWorkerBase,
  setGeminiApiKey,
  setGeminiWorkerBase,
} from "../lib/geminiConfig";

const MODELS = [
  { id: "gemini-2.0-flash", label: "gemini-2.0-flash（稳）" },
  { id: "gemini-2.5-flash", label: "gemini-2.5-flash（新）" },
];

/** ~3.5MB raw file before base64 — keeps JSON under Worker limits */
const MAX_INLINE_BYTES = 3.5 * 1024 * 1024;

function inferMime(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".txt")) return "text/plain";
  if (n.endsWith(".md")) return "text/markdown";
  if (n.endsWith(".csv")) return "text/csv";
  return file.type || "application/octet-stream";
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function AiPage() {
  const [workerInput, setWorkerInput] = useState(getGeminiWorkerBase);
  const [apiKeyInput, setApiKeyInput] = useState(getGeminiApiKey);
  const [model, setModel] = useState(MODELS[0].id);
  const [preset, setPreset] = useState<PresetId>("pack");
  const [topicHint, setTopicHint] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState("");

  const presets = useMemo(() => listPresets(), []);

  const saveSettings = useCallback(() => {
    setGeminiWorkerBase(workerInput);
    setGeminiApiKey(apiKeyInput);
  }, [workerInput, apiKeyInput]);

  const generate = useCallback(async () => {
    setError(null);
    setOutput("");
    const worker = workerInput.trim().replace(/\/$/, "");
    const key = apiKeyInput.trim();
    if (!worker) {
      setError("请填写并保存 Worker URL（部署说明见仓库 workers/gemini-proxy/README.md）。");
      return;
    }
    if (!key) {
      setError("请填写并保存 Gemini API Key（建议用 Google AI Studio 免费申请）。");
      return;
    }
    setGeminiWorkerBase(worker);
    setGeminiApiKey(key);

    const { systemInstruction, userSuffix } = buildPresetPayload({
      preset,
      topicHint,
      fileMime: file ? inferMime(file) : null,
      hasBinary: Boolean(file),
    });

    const parts: Record<string, unknown>[] = [];

    if (file) {
      if (file.size > MAX_INLINE_BYTES) {
        setError(
          `文件过大（>${Math.round(MAX_INLINE_BYTES / 1024 / 1024)}MB）。请换更小的 PDF/图片，或改用 .txt/.md 纯文本。`,
        );
        return;
      }
      const mime = inferMime(file);
      if (mime === "application/pdf" || mime.startsWith("image/")) {
        const b64 = await readFileAsBase64(file);
        parts.push({
          inline_data: {
            mime_type: mime,
            data: b64,
          },
        });
      } else if (
        mime === "text/plain" ||
        mime === "text/markdown" ||
        mime === "text/csv" ||
        file.name.endsWith(".md") ||
        file.name.endsWith(".txt")
      ) {
        const txt = await readFileAsText(file);
        parts.push({
          text: `【用户上传的文本文件：${file.name}】\n${txt.slice(0, 120_000)}`,
        });
      } else {
        setError(`暂不支持的文件类型：${mime}。请用 PDF、常见图片，或 .txt/.md。`);
        return;
      }
    }

    parts.push({
      text: `${userSuffix}\n\n若材料语言非中文，请仍用中文输出学习材料。`,
    });

    const payload: GeneratePayload = {
      model,
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 8192,
      },
      systemInstruction,
    };

    setBusy(true);
    try {
      const data = await callGeminiProxy(worker, key, payload);
      const blocked = extractGeminiBlockReason(data);
      if (blocked) {
        setError(`请求被模型拦截：${blocked}`);
        return;
      }
      const text = extractGeminiText(data);
      if (!text.trim()) {
        setError("模型返回为空。可能被安全策略拦截，请换材料或换模型再试。");
        return;
      }
      setOutput(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [apiKeyInput, file, model, preset, topicHint, workerInput]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 pb-16">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          AI · BYOK（自带密钥）
        </p>
        <h1 className="text-2xl font-semibold text-ink-900">用 Gemini 从文件生成学习材料</h1>
        <p className="text-sm text-ink-600 leading-relaxed">
          这是<strong>可选功能</strong>：每个使用者在浏览器里填写<strong>自己的</strong>
          Google Gemini API Key 与<strong>你部署的</strong> Cloudflare Worker 地址。Key
          只存在本机 localStorage，经 Worker 转发到 Google，不会写进 GitHub 静态站源码。
          适合教材、论文 PDF、截图、乐理图、概念笔记等；输出可再粘贴到「Today」里当作复习线索。
        </p>
        <p className="text-xs text-ink-500">
          免费额度以 Google 当前政策为准；Worker 侧见{" "}
          <a
            className="text-accent underline"
            href="https://github.com/Sarajir/psychedu/tree/main/workers/gemini-proxy"
            target="_blank"
            rel="noreferrer"
          >
            workers/gemini-proxy
          </a>
          。
        </p>
      </header>

      <section className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink-900">① 连接设置（各填各的）</h2>
        <div>
          <label className="label">Worker URL（Cloudflare 部署后复制）</label>
          <input
            className="input font-mono text-xs"
            value={workerInput}
            onChange={(e) => setWorkerInput(e.target.value.trim())}
            placeholder="https://psychedu-gemini-proxy.xxx.workers.dev"
          />
          <p className="text-xs text-ink-500 mt-1">
            也可在构建时注入环境变量{" "}
            <code className="bg-ink-100 px-1 rounded">VITE_GEMINI_WORKER_URL</code>{" "}
            作为默认值；此处保存会覆盖默认。
          </p>
        </div>
        <div>
          <label className="label">Gemini API Key（Google AI Studio 申请）</label>
          <input
            className="input font-mono text-xs"
            type="password"
            autoComplete="off"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="AIza…"
          />
          <p className="text-xs text-ink-500 mt-1">
            申请入口：{" "}
            <a
              className="text-accent underline"
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
            >
              aistudio.google.com/apikey
            </a>
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={saveSettings}>
          保存到本浏览器
        </button>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink-900">② 生成选项</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">模型</label>
            <select
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">输出风格</label>
            <select
              className="input"
              value={preset}
              onChange={(e) => setPreset(e.target.value as PresetId)}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">学习主题 / 场景（可选）</label>
          <input
            className="input"
            value={topicHint}
            onChange={(e) => setTopicHint(e.target.value)}
            placeholder="例：人脸识别里的特征脸方法；发展心理学依恋理论；C 大调视奏…"
          />
        </div>
        <div>
          <label className="label">上传材料（可选，≤约 3.5MB）</label>
          <input
            type="file"
            className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-md file:border file:border-ink-200 file:bg-white file:px-3 file:py-1.5"
            accept=".pdf,image/*,.txt,.md,.csv,text/plain,text/markdown"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="text-xs text-ink-500 mt-1">
              已选：{file.name}（{Math.round(file.size / 1024)} KB）
            </p>
          )}
          {!file && (
            <p className="text-xs text-ink-500 mt-1">
              不上传时，只会根据「学习主题」生成通用脚手架（质量取决于你写得多具体）。
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn-primary w-full sm:w-auto min-h-[44px]"
          disabled={busy}
          onClick={() => void generate()}
        >
          {busy ? "生成中…" : "③ 调用 Gemini 生成"}
        </button>
        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-md px-3 py-2 whitespace-pre-wrap">
            {error}
          </p>
        )}
      </section>

      {output && (
        <section className="card p-6 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-ink-900">生成结果</h2>
            <button
              type="button"
              className="btn-outline text-xs"
              onClick={async () => {
                await navigator.clipboard.writeText(output);
              }}
            >
              复制全文
            </button>
          </div>
          <pre className="text-sm text-ink-800 whitespace-pre-wrap break-words max-h-[70vh] overflow-auto bg-ink-100/50 rounded-lg p-4 border border-ink-100">
            {output}
          </pre>
        </section>
      )}
    </div>
  );
}
