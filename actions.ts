import { z } from "zod";
import { fileBasename } from "./links.ts";

export const toolIcons = ["Code", "Terminal", "ExternalLink", "Eye", "FolderOpen", "File", "Image", "Video", "Music", "Type", "Braces", "AppWindow", "Globe", "Database", "Server", "Box", "Archive", "GitBranch", "Wrench", "Settings", "Play", "Zap", "Star", "Search"] as const;
export type ToolIcon = (typeof toolIcons)[number];
export const builtInActions = ["folder", "preview", "external"] as const;
export type Action = string;

export function commandArguments(command: string): string[] {
  const args: string[] = [];
  let token = "", quote = "", started = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote && char === quote) { quote = ""; continue; }
    if (!quote && (char === '"' || char === "'")) { quote = char; started = true; continue; }
    if (quote === '"' && char === "\\") {
      let end = i;
      while (command[end] === "\\") end++;
      if (command[end] === '"') {
        const count = end - i;
        token += "\\".repeat(Math.floor(count / 2));
        if (count % 2) token += '"';
        else quote = "";
        i = end;
        continue;
      }
    }
    if (!quote && /\s/u.test(char)) {
      if (started) { args.push(token); token = ""; started = false; }
    } else { token += char; started = true; }
  }
  if (quote) throw new Error("Unclosed quote in command");
  if (started) args.push(token);
  if (!args[0]) throw new Error("An executable is required");
  return args;
}

const toolSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(80), icon: z.enum(toolIcons),
  command: z.string().trim().min(1).max(4096).refine(value => !/[\x00-\x1f\x7f]/u.test(value), "Use a single-line command")
    .superRefine((value, ctx) => {
      try { commandArguments(value); } catch (error) { ctx.addIssue({ code: "custom", message: (error as Error).message }); }
      if (!value.includes("{path}")) ctx.addIssue({ code: "custom", message: "Include {path} in the command" });
    }),
});
export const configurationSchema = z.object({
  defaultAction: z.string(),
  rules: z.array(z.object({ extensions: z.array(z.string().regex(/^\.[a-z0-9]+$/u, "Use lowercase extensions such as .png")).min(1).max(50), action: z.string() })).max(50),
  tools: z.array(toolSchema).max(50),
}).superRefine((config, ctx) => {
  const ids = new Set<string>(builtInActions);
  config.tools.forEach((tool, index) => {
    if (ids.has(tool.id)) ctx.addIssue({ code: "custom", path: ["tools", index, "id"], message: "Duplicate tool" });
    ids.add(tool.id);
  });
  if (!ids.has(config.defaultAction)) ctx.addIssue({ code: "custom", path: ["defaultAction"], message: "Unknown action" });
  const seen = new Set<string>();
  config.rules.forEach((rule, index) => {
    if (!ids.has(rule.action)) ctx.addIssue({ code: "custom", path: ["rules", index, "action"], message: "Unknown action" });
    rule.extensions.forEach(ext => {
      if (seen.has(ext)) ctx.addIssue({ code: "custom", path: ["rules", index, "extensions"], message: `Duplicate extension: ${ext}` });
      seen.add(ext);
    });
  });
});
export type Configuration = z.infer<typeof configurationSchema>;
export const defaultConfiguration: Configuration = { defaultAction: "external", rules: [], tools: [] };

export function actionFor(config: Configuration, path: string, directory = false): Action {
  if (directory) return "folder";
  const name = fileBasename(path).toLowerCase();
  const extension = name.slice(name.lastIndexOf("."));
  return config.rules.find(rule => rule.extensions.includes(extension))?.action ?? config.defaultAction;
}
export function actionIcon(config: Configuration, action: Action): ToolIcon {
  if (action === "folder") return "FolderOpen";
  if (action === "preview") return "Eye";
  if (action === "external") return "ExternalLink";
  const tool = config.tools.find(tool => tool.id === action);
  if (!tool) throw new Error("Unknown action");
  return tool.icon;
}

export function expandCommand(command: string, path: string, line = 1, column = 1) {
  const values = { path, line: String(line), column: String(column) };
  return commandArguments(command).map(arg => arg.replace(/\{(path|line|column)\}/gu, (_, key: keyof typeof values) => values[key]));
}
