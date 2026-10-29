import assert from "node:assert/strict";
import { mock } from "node:test";
import { attachLongPress } from "./long-press.ts";
import { settingsCli } from "./cli.ts";
import { createServer } from "node:http";
import { openDefaultFile } from "./default-app.ts";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { fileBasename, parseFileLink, formatSize } from "./links.ts";
import { filePathSchema, inspectFile, openFolder } from "./files.ts";
import revealFile, { fileManagerUris } from "./reveal-file.ts";
import { previewKind, textExcerpt } from "./preview.ts";
import { actionFor, actionIcon, commandArguments, configurationSchema, defaultConfiguration, expandCommand, toolIcons } from "./actions.ts";
import { launchTool } from "./launch-tool.ts";
import { settingsMessages } from "./settings-messages.ts";
import { getMessages, locales, resolveLocale } from "./messages.ts";

mock.timers.enable({ apis: ["setTimeout"] });
try {
  const root = new EventTarget();
  const anchor = root as unknown as HTMLAnchorElement;
  let verified = true;
  let holds = 0;
  const dispose = attachLongPress(root, node => verified && node === root ? anchor : null, () => { holds++; });
  const emit = (type: string, props = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerType: "touch", isPrimary: true, button: 0, pointerId: 1, clientX: 0, clientY: 0, detail: 1 }, props);
    root.dispatchEvent(event);
    return event.defaultPrevented;
  };
  emit("pointerdown"); mock.timers.tick(100); emit("pointerup"); mock.timers.tick(400);
  assert.equal(holds, 0); assert.equal(emit("click"), false);
  emit("pointerdown"); mock.timers.tick(400);
  assert.equal(holds, 1); assert.equal(emit("contextmenu"), true);
  emit("pointerup"); assert.equal(emit("click"), true); assert.equal(emit("click"), false);
  for (const cancellation of ["pointercancel", "scroll", "pointermove"]) {
    emit("pointerdown"); mock.timers.tick(200); emit(cancellation, { clientX: 11 }); mock.timers.tick(400);
    assert.equal(holds, 1);
  }
  for (const props of [{ pointerType: "mouse" }, { isPrimary: false }, { button: 2 }]) {
    emit("pointerdown", props); mock.timers.tick(400); assert.equal(holds, 1);
  }
  emit("pointerdown"); verified = false; mock.timers.tick(400);
  assert.equal(holds, 1); assert.equal(emit("contextmenu"), false);
  verified = true;
  emit("pointerdown"); mock.timers.tick(400); emit("pointerup");
  assert.equal(holds, 2); assert.equal(emit("click", { detail: 0 }), false);
  mock.timers.tick(1000); assert.equal(emit("click"), false);
  emit("pointerdown"); mock.timers.tick(400); emit("scroll"); mock.timers.tick(1000);
  assert.equal(emit("click"), false);
  emit("pointerdown"); dispose(); mock.timers.tick(400);
  assert.equal(holds, 3); assert.equal(emit("click"), false);
  emit("pointerdown"); mock.timers.tick(400); assert.equal(holds, 3);
  const disposeAgain = attachLongPress(root, node => node === root ? anchor : null, () => {});
  emit("pointerdown"); mock.timers.tick(400); emit("pointerup"); assert.equal(emit("click"), true);
  mock.timers.tick(100); emit("pointerdown"); mock.timers.tick(400);
  mock.timers.tick(600); emit("pointerup"); assert.equal(emit("click"), true);
  disposeAgain();
} finally { mock.timers.reset(); }

await assert.rejects(revealFile("relative.txt"), /Path must be absolute/);
for (const path of ["/tmp/O'Reilly.txt", '/tmp/a"b\\c #?%.txt', "/tmp/файл 🐈.txt", "/tmp/'], 'file:///other.txt", "/tmp/$(touch nope); `echo nope`.txt"]) {
  const uris = JSON.parse(fileManagerUris(path));
  assert.equal(uris.length, 1);
  assert.equal(fileURLToPath(uris[0]), normalize(path));
}

assert.equal(parseFileLink("file:///tmp/a%20b.md#L12-L20")?.path, "/tmp/a b.md");
assert.equal(parseFileLink("file:///tmp/a.md:12:3")?.path, "/tmp/a.md");
assert.equal(parseFileLink("file:///tmp/a%23b.md")?.path, "/tmp/a#b.md");
assert.equal(parseFileLink("file:///tmp/report%3A2026")?.path, "/tmp/report:2026");
assert.equal(parseFileLink("file:///tmp/report%3A2026:12:3")?.path, "/tmp/report:2026");
assert.equal(parseFileLink("file:///tmp/a%5Cb.txt")?.path, "/tmp/a\\b.txt");
for (const [suffix, location] of [
  ["#L12-L20", { kind: "range", startLine: 12, endLine: 20 }],
  ["#L12C3-L20C5", { kind: "range", startLine: 12, endLine: 20 }],
  ["#L12", { kind: "line", line: 12, column: null }],
  ["#L12C3", { kind: "line", line: 12, column: 3 }],
  [":12:3", { kind: "line", line: 12, column: 3 }],
  [":12-20", { kind: "range", startLine: 12, endLine: 20 }],
  [":12", { kind: "line", line: 12, column: null }],
  ["", null],
] as const) {
  assert.deepEqual(parseFileLink(`file:///tmp/demo.ts${suffix}`), { path: "/tmp/demo.ts", location });
}
assert.deepEqual(parseFileLink("file:///tmp/report%3A2026#L12"), {
  path: "/tmp/report:2026", location: { kind: "line", line: 12, column: null },
});
for (const suffix of ["#L0", "#L12C0", "#L20-L12", ":0", ":12:0", ":20-12", "#L9007199254740992"]) {
  assert.equal(parseFileLink(`file:///tmp/demo.ts${suffix}`), null);
}
for (const link of [null, "https://example.com/a.md", "file:///tmp/%00", "file:///tmp/%GG", "file:///tmp/a?q=x"]) {
  assert.equal(parseFileLink(link), null);
}
assert.equal(formatSize(0, "ru"), "0 Б");
assert.equal(formatSize(1024, "ru"), "1 КиБ");
assert.equal(formatSize(1024 ** 3, "ru"), "1 ГиБ");
for (const path of ["relative.md", "//server/file", "/tmp/a\0", "/tmp/a\n"]) assert.equal(filePathSchema.safeParse(path).success, false);
assert.equal(parseFileLink("file:///C:/Users/Sergey/My%20Files/%D1%84%D0%B0%D0%B9%D0%BB.txt#L12")?.path, "C:\\Users\\Sergey\\My Files\\файл.txt");
assert.equal(parseFileLink("file://server/share/My%20Files/file.txt")?.path, "\\\\server\\share\\My Files\\file.txt");
for (const path of ["C:\\Users\\Sergey\\file.txt", "D:/My Files/file.txt", "\\\\server\\share\\file.txt"]) {
  assert.equal(filePathSchema.safeParse(path).success, true);
  assert.equal(fileBasename(path), "file.txt");
}
for (const path of ["C:relative.txt", "\\relative.txt", "C:\\bad\u0000name.txt"]) assert.equal(filePathSchema.safeParse(path).success, false);
assert.equal(fileBasename("/tmp/файл.txt"), "файл.txt");
assert.equal(fileBasename("/tmp/a\\b.txt"), "a\\b.txt");
assert.equal(fileBasename("/"), "/");
for (const [language, expected] of [
  ["en-US", "en"], ["ru_RU", "ru"], ["ES-mx", "es"], ["ja-JP", "ja"], ["ko-KR", "ko"],
  ["zh-CN", "zh"], ["zh-Hans-SG", "zh"], ["zh-TW", "en"], ["zh-HK", "en"], ["zh-Hant-TW", "en"],
  ["fr-FR", "en"], ["", "en"], [" ru-RU ", "ru"],
] as const) assert.equal(resolveLocale(language), expected);
for (const locale of locales) {
  const catalog = getMessages(locale);
  assert.deepEqual(Object.keys(catalog).sort(), Object.keys(getMessages("en")).sort());
  assert.equal(catalog.sizeUnits.length, 5);
  for (const value of Object.values(catalog)) {
    assert.ok(typeof value === "string" ? value.trim().length > 0 : value.every(unit => unit.trim().length > 0));
  }
  assert.equal(formatSize(1024, locale), `1 ${catalog.sizeUnits[1]}`);
  assert.equal(formatSize(1.5 * 1024, locale), `${new Intl.NumberFormat(locale).format(1.5)} ${catalog.sizeUnits[1]}`);
}
assert.equal(previewKind("photo.PNG", 1024 * 1024)?.kind, "image");
assert.equal(previewKind("photo.png", 1024 * 1024 + 1), null);
assert.equal(previewKind("package.json", 64 * 1024)?.kind, "text");
assert.equal(previewKind("package.json", 64 * 1024 + 1), null);
assert.equal(previewKind("file.constructor", 10)?.kind, "text");
assert.equal(textExcerpt("a\n".repeat(20)).split("\n").length, 8);
assert.equal(textExcerpt("x".repeat(3000)).length, 2000);
const toolId = "b4bc94a0-9383-4e65-8e7b-ea50c165c1f2";
const config = configurationSchema.parse({ defaultAction: "folder", rules: [{ extensions: [".png"], action: "preview" }, { extensions: [".ts"], action: toolId }], tools: [{ id: toolId, name: "Editor", icon: "Code", command: 'code --goto "{path}:{line}:{column}"' }] });
assert.equal(actionFor(config, "/tmp/image.PNG"), "preview");
assert.equal(actionFor(config, "C:\\demo\\code.ts"), toolId);
assert.equal(actionFor(config, "/tmp/no-extension"), "folder");
assert.equal(actionFor(config, "/tmp/folder.png", true), "folder");
assert.equal(actionFor(defaultConfiguration, "/tmp/photo.png"), "external");
configurationSchema.parse(defaultConfiguration);
for (const path of ["/tmp/code.TS", "C:\\demo\\main.py", "/tmp/package.json", "/tmp/README.md", "/tmp/page.html"]) assert.equal(actionFor(defaultConfiguration, path), "preview");
for (const path of ["/tmp/video.mp4", "/tmp/report.pdf", "/tmp/archive.zip", "/tmp/unknown.xyz"]) assert.equal(actionFor(defaultConfiguration, path), "external");
assert.equal(actionFor(defaultConfiguration, "/tmp/code.ts", true), "folder");
{
  let saved = structuredClone(config);
  const cli = settingsCli(async () => structuredClone(saved), async value => { saved = configurationSchema.parse(value); return saved; });
  const call = (...args: string[]) => cli.run(args, { signal: new AbortController().signal });
  assert.equal((await call("settings", "show")).stdout, JSON.stringify(config));
  assert.equal((await call("settings", "default", "external")).exitCode, 0);
  assert.equal(saved.defaultAction, "external"); assert.deepEqual(saved.tools, config.tools); assert.deepEqual(saved.rules, config.rules);
  assert.equal((await call("settings", "rule", "set", ".TS,.py", "preview")).exitCode, 0);
  assert.equal(actionFor(saved, "/tmp/code.ts"), "preview"); assert.equal(actionFor(saved, "/tmp/code.py"), "preview");
  assert.equal(actionFor(saved, "/tmp/photo.png"), "preview"); assert.deepEqual(saved.tools, config.tools);
  const before = structuredClone(saved);
  for (const args of [["default", "unknown"], ["rule", "set", ".py,.py", "preview"], ["rule", "remove", "py"], ["set", "{}"], ["set", "not json"]]) {
    assert.notEqual((await call("settings", ...args)).exitCode, 0);
    assert.deepEqual(saved, before);
  }
  assert.equal((await call("settings", "rule", "remove", ".ts")).exitCode, 0);
  assert.equal(actionFor(saved, "/tmp/code.ts"), "external"); assert.equal(actionFor(saved, "/tmp/code.py"), "preview");
  assert.equal((await call("settings", "set", JSON.stringify(config))).exitCode, 0); assert.deepEqual(saved, config);
  assert.equal((await call("settings", "--help")).exitCode, 0);
}
assert.equal(actionIcon(config, toolId), "Code");
assert.equal(toolIcons.length, 24);
assert.deepEqual(commandArguments('"C:\\Program Files\\Editor\\editor.exe" "{path}"'), ['C:\\Program Files\\Editor\\editor.exe', "{path}"]);
assert.deepEqual(commandArguments("editor \"\" 'two words'"), ["editor", "", "two words"]);
assert.deepEqual(commandArguments(String.raw`editor --directory "C:\My Files\\" "{path}"`), ["editor", "--directory", "C:\\My Files\\", "{path}"]);
assert.deepEqual(commandArguments(String.raw`editor "a\"b" "a\\\"b" "a\\\\"`), ["editor", 'a"b', 'a\\"b', "a\\\\"]);
assert.deepEqual(commandArguments(String.raw`editor 'C:\My Files\'`), ["editor", "C:\\My Files\\"]);
assert.throws(() => commandArguments('editor "unfinished'));
assert.throws(() => commandArguments('"" arg'));
const tricky = "/tmp/space ' \"; $(touch nope) `echo nope` {line}.ts";
assert.deepEqual(expandCommand('code --goto "{path}:{line}:{column}"', tricky, 12, 3), ["code", "--goto", `${tricky}:12:3`]);
assert.deepEqual(expandCommand('editor "{path}" {line} {column}', "file"), ["editor", "file", "1", "1"]);
for (const invalid of [
  { ...config, defaultAction: "unknown" },
  { ...config, tools: [] },
  { ...config, rules: [...config.rules, { extensions: [".png"], action: "folder" }] },
  { ...config, rules: [{ extensions: ["png"], action: "folder" }] },
  { ...config, tools: [...config.tools, ...config.tools] },
  { ...config, tools: [{ ...config.tools[0], command: "editor" }] },
  { ...config, tools: [{ ...config.tools[0], command: 'editor "{path}' }] },
  { ...config, tools: [{ ...config.tools[0], icon: "unknown" }] },
]) assert.equal(configurationSchema.safeParse(invalid).success, false);
for (const locale of locales) assert.deepEqual(Object.keys(settingsMessages(locale)).sort(), Object.keys(settingsMessages("en")).sort());
assert.equal(actionFor(defaultConfiguration, "/tmp/folder.html", true), "folder");
const received: unknown[] = [];
const daemon = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  received.push({ method: request.method, url: request.url, body: JSON.parse(body) });
  if (received.length === 1) response.end('{"ok":true}');
  else if (received.length === 2) { response.statusCode = 400; response.setHeader("content-type", "text/plain"); response.end("No application is associated with this file"); }
  else { response.statusCode = 503; response.end(); }
});
await new Promise<void>(resolve => daemon.listen(0, "127.0.0.1", resolve));
try {
  const address = daemon.address();
  assert.ok(address && typeof address !== "string");
  const path = '/tmp/a " ; $(not-executed) файл.html';
  await openDefaultFile(path, address.port);
  assert.deepEqual(received[0], { method: "POST", url: "/open-in-target", body: { context: { kind: "local" }, path, targetId: "default-app", lineNumber: null, columnNumber: null } });
  await assert.rejects(openDefaultFile(path, address.port), { message: "No application is associated with this file" });
  await assert.rejects(openDefaultFile(path, address.port), { message: "BB Default App: HTTP 503" });
  await assert.rejects(openDefaultFile(path, 0));
  assert.equal(received.length, 3);
} finally { await new Promise<void>((resolve, reject) => daemon.close(error => error ? reject(error) : resolve())); }
const dir = await mkdtemp(join(tmpdir(), "bb-file-link-check-"));
try {
  await assert.rejects(launchTool("/bb-file-link-tool-does-not-exist {path}", dir));
  const output = join(dir, "tool result ' \"; $(not-a-command).txt");
  await launchTool(`"${process.execPath}" -e 'require("node:fs").writeFileSync(process.argv[1],"launched")' "{path}"`, output);
  let content: string | undefined;
  for (let i = 0; i < 100 && content === undefined; i++) {
    try { content = await readFile(output, "utf8"); }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; await new Promise(resolve => setTimeout(resolve, 20)); }
  }
  assert.equal(content, "launched");
  await rm(output);
  const file = join(dir, "кириллица with spaces.md");
  await writeFile(file, "hello");
  const fileInfo = await inspectFile(file, "en");
  assert.ok(fileInfo);
  assert.equal(fileInfo.size, 5);
  assert.equal(fileInfo.entries, null);
  assert.deepEqual(await inspectFile(dir, "en"), { size: null, directory: true, entries: null });
  await mkdir(join(dir, "nested"));
  await writeFile(join(dir, "nested", "not-counted.txt"), "nested");
  await writeFile(join(dir, ".hidden"), "hidden");
  await symlink(file, join(dir, "link"));
  assert.deepEqual((await inspectFile(dir, "en", true))?.entries, { files: 2, directories: 1, other: 1 });
  assert.equal((await inspectFile(file, "en", true))?.entries, null);
  for (const locale of locales) {
    for (const name of ["missing", "navigator.language", "www.rru"]) {
      assert.equal(await inspectFile(join(dir, name), locale), null);
    }
    assert.equal(await inspectFile(join(file, "child"), locale), null);
    await assert.rejects(openFolder(join(dir, "missing"), locale), { message: getMessages(locale).fileNotFound });
    await assert.rejects(inspectFile("relative.txt", locale));
  }
  await writeFile(join(dir, "navigator.language"), "real file");
  assert.equal((await inspectFile(join(dir, "navigator.language"), "en"))?.size, 9);
} finally { await rm(dir, { recursive: true }); }
console.log("File links, existence checks, preview limits, locales, sizes and errors: passed.");
