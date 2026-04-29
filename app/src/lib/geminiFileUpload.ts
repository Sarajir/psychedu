import { inferMime } from "./inferMime";

/** Same cap as Google Files API per-file limit (docs: 2 GB). */
export const GEMINI_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

const CHUNK_BYTES = 8 * 1024 * 1024;

function sanitizeDisplayName(name: string): string {
  const t = name.trim().replace(/[\r\n\0]/g, "_").slice(0, 300);
  return t || "upload";
}

export interface UploadProgress {
  phase: "upload" | "wait";
  sent: number;
  total: number;
}

export interface UploadedGeminiFile {
  fileUri: string;
  mimeType: string;
  name: string;
}

function parseFileResource(raw: string | unknown): {
  uri?: string;
  name?: string;
  mimeType?: string;
  state?: string;
} {
  const j =
    typeof raw === "string"
      ? (JSON.parse(raw) as { file?: Record<string, unknown> } & Record<string, unknown>)
      : (raw as { file?: Record<string, unknown> } & Record<string, unknown>);
  const f = (j.file ?? j) as Record<string, unknown>;
  return {
    uri: f.uri != null ? String(f.uri) : undefined,
    name: f.name != null ? String(f.name) : undefined,
    mimeType: f.mimeType != null ? String(f.mimeType) : undefined,
    state: f.state != null ? String(f.state) : undefined,
  };
}

async function getJson(
  workerBase: string,
  apiKey: string,
  pathWithQuery: string,
): Promise<unknown> {
  const base = workerBase.replace(/\/$/, "");
  const r = await fetch(`${base}${pathWithQuery}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
  return text ? JSON.parse(text) : null;
}

/**
 * Chunked upload to Gemini Files API via Worker (resumable protocol).
 * Avoids base64 + single huge JSON on /generate.
 */
export async function uploadGeminiFileViaWorker(
  workerBase: string,
  apiKey: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadedGeminiFile> {
  const base = workerBase.replace(/\/$/, "");
  const mimeType = inferMime(file);
  const byteSize = file.size;
  if (byteSize < 1 || byteSize > GEMINI_MAX_UPLOAD_BYTES) {
    throw new Error(`文件大小需在 1 字节 ~ 2 GB 之间（当前约 ${(byteSize / 1024 / 1024).toFixed(1)} MB）。`);
  }

  const startR = await fetch(`${base}/gemini/file-upload/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      mimeType,
      byteSize,
      displayName: sanitizeDisplayName(file.name),
    }),
  });
  const startText = await startR.text();
  if (!startR.ok) {
    throw new Error(startText || `上传会话失败 HTTP ${startR.status}`);
  }
  let uploadUrl: string;
  try {
    uploadUrl = String((JSON.parse(startText) as { uploadUrl?: string }).uploadUrl || "").trim();
  } catch {
    throw new Error(startText || "上传会话响应无效");
  }
  if (!uploadUrl) throw new Error("未返回 uploadUrl");

  let offset = 0;
  while (offset < byteSize) {
    const end = Math.min(offset + CHUNK_BYTES, byteSize);
    const blob = file.slice(offset, end);
    const last = end >= byteSize;
    const command = last ? "upload, finalize" : "upload";

    onProgress?.({ phase: "upload", sent: offset, total: byteSize });

    const partR = await fetch(`${base}/gemini/file-upload/part`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Gemini-Upload-Url": uploadUrl,
        "X-Goog-Upload-Offset": String(offset),
        "X-Goog-Upload-Command": command,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(blob.size),
      },
      body: blob,
    });
    const partText = await partR.text();

    if (!last) {
      if (!partR.ok && partR.status !== 308) {
        throw new Error(partText || `分块上传失败 HTTP ${partR.status} @${offset}`);
      }
      offset = end;
      continue;
    }

    if (!partR.ok) {
      throw new Error(partText || `完成上传失败 HTTP ${partR.status}`);
    }

    const meta = parseFileResource(partText);
    if (!meta.uri || !meta.name) {
      throw new Error(partText || "完成上传后未返回 file.uri / file.name");
    }

    let state = meta.state ?? "UNKNOWN";
    let name = meta.name;
    let uri = meta.uri;

    const deadline = Date.now() + 5 * 60_000;
    while (state === "PROCESSING" && Date.now() < deadline) {
      onProgress?.({ phase: "wait", sent: byteSize, total: byteSize });
      await new Promise((r) => setTimeout(r, 2000));
      const polled = await getJson(
        workerBase,
        apiKey,
        `/gemini/file?name=${encodeURIComponent(name)}`,
      );
      const again = parseFileResource(polled);
      state = again.state ?? state;
      if (again.uri) uri = again.uri;
      if (again.name) name = again.name;
    }

    if (state === "FAILED") {
      throw new Error("Google 侧处理文件失败（FAILED）。请换格式或压缩后再试。");
    }
    if (state !== "ACTIVE") {
      throw new Error(`文件未就绪（state=${state}）。请稍后重试或缩小文件。`);
    }

    return { fileUri: uri, mimeType: meta.mimeType || mimeType, name };
  }

  throw new Error("上传未正常结束");
}
