import { useRef, useState } from "react";
import type { AttachmentMeta } from "../types";
import {
  ACCEPT_ATTR,
  MAX_ATTACHMENT_BYTES,
  deleteAttachment,
  formatBytes,
  getBlob,
  saveAttachment,
} from "../attachmentDb";

interface Props {
  unitId: string;
  attachments: AttachmentMeta[];
  onChange: (next: AttachmentMeta[]) => void;
  /** Hide upload UI during closed-book recall. */
  allowUpload?: boolean;
  compact?: boolean;
}

export function AttachmentPanel({
  unitId,
  attachments,
  onChange,
  allowUpload = true,
  compact = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      const next = [...attachments];
      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError(
            `${file.name}: max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB per file.`,
          );
          continue;
        }
        const meta = await saveAttachment(unitId, file);
        next.push(meta);
      }
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function remove(fileId: string) {
    setError(null);
    try {
      await deleteAttachment(fileId);
      onChange(attachments.filter((a) => a.fileId !== fileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed.");
    }
  }

  async function openFile(fileId: string) {
    const blob = await getBlob(fileId);
    if (!blob) {
      setError("File missing from storage (maybe cleared site data).");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function downloadFile(fileId: string, name: string) {
    const blob = await getBlob(fileId);
    if (!blob) {
      setError("File missing from storage.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="label mb-0">Source documents</div>
          {!compact && (
            <p className="text-xs text-ink-500 mt-0.5">
              PDF, slides, notes (local only — stored in this browser&rsquo;s
              IndexedDB).
            </p>
          )}
        </div>
        {allowUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept={ACCEPT_ATTR}
              onChange={onPickFiles}
            />
            <button
              type="button"
              className="btn-outline text-xs"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Uploading…" : "Upload files"}
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2 py-1.5">
          {error}
        </p>
      )}

      {attachments.length === 0 ? (
        <p className="text-xs text-ink-500">
          {allowUpload
            ? "No files yet. Optional — add slides or a PDF to open during Compare."
            : "No documents attached to this unit."}
        </p>
      ) : (
        <ul className="divide-y divide-ink-100 border border-ink-100 rounded-lg overflow-hidden bg-white">
          {attachments.map((a) => (
            <li
              key={a.fileId}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium text-ink-900 truncate">{a.name}</div>
                <div className="text-xs text-ink-500">
                  {formatBytes(a.byteSize)}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className="btn-ghost text-xs px-2 py-1"
                  onClick={() => openFile(a.fileId)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs px-2 py-1"
                  onClick={() => downloadFile(a.fileId, a.name)}
                >
                  Save as…
                </button>
                {allowUpload && (
                  <button
                    type="button"
                    className="btn-ghost text-xs px-2 py-1 text-rose-600 hover:bg-rose-50"
                    onClick={() => remove(a.fileId)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
