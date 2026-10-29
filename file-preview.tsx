import { useEffect, useState } from "react";
import { experimental_SourceCode as SourceCode, useSdk } from "@get-bb/plugin-sdk/app";
import { getMessages, type Locale } from "./messages";
import { previewKind, textExcerpt } from "./preview";

export function FilePreview({ path, size, hostId, locale }: { path: string; size: number; hostId: string; locale: Locale }) {
  const sdk = useSdk();
  const messages = getMessages(locale);
  const [preview, setPreview] = useState<{ kind: "image" | "text" | "error"; content: string } | null>(null);
  useEffect(() => {
    setPreview(null);
    const kind = previewKind(path, size);
    if (!kind) return;
    const controller = new AbortController();
    void sdk.files.read({ hostId, path, signal: controller.signal }).then(file => {
      if (controller.signal.aborted || file.sizeBytes > kind.limit) return;
      if (kind.kind === "image" && file.contentEncoding === "base64") {
        setPreview({ kind: "image", content: `data:${kind.mimeType};base64,${file.content}` });
      } else if (kind.kind === "text" && file.contentEncoding === "utf8" && !file.content.includes("\0")) {
        setPreview({ kind: "text", content: textExcerpt(file.content) });
      }
    }, cause => {
      if (!controller.signal.aborted) setPreview({ kind: "error", content: `${messages.previewFailed}: ${cause instanceof Error ? cause.message : String(cause)}` });
    });
    return () => controller.abort();
  }, [sdk, path, size, hostId, messages.previewFailed]);

  if (!preview) return null;
  if (preview.kind === "error") return <p className="mt-2 text-xs text-destructive" role="alert">{preview.content}</p>;
  return <div className="mt-2 max-h-28 overflow-hidden rounded border border-border" aria-label={messages.preview}>
    {preview.kind === "image" ? <img src={preview.content} alt={messages.preview} className="max-h-28 w-full object-contain"
      onError={() => setPreview({ kind: "error", content: messages.previewFailed })} />
      : <SourceCode content={preview.content} path={path} className="text-xs" />}
  </div>;
}
