/** Infer MIME from File.type + extension (handles empty type on some OS). */
export function inferMime(file: File): string {
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

export function isOfficeDocumentMime(m: string): boolean {
  return (
    m === "application/msword" ||
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    m === "application/vnd.ms-powerpoint" ||
    m === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    m === "application/vnd.openxmlformats-officedocument.presentationml.slideshow"
  );
}

export function isBinaryMultimodal(mime: string): boolean {
  return (
    mime === "application/pdf" ||
    mime.startsWith("image/") ||
    isOfficeDocumentMime(mime)
  );
}

export function isPlainTextLikeMime(mime: string, fileName: string): boolean {
  return (
    mime === "text/plain" ||
    mime === "text/markdown" ||
    mime === "text/csv" ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".txt")
  );
}
