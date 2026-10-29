import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { inspectFile, openFolder, filePathSchema } from "./files";
import { getMessages, locales, type Locale } from "./messages";
import { configurationSchema, defaultConfiguration } from "./actions";
import { launchTool } from "./launch-tool";
import { openDefaultFile } from "./default-app";

const target = z.object({ path: filePathSchema, threadId: z.string().min(1), locale: z.enum(locales) });
export const rpcContract = defineRpcContract({
  configuration: { input: z.object({}), output: configurationSchema },
  saveConfiguration: { input: configurationSchema, output: configurationSchema },
  openDefault: { input: target, output: z.object({ ok: z.literal(true) }) },
  runTool: {
    input: target.extend({ toolId: z.string().uuid(), line: z.number().int().positive().safe().optional(), column: z.number().int().positive().safe().optional() }),
    output: z.object({ ok: z.literal(true) }),
  },
  inspect: {
    input: target.extend({ includeSummary: z.boolean().default(false) }),
    output: z.object({ entries: z.object({ files: z.number().int().nonnegative(), directories: z.number().int().nonnegative(), other: z.number().int().nonnegative() }).nullable(), size: z.number().nonnegative().nullable(), directory: z.boolean(), hostId: z.string() }).nullable(),
  },
  openFolder: {
    input: target,
    output: z.object({ ok: z.literal(true) }),
  },
});

export default function plugin(bb: BbPluginApi) {
  bb.settings.define({ replaceDefaultClick: { type: "boolean", label: "Use configured file-link actions", description: "When disabled, BB handles clicks. Rules below remain saved.", default: true } });
  async function configuration() {
    const stored = await bb.storage.kv.get<unknown>("configuration");
    return stored === undefined ? structuredClone(defaultConfiguration) : configurationSchema.parse(stored);
  }
  async function saveConfiguration(value: unknown) {
    const config = configurationSchema.parse(value);
    await bb.storage.kv.set("configuration", config);
    bb.realtime.publish("configuration", null);
    return config;
  }
  async function requireLocalThread(threadId: string, locale: Locale) {
    const [thread, config] = await Promise.all([
      bb.sdk.threads.get({ threadId, include: "environment" }), bb.sdk.system.config(),
    ]);
    if (!config.primaryHostId || !("environment" in thread) || thread.environment?.hostId !== config.primaryHostId) {
      throw new Error(getMessages(locale).localThreadRequired);
    }
    return config.primaryHostId;
  }
  bb.rpc.register(rpcContract, {
    configuration: async () => configuration(),
    saveConfiguration,
    openDefault: async ({ path, threadId, locale }) => {
      await requireLocalThread(threadId, locale);
      const info = await inspectFile(path, locale);
      if (!info) throw new Error(getMessages(locale).fileNotFound);
      if (info.directory) throw new Error(getMessages(locale).filesOnly);
      const { hostDaemonPort } = await bb.sdk.system.config();
      if (!hostDaemonPort) throw new Error(getMessages(locale).openDefaultFailed);
      await openDefaultFile(path, hostDaemonPort);
      return { ok: true as const };
    },
    runTool: async ({ path, threadId, locale, toolId, line, column }) => {
      await requireLocalThread(threadId, locale);
      if (!await inspectFile(path, locale)) throw new Error(getMessages(locale).fileNotFound);
      const tool = (await configuration()).tools.find(tool => tool.id === toolId);
      if (!tool) throw new Error("Unknown tool");
      await launchTool(tool.command, path, line, column);
      return { ok: true as const };
    },
    inspect: async ({ path, threadId, locale, includeSummary }) => {
      const hostId = await requireLocalThread(threadId, locale);
      const info = await inspectFile(path, locale, includeSummary);
      return info ? { ...info, hostId } : null;
    },
    openFolder: async ({ path, threadId, locale }) => {
      await requireLocalThread(threadId, locale);
      await openFolder(path, locale);
      return { ok: true as const };
    },
  });
}
