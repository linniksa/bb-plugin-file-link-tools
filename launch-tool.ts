import { spawn } from "node:child_process";
import { expandCommand } from "./actions.ts";

export async function launchTool(command: string, path: string, line?: number, column?: number) {
  const [executable, ...args] = expandCommand(command, path, line, column);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: "ignore", detached: true, windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}
