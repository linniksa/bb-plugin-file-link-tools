import { getMessages, type Locale } from "./messages.ts";
import type { ExperimentalFileLocation } from "@get-bb/plugin-sdk/app";

export type ParsedFileLink = { path: string; location: ExperimentalFileLocation | null };

export function parseFileLink(href: string | null): ParsedFileLink | null {
  if (!href) return null;
  try {
    if (!href.startsWith("file://")) return null;
    const url = new URL(href);
    if (url.search) return null;
    const hash = url.hash.match(/^#L(\d+)(?:C(\d+))?(?:-L?(\d+)(?:C\d+)?)?$/u);
    const suffix = url.hash ? null : url.pathname.match(/:(\d+)(?::(\d+)|-(\d+))?$/u);
    const position = hash ?? suffix;
    let location: ExperimentalFileLocation | null = null;
    if (position) {
      const line = Number(position[1]);
      const column = position[2] === undefined ? null : Number(position[2]);
      const endLine = position[3] === undefined ? null : Number(position[3]);
      if (![line, column, endLine].every(value => value === null || (Number.isSafeInteger(value) && value > 0))
        || (endLine !== null && endLine < line)) return null;
      location = endLine === null ? { kind: "line", line, column } : { kind: "range", startLine: line, endLine };
    }
    const decoded = decodeURIComponent(suffix ? url.pathname.slice(0, suffix.index) : url.pathname);
    if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\x00-\x1f\x7f]/u.test(decoded)) return null;
    const path = url.hostname ? `\\\\${url.hostname}${decoded.replaceAll("/", "\\")}`
      : /^\/[a-z]:\//iu.test(decoded) ? decoded.slice(1).replaceAll("/", "\\") : decoded;
    return { path, location };
  } catch {
    return null;
  }
}

export function fileBasename(path: string): string {
  const separator = /^[a-z]:[\\/]|^\\\\/iu.test(path) ? /[\\/]/u : /\//u;
  return path.split(separator).filter(Boolean).at(-1) ?? "/";
}

export function formatSize(bytes: number, locale: Locale): string {
  const units = getMessages(locale).sizeUnits;
  const unit = bytes === 0 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(bytes / 1024 ** unit)} ${units[unit]}`;
}
