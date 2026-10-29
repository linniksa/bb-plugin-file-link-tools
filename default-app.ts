import { z } from "zod";

export async function openDefaultFile(path: string, daemonPort: number) {
  z.number().int().min(1).max(65535).parse(daemonPort);
  // shortcut: the SDK cannot select Default App; revalidate this BB daemon route on upgrades.
  const response = await fetch(`http://127.0.0.1:${daemonPort}/open-in-target`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ context: { kind: "local" }, path, targetId: "default-app", lineNumber: null, columnNumber: null }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new Error(message || `BB Default App: HTTP ${response.status}`);
  }
}
