import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildPresetPayload,
  listPresets,
  type PresetId,
} from "../lib/aiPrompts";
import {
  callGenerateProxy,
  extractChatCompletionText,
  extractGeminiBlockReason,
  extractGeminiText,
} from "../lib/llmProxy";
import {
  getApiKeyForProvider,
  getGeminiWorkerBase,
  setApiKeyForProvider,
  setGeminiWorkerBase,
} from "../lib/llmConfig";
import { LLM_PROVIDERS, providerById, type LlmProviderId } from "../lib/llmProviders";

/**
 * Max raw file size for inline upload (base64 expands ~33% in JSON).
 * 整份大 PPT（几十～上百 MB）无法走浏览器单次 JSON，需拆分/压缩/导出部分 PDF。
 */
const MAX_INLINE_BYTES = 10 * 1024 * 1024;

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function fileTooLargeMessage(file: File): string {
  return [
    `你选的文件约 ${mb(file.size)} MB，超过本页单次上限（${mb(MAX_INLINE_BYTES)} MB）。`,
    `整份课件常含大量图片/视频，即使用更大服务器也无法在浏览器里「一次塞进」请求。`,
    `可以：① PowerPoint「另存为 → PDF」并只勾选本章几页；②「文件 → 压缩媒体」后再导出；③ 把大纲粘贴到「学习主题」；④ 拆成多份小于 ${mb(MAX_INLINE_BYTES)} MB 的 PDF 分次生成。`,
  ].join("\n");
}

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
  if (n.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (n.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (n.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (n.endsWith(".doc")) return "application/msword";
  return file.type || "application/octet-stream";
}

function isOfficeDocumentMime(m: string): boolean {
  return (
    m === "application/msword" ||
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    m === "application/vnd.ms-powerpoint" ||
    m === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    m === "application/vnd.openxmlformats-officedocument.presentationml.slideshow"
  );
}

function isBinaryMultimodal(mime: string): boolean {
  return (
    mime === "application/pdf" ||
    mime.startsWith("image/") ||
    isOfficeDocumentMime(mime)
  );
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
  const [provider, setProvider] = useState<LlmProviderId>("gemini");
  const [model, setModel] = useState(LLM_PROVIDERS[0].models[0].id);
  const [apiKeyInput, setApiKeyInput] = useState(() =>
    getApiKeyForProvider("gemini"),
  );
  const [preset, setPreset] = useState<PresetId>("pack");
  const [topicHint, setTopicHint] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [fileHint, setFileHint] = useState<string | null>(null);

  const presets = useMemo(() => listPresets(), []);
  const pcfg = useMemo(() => providerById(provider), [provider]);

  useEffect(() => {
    const cfg = providerById(provider);
    setModel(cfg.models[0].id);
    setApiKeyInput(getApiKeyForProvider(provider));
  }, [provider]);

  useEffect(() => {
    if (!file) {
      setFileHint(null);
      return;
    }
    if (provider !== "gemini") {
      setFileHint(null);
      return;
    }
    if (file.size > MAX_INLINE_BYTES) {
      setFileHint(fileTooLargeMessage(file));
    } else {
      setFileHint(null);
    }
  }, [file, provider]);

  const saveSettings = useCallback(() => {
    setGeminiWorkerBase(workerInput);
    setApiKeyForProvider(provider, apiKeyInput);
  }, [workerInput, apiKeyInput, provider]);

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
      setError("请填写并保存当前线路对应的 API Key。");
      return;
    }
    setGeminiWorkerBase(worker);
    setApiKeyForProvider(provider, key);

    const { systemInstruction, userSuffix } = buildPresetPayload({
      preset,
      topicHint,
      fileMime: file ? inferMime(file) : null,
      hasBinary: Boolean(file && isBinaryMultimodal(inferMime(file))),
    });

    const systemText =
      systemInstruction?.parts?.map((x) => x.text).join("\n") ?? "";

    setBusy(true);
    try {
      if (provider === "gemini") {
        const parts: Record<string, unknown>[] = [];

        if (file) {
          if (file.size > MAX_INLINE_BYTES) {
            setError(fileTooLargeMessage(file));
            return;
          }
          const mime = inferMime(file);
          if (isBinaryMultimodal(mime)) {
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
            setError(
              `暂不支持的文件类型：${mime}。请用 PDF、PPT/PPTX、Word、常见图片，或 .txt/.md。`,
            );
            return;
          }
        }

        parts.push({
          text: `${userSuffix}\n\n若材料语言非中文，请仍用中文输出学习材料。`,
        });

        const body = {
          provider: "gemini" as const,
          model,
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 8192,
          },
          systemInstruction,
        };

        const data = await callGenerateProxy(worker, key, body);
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
        return;
      }

      if (file) {
        const mime = inferMime(file);
        if (isBinaryMultimodal(mime)) {
          setError(
            "DeepSeek / Groq 本页仅支持「文本」通道：不能直传 PDF/Office/图片。请改用 **Gemini** 线路，或把正文粘贴到「学习主题」，或上传 .txt/.md。",
          );
          return;
        }
        if (file.size > MAX_INLINE_BYTES) {
          setError(fileTooLargeMessage(file));
          return;
        }
      }

      let userBody = "";
      if (topicHint.trim()) {
        userBody += `【学习主题/场景】\n${topicHint.trim()}\n\n`;
      }
      if (file) {
        const mime = inferMime(file);
        if (
          mime === "text/plain" ||
          mime === "text/markdown" ||
          mime === "text/csv" ||
          file.name.endsWith(".md") ||
          file.name.endsWith(".txt")
        ) {
          const txt = await readFileAsText(file);
          userBody += `【上传文件：${file.name}】\n${txt.slice(0, 120_000)}\n\n`;
        }
      }
      userBody += `${userSuffix}\n\n请用简体中文输出学习材料。`;

      const messages = [
        { role: "system", content: systemText },
        { role: "user", content: userBody },
      ];

      const body = {
        provider,
        model,
        messages,
        temperature: 0.35,
        max_tokens: 8192,
      };

      const data = await callGenerateProxy(worker, key, body);
      const text = extractChatCompletionText(data);
      if (!text.trim()) {
        setError("模型返回为空。请检查模型名是否在厂商控制台仍可用，或换一条线路。");
        return;
      }
      setOutput(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [apiKeyInput, file, model, preset, provider, topicHint, workerInput]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 pb-16">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          AI · BYOK（自带密钥）
        </p>
        <h1 className="text-2xl font-semibold text-ink-900">多模型生成学习材料</h1>
        <p className="text-sm text-ink-600 leading-relaxed">
          可选功能：每人使用<strong>自己的</strong> API Key + 同一个 Cloudflare Worker 转发。
          <strong>Gemini</strong> 可走 PDF/图/Office 多模态；
          <strong>DeepSeek</strong>、<strong>Groq</strong> 为文本对话接口（便宜/快，可把讲义导出成
          .txt 或把正文贴在「学习主题」）。各厂商是否免费、额度多少以对方官网为准；多线路可分担单家限流。
        </p>
        <p className="text-xs text-ink-500">
          Worker 部署见{" "}
          <a
            className="text-accent underline"
            href="https://github.com/Sarajir/psychedu/tree/main/workers/gemini-proxy"
            target="_blank"
            rel="noreferrer"
          >
            workers/gemini-proxy
          </a>
          （支持 Gemini / DeepSeek / Groq）。
        </p>
      </header>

      <section className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink-900">① 连接设置</h2>
        <div>
          <label className="label">Worker URL</label>
          <input
            className="input font-mono text-xs"
            value={workerInput}
            onChange={(e) => setWorkerInput(e.target.value.trim())}
            placeholder="https://psychedu-gemini-proxy.xxx.workers.dev"
          />
          <p className="text-xs text-ink-500 mt-1">
            可选环境变量{" "}
            <code className="bg-ink-100 px-1 rounded">VITE_GEMINI_WORKER_URL</code>{" "}
            作为默认；此处保存会覆盖。
          </p>
        </div>
        <div>
          <label className="label">模型线路</label>
          <select
            className="input"
            value={provider}
            onChange={(e) => setProvider(e.target.value as LlmProviderId)}
          >
            {LLM_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-600 mt-1.5 leading-relaxed">{pcfg.blurb}</p>
        </div>
        <div>
          <label className="label">
            {pcfg.label} API Key（{pcfg.keyHint}）
          </label>
          <input
            className="input font-mono text-xs"
            type="password"
            autoComplete="off"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="粘贴密钥"
          />
          <p className="text-xs text-ink-500 mt-1">
            申请/管理：{" "}
            <a
              className="text-accent underline"
              href={pcfg.keyUrl}
              target="_blank"
              rel="noreferrer"
            >
              {pcfg.keyUrl.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={saveSettings}>
          保存 Worker 与当前线路的 Key
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
              {pcfg.models.map((m) => (
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
          <label className="label">学习主题 / 场景（可选；文本线路建议写具体）</label>
          <input
            className="input"
            value={topicHint}
            onChange={(e) => setTopicHint(e.target.value)}
            placeholder="例：人脸识别里的特征脸方法；发展心理学依恋理论；C 大调视奏…"
          />
        </div>
        <div>
          <label className="label">
            上传材料（可选，Gemini 单文件 ≤ 约 {mb(MAX_INLINE_BYTES)} MB）
            {provider !== "gemini" && (
              <span className="normal-case font-normal text-amber-800 ml-1">
                — 当前线路仅 .txt / .md / .csv 或把内容写进「学习主题」
              </span>
            )}
          </label>
          <input
            type="file"
            className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-md file:border file:border-ink-200 file:bg-white file:px-3 file:py-1.5"
            accept={
              provider === "gemini"
                ? ".pdf,.ppt,.pptx,.doc,.docx,image/*,.txt,.md,.csv,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,text/markdown,text/csv"
                : ".txt,.md,.csv,text/plain,text/markdown"
            }
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="text-xs text-ink-500 mt-1">
              已选：{file.name}（
              {file.size >= 1024 * 1024
                ? `${mb(file.size)} MB`
                : `${Math.round(file.size / 1024)} KB`}
              ）
            </p>
          )}
          {fileHint && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2 whitespace-pre-line leading-relaxed">
              {fileHint}
            </p>
          )}
          {!file && (
            <p className="text-xs text-ink-500 mt-1">
              不上传时，主要依据「学习主题」；Gemini 仍可多模态读文件。
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn-primary w-full sm:w-auto min-h-[44px]"
          disabled={
            busy ||
            (provider === "gemini" &&
              Boolean(file && file.size > MAX_INLINE_BYTES))
          }
          onClick={() => void generate()}
        >
          {busy ? "生成中…" : "③ 调用模型生成"}
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
