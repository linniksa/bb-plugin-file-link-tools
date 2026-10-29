import { cliCommand, defineCli, PluginCliError } from "@get-bb/plugin-sdk";
import { configurationSchema, type Configuration } from "./actions.ts";

export function settingsCli(read: () => Promise<Configuration>, save: (value: unknown) => Promise<Configuration>) {
  const output = (config: Configuration) => ({ exitCode: 0, stdout: JSON.stringify(config) });
  async function write(value: unknown) {
    const parsed = configurationSchema.safeParse(value);
    if (!parsed.success) throw new PluginCliError(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "), { code: "invalid_configuration" });
    return output(await save(parsed.data));
  }
  return defineCli({
    name: "file-link-tools", summary: "Read or change file-link actions and custom tools",
    commands: {
      "settings show": cliCommand({ summary: "Show current configuration", async run() { return output(await read()); } }),
      "settings set": cliCommand({
        summary: "Replace configuration with validated JSON; read first to preserve unrelated settings",
        positionals: [{ name: "json", description: "Full configuration JSON, including rules and tools", required: true }],
        async run(input) {
          let value: unknown;
          try { value = JSON.parse(input.positionals.json); }
          catch { throw new PluginCliError("Invalid JSON", { code: "invalid_configuration" }); }
          return write(value);
        },
      }),
      "settings default": cliCommand({
        summary: "Set the action for files without an extension rule",
        positionals: [{ name: "action", description: "preview, external, folder, or a saved tool UUID", required: true }],
        async run(input) { return write({ ...await read(), defaultAction: input.positionals.action }); },
      }),
      "settings rule set": cliCommand({
        summary: "Set an action for comma-separated extensions, preserving other rules",
        positionals: [
          { name: "extensions", description: "Comma-separated extensions, e.g. .ts,.py", required: true },
          { name: "action", description: "preview, external, folder, or a saved tool UUID", required: true },
        ],
        async run(input) {
          const config = await read();
          const extensions = input.positionals.extensions.toLowerCase().split(",").map(ext => ext.trim());
          const rules = config.rules.map(rule => ({ ...rule, extensions: rule.extensions.filter(ext => !extensions.includes(ext)) })).filter(rule => rule.extensions.length);
          return write({ ...config, rules: [...rules, { extensions, action: input.positionals.action }] });
        },
      }),
      "settings rule remove": cliCommand({
        summary: "Remove rules for comma-separated extensions",
        positionals: [{ name: "extensions", description: "Comma-separated extensions, e.g. .ts,.py", required: true }],
        async run(input) {
          const config = await read();
          const extensions = input.positionals.extensions.toLowerCase().split(",").map(ext => ext.trim());
          const parsed = configurationSchema.safeParse({ ...config, rules: [{ extensions, action: config.defaultAction }] });
          if (!parsed.success) throw new PluginCliError("Use unique extensions such as .ts,.py", { code: "invalid_configuration" });
          const remove = parsed.data.rules[0].extensions;
          if (!config.rules.some(rule => rule.extensions.some(ext => remove.includes(ext)))) throw new PluginCliError("No matching extension rules", { code: "rule_not_found" });
          return write({ ...config, rules: config.rules.map(rule => ({ ...rule, extensions: rule.extensions.filter(ext => !remove.includes(ext)) })).filter(rule => rule.extensions.length) });
        },
      }),
    },
  });
}
