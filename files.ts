import { opendir, stat } from "node:fs/promises";
import { posix, win32 } from "node:path";
import revealFile from "./reveal-file.ts";
import { z } from "zod";
import { getMessages, type Locale } from "./messages.ts";

export const filePathSchema = z.string().min(1).max(32768)
  .refine((path) => !/[\x00-\x1f\x7f]/u.test(path)
    && ((posix.isAbsolute(path) && !path.startsWith("//"))
      || (/^[a-z]:[\\/]/iu.test(path) && win32.isAbsolute(path))
      || /^\\\\[^\\/]+\\[^\\/]+/u.test(path)), getMessages("en").absolutePathRequired);

export async function inspectFile(path: string, locale: Locale, includeSummary = false) {
  const messages = getMessages(locale);
  filePathSchema.parse(path);
  try {
    const info = await stat(path);
    if (!info.isFile() && !info.isDirectory()) throw new Error(messages.regularFilesOnly);
    let entries: { files: number; directories: number; other: number } | null = null;
    if (includeSummary && info.isDirectory()) {
      entries = { files: 0, directories: 0, other: 0 };
      for await (const entry of await opendir(path)) {
        if (entry.isFile()) entries.files++;
        else if (entry.isDirectory()) entries.directories++;
        else entries.other++;
      }
    }
    return { size: info.isDirectory() ? null : info.size, directory: info.isDirectory(), entries };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    if (code === "EACCES" || code === "EPERM") throw new Error(messages.permissionDenied, { cause: error });
    throw error;
  }
}

export async function openFolder(path: string, locale: Locale) {
  if (!await inspectFile(path, locale)) throw new Error(getMessages(locale).fileNotFound);
  await revealFile(path);
}
