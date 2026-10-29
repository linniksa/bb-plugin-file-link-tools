---
name: file-link-tools
description: Configure File Link Tools actions and custom tools, or troubleshoot file-link cards and BB menus.
---

# File Link Tools

To change settings, read `bb file-link-tools settings show`, then use `settings default`, `settings rule set/remove`, or `settings set '<json>'` for the full configuration, preserving unrelated values. Actions: `preview` (BB side panel), `external` (Default App), `folder`, or a saved tool UUID; command syntax: `bb file-link-tools --help`.

Hover or focus an existing file link in a chat message to see metadata and previews. Missing and unverified paths keep BB’s original click handler; BB still owns Markdown autolinking. Confirmed visible links persistently show their click action, including custom-tool icons. Native icons are restored on plugin disposal. Visible paths are checked once per mounted thread view; revealing and custom launching recheck existence.

Settings → File Link Tools contains the default click action, extension rules, and custom tools with icon and command. The `replaceDefaultClick` switch enables these actions; disabled means native BB clicks. Fresh defaults open code and text in BB’s side panel, other files in BB’s Default App; folders always use the file manager. Configuration is stored in BB KV through validated RPC and synchronized with BB realtime. Preview uses BB navigation, reveal uses the reveal launcher, and Default App uses BB’s local daemon target `default-app`, with primary-host and file checks. It must not use the preferred-editor SDK action. Custom commands are split into arguments before placeholder substitution and run without a shell, using only a server-stored tool ID. See the [reference](../../docs/reference.md) for command syntax, placeholders and platform limits.

The card shows the path tail on one line. Copy buttons sit beside the name and path; the lower toolbar offers the other built-in actions and BB’s native menu. Small image and text previews use BB’s file-reading API and SourceCode component; limits are in the [reference](../../docs/reference.md). Modified clicks and the original context menu remain available. Down Arrow enters card actions; Escape closes the card and returns keyboard focus. Pointer movement must not replace a card containing keyboard focus; hover or focus in its interaction region keeps it open.

The card's “Меню BB” action opens the original BB context menu. BB owns the installed-app list and app launching. Do not add a second app registry or copy BB's discovery logic into this plugin.

Touch links support long press; see the [reference](../../docs/reference.md) for timing and cancellation rules. Verify that a short tap still opens normally and releasing a held link does not also open it. Unknown links keep native handling.

File metadata and revealing require local threads on the primary server host. Remote threads show an explicit error for these actions. Platform launching uses the local `reveal-file.ts`; see the [reference](../../docs/reference.md) for its origin, license, support, and verification limits. Folder cards count first-level files, subfolders and other entries, including hidden entries, without following nested symbolic links or calculating recursive disk usage. Only rendered `file://` links inside timeline messages are enhanced.

The card mounts through the public thread-header slot so BB supplies the thread’s file-viewer context; each instance handles only that thread’s links. It uses public RPC APIs, plus BB's existing link DOM and context-menu event. There is no public link-decoration slot. Changes to BB's timeline attributes or context-menu behavior require revalidation. Reload and disable must remove the card, listeners, timers, and accessibility attributes.

Plugin-owned strings and locale selection belong in `messages.ts`; supported languages and detection are documented in the [reference](../../docs/reference.md). Pass the client locale to both RPC methods. Leave BB-owned menus and application names unchanged. Build and verification commands are in the [reference](../../docs/reference.md).
