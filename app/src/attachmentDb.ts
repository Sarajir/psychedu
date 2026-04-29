import type { AttachmentMeta } from "./types";
import { newId } from "./storage";

const DB_NAME = "psychedu-attachments";
const DB_VERSION = 1;
const STORE = "attachments";

interface StoredRecord extends AttachmentMeta {
  blob: Blob;
}

/** Per-file limit (IndexedDB is per-origin; keep uploads reasonable). */
export const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;

/** Extensions + MIME types so Safari / Windows file picker reliably shows Office files */
export const ACCEPT_ATTR = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".txt",
  ".md",
  ".csv",
  ".rtf",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/rtf",
].join(",");

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "fileId" });
        os.createIndex("unitId", "unitId", { unique: false });
      }
    };
  });
}

export async function saveAttachment(
  unitId: string,
  file: File,
): Promise<AttachmentMeta> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `File too large (max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB).`,
    );
  }
  const meta: AttachmentMeta = {
    fileId: newId(),
    unitId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    byteSize: file.size,
    addedAt: new Date().toISOString(),
  };
  const record: StoredRecord = { ...meta, blob: file };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve(meta);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(STORE).put(record);
  });
}

export async function deleteAttachment(fileId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(STORE).delete(fileId);
  });
}

export async function deleteAllForUnit(unitId: string): Promise<void> {
  const metas = await listMetaForUnit(unitId);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const m of metas) store.delete(m.fileId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function listMetaForUnit(unitId: string): Promise<AttachmentMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const idx = store.index("unitId");
    const req = idx.getAll(unitId);
    req.onsuccess = () => {
      const rows = (req.result as StoredRecord[]) ?? [];
      db.close();
      resolve(
        rows.map(({ fileId, unitId: uid, name, mimeType, byteSize, addedAt }) => ({
          fileId,
          unitId: uid,
          name,
          mimeType,
          byteSize,
          addedAt,
        })),
      );
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function getBlob(fileId: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(fileId);
    req.onsuccess = () => {
      const row = req.result as StoredRecord | undefined;
      db.close();
      resolve(row?.blob ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
