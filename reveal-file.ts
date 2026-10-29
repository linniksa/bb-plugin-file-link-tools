// Adapted from reveal-file 0.1.2 by Sindre Sorhus; see LICENSE.reveal-file.
import process from "node:process";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { execFile as execFileCallback } from "node:child_process";

const execFile = promisify(execFileCallback);

export function fileManagerUris(filePath: string) {
  // gdbus parses GVariant, whose string-array syntax accepts this JSON encoding.
  return JSON.stringify([pathToFileURL(filePath).href]);
}

export default async function revealFile(filePath: string) {
  if (typeof filePath !== "string") {
    throw new TypeError(`Expected a string, got ${typeof filePath}`);
  }
  if (!path.isAbsolute(filePath)) throw new TypeError("Path must be absolute");

  if (process.platform === "darwin") {
    await execFile("open", ["--reveal", filePath]);
  } else if (process.platform === "win32") {
    const windowsPath = filePath.replaceAll("/", "\\");
    try {
      await execFile("explorer.exe", [`/select,"${windowsPath}"`]);
    } catch (error) {
      // Explorer also reports a successful selection with exit code 1.
      if (Number((error as NodeJS.ErrnoException).code) !== 1) throw error;
    }
  } else {
    await execFile("gdbus", [
      "call", "--session", "--dest", "org.freedesktop.FileManager1",
      "--object-path", "/org/freedesktop/FileManager1",
      "--method", "org.freedesktop.FileManager1.ShowItems",
      fileManagerUris(filePath), "",
    ]);
  }
}
