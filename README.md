# File Link Tools

A BB plugin that adds a compact localized file hover card and opens linked items with configurable actions on a normal click (code and text in BB’s side panel; other files in Default App). Application selection uses the existing BB file-link context menu. Cards require a confirmed existing file or folder. Clicks are overridden only while that link is confirmed; missing and unverified paths keep BB’s original click handling. Visible links are checked once per path while the thread view is mounted. Confirmed links keep a folder icon for revealing or an eye icon for BB preview even when the card is closed; native icons are restored when the plugin unmounts. File operations recheck existence before revealing. BB’s own Markdown autolinking is unchanged.

## Development

Requires Node.js 22.6+ and BB 0.47+ with Plugin SDK 0.6.79+.

- Install dependencies: `npm ci --include=dev`
- Type check: `npm run check`
- Self-check: `npm test`
- Build: `npm run build`
- Install: `bb plugin install .`
- Reload after building: `bb plugin reload file-link-tools`

[Behavior and operating constraints](skills/file-link-tools/SKILL.md).

File revealing is maintained locally in [`reveal-file.ts`](reveal-file.ts), adapted from [`reveal-file` 0.1.2](https://github.com/sindresorhus/reveal-file) under its [MIT license](LICENSE.reveal-file). Linux URI encoding and GVariant argument serialization are corrected locally. Platforms are native macOS, Windows, and Linux with a supported D-Bus file manager; WSL interoperability is not implemented. Windows drive paths, UNC paths, spaces, and Cyrillic names have parser checks; real Windows and Linux GUI execution has not been verified in this workspace.

Folder cards count immediate files, subfolders and other entries (including symbolic links), including hidden entries. This summary does not recurse and is read only when opening a card.

On touchscreens, hold a verified file link for 400 ms to open its card. Moving more than 10 CSS pixels, scrolling, or cancelling the pointer cancels the gesture. A short tap keeps the normal link action; releasing after a hold does not open the file. The card stays open until an outside tap, page scroll, or Escape.

## File actions and custom tools

Open **Settings → File Link Tools** to choose the default action, add extension rules, and configure custom tools. The existing switch enables the configured click actions; disabling it preserves BB’s native click behavior. New installations open common code and text extensions in BB’s side panel; other files use Default App. Saved rules remain unchanged on upgrade. Folders always use the file manager.

Agents can read and change the same configuration with `bb file-link-tools`; see `bb file-link-tools --help`.

Built-in actions are **Show in folder**, **Preview in BB**, and **Default application**. The last invokes BB’s host daemon with `targetId: "default-app"`, using the system file association instead of BB’s preferred editor. The daemon must be available; failures stay explicit. This local daemon route is not exposed as a target selector in the Plugin SDK and must be revalidated on BB upgrades. Each extension has one rule, matches without case sensitivity, and overrides the default. Save applies to all clients through BB realtime; unsaved edits stay local. Concurrent saves use the last saved configuration; the editor warns when another client changes it.

Custom tools have a name, one of 24 BB icons, and a single-line command. Quote arguments containing spaces. `{path}`, `{line}`, and `{column}` are substituted after splitting the command into arguments, without shell expansion. Line and column default to 1; a range uses its start line. On Windows, use an executable or explicitly name an interpreter for `.cmd`/`.bat` scripts. The plugin launches only saved tools by ID, rechecks the file and local host, and reports process-start errors; it does not wait for a GUI application's eventual exit.

Configuration is validated on the server and stored in BB’s namespaced plugin KV store. There are at most 50 rules and 50 tools. App discovery and the native BB menu remain owned by BB.

## Hover previews

The card offers BB’s built-in viewer through the public file-preview navigation API, preserving line and range locations. Small raster images (up to 1 MiB) and text files (up to 64 KiB, first eight lines and at most 2,000 characters) also have an inline preview. Content comes from `useSdk().files.read`; text uses BB’s SourceCode viewer. Binary, oversized and unsupported content has no inline preview. Pending reads are cancelled when the card closes; read and image-decoding failures remain visible.

## Translation

Plugin-owned UI strings live in `messages.ts`. The language is selected from the client's `navigator.language` and updates on `languagechange`. Supported languages match Orca's built-in set (English, Simplified Chinese, Korean, Japanese, Spanish), plus the plugin's existing Russian. Regional tags select their base language. Unsupported languages and Traditional Chinese locales use English, matching Orca's locale policy. Numbers use the selected locale; RPC requests carry that locale for expected file-operation errors. Unexpected system errors retain their original diagnostic text.

BB owns its menus and their translations. Its native plugin-setting label remains English because the installed SDK accepts only a static server-defined label. The proposed shared locale API in [BB issue #3721](https://github.com/get-bb/bb/issues/3721) is not part of the installed SDK; the plugin does not add a separate locale setting.

## BB UI components

Button and Tooltip source is vendored from the [BB 0.47.1 registry](https://github.com/get-bb/bb/tree/desktop-v0.47.1/packages/plugin-registry/r), under [BB’s license](LICENSE.BB). Their runtime primitives are supplied by BB. Unused helpers are omitted; tooltip focus detection uses native `:focus-visible` to avoid persistent document listeners.
