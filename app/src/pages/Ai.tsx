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
  GEMINI_MAX_UPLOAD_BYTES,
  uploadGeminiFileViaWorker,
} from "../lib/geminiFileUpload";
import {
  getApiKeyForProvider,
  getGeminiWorkerBase,
  resolveGeminiWorkerBase,
  setApiKeyForProvider,
  setGeminiWorkerBase,
} from "../lib/llmConfig";
import {
  inferMime,
  isBinaryMultimodal,
  isPlainTextLikeMime,
} from "../lib/inferMime";
import { LLM_PROVIDERS, providerById, type LlmProviderId } from "../lib/llmProviders";

/**
 * Max raw file size for inline upload (base64 expands ~33% in JSON).
 * 更大文件走 Gemini Files API（Worker 分块上传）。
 */
const MAX_INLINE_BYTES = 10 * 1024 * 1024;

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function fileTooLargeForChatProvidersMessage(file: File): string {
  return [
    `你选的文件约 ${mb(file.size)} MB，超过本页 DeepSeek / Groq 单次上限（${mb(MAX_INLINE_BYTES)} MB）。`,
    `这两条线路只走纯文本 JSON。可以：① 改用 **Gemini** 并部署最新 Worker 以支持大文件分块上传；② 把正文导出成 .txt/.md；③ 把大纲写进「学习主题」。`,
  ].join("\n");
}

function geminiLargeFileInfo(file: File): string {
  return [
    `已选约 ${mb(file.size)} MB。将经 **Worker 分块** 上传到 **Google Gemini Files API**，再调用模型生成（请保持页面打开，首次可能较慢）。`,
    `单文件上限以 Google 为准（约 2 GB）；需已部署支持 \`/gemini/file-upload/*\` 的 Worker。`,
  ].join("\n");
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
  const [busyHint, setBusyHint] = useState<string | null>(null);
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
    if (file.size > GEMINI_MAX_UPLOAD_BYTES) {
      setFileHint(
        `文件约 ${mb(file.size)} MB，超过 Google Files API 单文件上限（约 2 GB）。请压缩或拆分后再试。`,
      );
    } else if (file.size > MAX_INLINE_BYTES) {
      setFileHint(geminiLargeFileInfo(file));
    } else {
      setFileHint(null);
    }
  }, [file, provider]);

  const saveSettings = useCallback(() => {
    const r = resolveGeminiWorkerBase(workerInput);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setWorkerInput(r.worker);
    setGeminiWorkerBase(r.worker);
    setApiKeyForProvider(provider, apiKeyInput);
  }, [workerInput, apiKeyInput, provider]);

  const generate = useCallback(async () => {
    setError(null);
    setOutput("");
    const resolved = resolveGeminiWorkerBase(workerInput);
    if (!resolved.ok) {
      setError(resolved.error);
      return;
    }
    const worker = resolved.worker;
    const key = apiKeyInput.trim();
    if (!key) {
      setError("请填写并保存当前线路对应的 API Key。");
      return;
    }
    setWorkerInput(worker);
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
    setBusyHint(null);
    try {
      if (provider === "gemini") {
        const parts: Record<string, unknown>[] = [];

        if (file) {
          if (file.size > GEMINI_MAX_UPLOAD_BYTES) {
            setError(
              `文件约 ${mb(file.size)} MB，超过 Google Files API 单文件上限（约 2 GB）。请压缩或拆分后再试。`,
            );
            return;
          }
          const mime = inferMime(file);
          const useFilesApi =
            file.size > MAX_INLINE_BYTES &&
            (isBinaryMultimodal(mime) || isPlainTextLikeMime(mime, file.name));

          if (file.size > MAX_INLINE_BYTES && !useFilesApi) {
            setError(
              `暂不支持的文件类型（大文件）：${mime}。大文件请用 PDF、Office、图片，或 .txt/.md/.csv；或压缩到约 ${mb(MAX_INLINE_BYTES)} MB 以下走内联上传。`,
            );
            return;
          }

          if (useFilesApi) {
            setBusyHint("正在分块上传到 Google（经 Worker）…");
            const uploaded = await uploadGeminiFileViaWorker(worker, key, file, (p) => {
              if (p.phase === "upload") {
                const pct =
                  p.total > 0 ? Math.min(99, Math.round((100 * p.sent) / p.total)) : 0;
                setBusyHint(`上传中 ${pct}%…`);
              } else {
                setBusyHint("文件处理中，请稍候…");
              }
            });
            setBusyHint("正在调用模型生成…");
            parts.push({
              file_data: {
                mime_type: uploaded.mimeType,
                file_uri: uploaded.fileUri,
              },
            });
          } else if (isBinaryMultimodal(mime)) {
            const b64 = await readFileAsBase64(file);
            parts.push({
              inline_data: {
                mime_type: mime,
                data: b64,
              },
            });
          } else if (isPlainTextLikeMime(mime, file.name)) {
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
          setError(fileTooLargeForChatProvidersMessage(file));
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
      setBusyHint(null);
      setBusy(false);
    }
  }, [apiKeyInput, file, model, preset, provider, topicHint, workerInput, setWorkerInput]);

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
        <div className="text-sm text-ink-700 bg-ink-50 border border-ink-200 rounded-lg px-4 py-3 space-y-2 leading-relaxed">
          <p className="font-medium text-ink-900">大文件想「最简单」？</p>
          <p>
            在 GitHub Pages 这种<strong>纯静态页</strong>里，要安全用你的 Key、又要传几十～上百 MB
            课件，中间就免不了 Worker / 分块上传这类工程——是为「全在站里点一下」准备的，不是必选项。
          </p>
          <p>
            <strong>最省事的做法</strong>：打开{" "}
            <a
              className="text-accent underline"
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noreferrer"
            >
              Google AI Studio
            </a>
            、
            <a
              className="text-accent underline"
              href="https://gemini.google.com/"
              target="_blank"
              rel="noreferrer"
            >
              Gemini
            </a>
            或 ChatGPT 网页版，<strong>直接拖附件</strong>，用自然语言描述你的需求，让模型生成答案，再把结果复制到笔记或本站的「Today」里做复习。本站仍适合<strong>小文件</strong>（约几
            MB 内）或只贴文字大纲时一键生成。
          </p>
        </div>
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
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 mt-2 leading-relaxed">
            必须填 <strong>Cloudflare Worker</strong> 地址（如 <code className="text-xs">*.workers.dev</code>
            ），<strong>不要</strong>填本站的 <code className="text-xs">github.io/…</code> 页面地址，否则大文件上传会得到{" "}
            <strong>405</strong>。
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
            上传材料（可选；Gemini 小文件 ≤ 约 {mb(MAX_INLINE_BYTES)} MB 内联，更大走 Files API 分块至约 2 GB）
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
            <p
              className={`text-xs rounded-md px-3 py-2 mt-2 whitespace-pre-line leading-relaxed border ${
                file && file.size > GEMINI_MAX_UPLOAD_BYTES
                  ? "text-rose-900 bg-rose-50 border-rose-200"
                  : "text-sky-900 bg-sky-50 border-sky-200"
              }`}
            >
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
              Boolean(file && file.size > GEMINI_MAX_UPLOAD_BYTES))
          }
          onClick={() => void generate()}
        >
          {busy ? (busyHint ?? "生成中…") : "③ 调用模型生成"}
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
