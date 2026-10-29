export function previewKind(path: string, size: number) {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  const imageTypes: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon",
  };
  const mimeType = Object.hasOwn(imageTypes, extension) ? imageTypes[extension] : undefined;
  if (mimeType) return size <= 1024 * 1024 ? { kind: "image" as const, mimeType, limit: 1024 * 1024 } : null;
  return size <= 64 * 1024 ? { kind: "text" as const, limit: 64 * 1024 } : null;
}

export function textExcerpt(content: string) {
  return content.split("\n", 9).slice(0, 8).join("\n").slice(0, 2000);
}
