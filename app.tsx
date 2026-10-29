import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { definePluginApp, experimental_copyToClipboard, experimental_Icon as Icon, useBbNavigate, useRpc, useSettings, type PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { fileBasename, parseFileLink, formatSize, type ParsedFileLink } from "./links";
import { getMessages, type Messages } from "./messages";
import { Button, type ButtonProps } from "./components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { usePortalScopeProps } from "./lib/portal-scope";
import { FilePreview } from "./file-preview";
import { LinkActionIcon } from "./link-action-icon";
import { useFileLinks } from "./use-file-links";
import { actionFor, actionIcon, builtInActions, type Action } from "./actions";
import { FileLinkSettings } from "./settings";
import { useConfiguration } from "./use-configuration";
import { useLocale } from "./use-locale";

type ActiveLink = ParsedFileLink & { anchor: HTMLAnchorElement; threadId: string };
type Info = { size: number | null; directory: boolean; hostId: string; entries: { files: number; directories: number; other: number } | null };
function ActionButton({ label, lang, className = "", ...props }: ButtonProps & { label: string }) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <Button type="button" variant="ghost" size="icon" aria-label={label} lang={lang}
        className={`h-8 w-8 shrink-0 pointer-coarse:h-11 pointer-coarse:w-11 ${className}`} {...props} />
    </TooltipTrigger>
    <TooltipContent data-file-link-tools-tooltip lang={lang}>{label}</TooltipContent>
  </Tooltip>;
}

async function copy(text: string, messages: Messages) {
  if (await experimental_copyToClipboard({ text })) toast.success(messages.copied);
  else toast.error(messages.copyFailed);
}

function FileLinkOverlay({ threadId: ownerThreadId }: PluginThreadHeaderActionProps) {
  const locale = useLocale();
  const messages = getMessages(locale);
  const { config, error: configError } = useConfiguration();
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const { values } = useSettings();
  const replaceDefaultClick = values?.replaceDefaultClick === true;
  const id = useId();
  const portalScope = usePortalScopeProps();
  const card = useRef<HTMLDivElement>(null);
  const current = useRef<ActiveLink | null>(null);
  const inspectLink = useCallback(async (path: string) => await rpc.call("inspect", { path, threadId: ownerThreadId, locale }), [rpc, ownerThreadId, locale]);
  const { anchors, verified } = useFileLinks(ownerThreadId, inspectLink);
  const menuRequested = useRef(false);
  const [active, setActive] = useState<ActiveLink | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: Action, target: ActiveLink, hostId: string) {
    setBusy(true);
    try {
      const file = { target: { kind: "host" as const, hostId, path: target.path }, location: target.location };
      if (action === "folder") await rpc.call("openFolder", { path: target.path, threadId: target.threadId, locale });
      else if (action === "preview") {
        if (!navigate.experimental_openFilePreview(file)) throw new Error(messages.openPreviewFailed);
      } else if (action === "external") {
        await rpc.call("openDefault", { path: target.path, threadId: target.threadId, locale });
      } else {
        const location = target.location;
        await rpc.call("runTool", { path: target.path, threadId: target.threadId, locale, toolId: action,
          ...(location ? { line: location.kind === "range" ? location.startLine : location.line, column: location.kind === "line" ? location.column ?? 1 : 1 } : {}),
        });
      }
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    setActive(null);
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    function hide() {
      if (menuRequested.current && document.querySelector('[role="menu"]')) return;
      clearTimeout(showTimer); clearTimeout(hideTimer);
      menuRequested.current = false;
      current.current = null;
      setActive(null);
    }
    function targetFor(node: EventTarget | null): ActiveLink | null {
      if (!(node instanceof Element)) return null;
      const anchor = node.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.closest("[data-file-link-tools]")) return null;
      // shortcut: BB exposes no link-decoration slot; revisit when a public slot is available.
      const link = parseFileLink(anchor.getAttribute("href"));
      const threadId = anchor.closest("[data-timeline-row-id]")?.getAttribute("data-timeline-row-id")?.split(":")[0];
      return link && threadId === ownerThreadId ? { anchor, ...link, threadId } : null;
    }
    function show(target: ActiveLink) {
      clearTimeout(hideTimer);
      if (current.current?.anchor === target.anchor) return;
      clearTimeout(showTimer);
      current.current = target;
      setActive(null);
      showTimer = setTimeout(() => {
        setInfo(null); setError(null);
        void rpc.call("inspect", { path: target.path, threadId: target.threadId, locale, includeSummary: true }).then(
          (value) => {
            if (current.current !== target) return;
            if (!value) { current.current = null; return; }
            setInfo(value); setActive(target);
          },
          (cause) => {
            if (current.current !== target) return;
            setError(cause instanceof Error ? cause.message : String(cause)); setActive(target);
          },
        );
      }, 250);
    }
    function insideCard(node: EventTarget | null) {
      return node instanceof Node && (card.current?.contains(node)
        || (node instanceof Element && node.closest("[data-file-link-tools-tooltip]")));
    }
    function enter(event: Event) {
      const node = event.target;
      if (insideCard(node) || (current.current && node instanceof Element && node.closest('[role="menu"]'))) {
        clearTimeout(hideTimer);
        return;
      }
      const target = targetFor(node);
      if (target && !(event.type === "pointerover" && card.current?.contains(document.activeElement))) show(target);
    }
    function leave(event: Event) {
      const node = event.target;
      if (!(node instanceof Node) || !(current.current?.anchor.contains(node) || insideCard(node)
        || (menuRequested.current && node instanceof Element && node.closest('[role="menu"]')))) return;
      const related = (event as MouseEvent | FocusEvent).relatedTarget;
      if (related instanceof Node && (current.current?.anchor.contains(related) || insideCard(related))) return;
      if (current.current && related instanceof Element && related.closest('[role="menu"]')) return;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (current.current?.anchor.contains(document.activeElement) || card.current?.contains(document.activeElement)
          || current.current?.anchor.matches(":hover") || card.current?.matches(":hover")
          || document.querySelector("[data-file-link-tools-tooltip]:hover")) return;
        hide();
      }, 200);
    }
    function click(event: MouseEvent) {
      if (!replaceDefaultClick || !config) return;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = targetFor(event.target);
      if (!target) return;
      const confirmed = verified.current.get(target.anchor);
      if (!confirmed || confirmed.path !== target.path) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void run(actionFor(config, target.path, confirmed.directory), target, confirmed.hostId);
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && current.current) {
        const anchor = current.current.anchor;
        const restoreFocus = card.current?.contains(document.activeElement);
        if (restoreFocus) anchor.focus();
        hide();
      } else if (event.key === "ArrowDown" && current.current?.anchor === document.activeElement && card.current) {
        event.preventDefault();
        card.current.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      }
    }
    function scroll(event: Event) {
      if (insideCard(event.target)) return;
      hide();
    }
    document.addEventListener("pointerover", enter);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusin", enter);
    document.addEventListener("focusout", leave);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", scroll, true);
    return () => {
      clearTimeout(showTimer); clearTimeout(hideTimer); current.current = null;
      document.removeEventListener("pointerover", enter);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusin", enter);
      document.removeEventListener("focusout", leave);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [rpc, replaceDefaultClick, locale, ownerThreadId, config, navigate]);

  useEffect(() => {
    if (!active) return;
    const before = active.anchor.getAttribute("aria-details");
    active.anchor.setAttribute("aria-details", [before, id].filter(Boolean).join(" "));
    return () => {
      if (before === null) active.anchor.removeAttribute("aria-details");
      else active.anchor.setAttribute("aria-details", before);
    };
  }, [active, id]);

  const icons = config ? anchors.map((anchor, index) => {
    const link = verified.current.get(anchor);
    return link ? <LinkActionIcon key={index} anchor={anchor} action={actionIcon(config, replaceDefaultClick ? actionFor(config, link.path, link.directory) : link.directory ? "folder" : "preview")} /> : null;
  }) : null;
  if (!active) return <>{icons}</>;
  const name = fileBasename(active.path);
  const rect = active.anchor.getBoundingClientRect();
  const below = rect.bottom + 8;
  const placeBelow = below + 150 <= window.innerHeight;
  const defaultAction = config && info ? actionFor(config, active.path, info.directory) : null;
  const availableActions: Action[] = info?.directory ? ["folder"] : [...builtInActions];
  const actionLabel = (action: Action) => action === "folder" ? messages.openFolder : action === "preview" ? messages.openPreview : action === "external" ? messages.openDefault : config?.tools.find(tool => tool.id === action)?.name ?? action;
  return <>
    {icons}
    {createPortal(
    <TooltipProvider>
    <div ref={card} id={id} data-file-link-tools lang={locale} {...portalScope} role="dialog" aria-label={messages.fileActions} aria-description={messages.shortcuts}
      className="fixed z-40 w-72 max-w-[calc(100vw-16px)] rounded-lg border border-border bg-popover p-2 text-sm text-popover-foreground shadow-lg"
      style={{ ...(placeBelow ? { top: below } : { bottom: window.innerHeight - rect.top + 8 }), left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)), maxHeight: Math.max(48, placeBelow ? window.innerHeight - below - 8 : rect.top - 16), overflowY: "auto" }}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon name={info?.directory ? "FolderOpen" : "File"} className="size-4 shrink-0" />
        <div className="min-w-0 flex-1 truncate font-medium" title={name}>{name}</div>
        <ActionButton lang={locale} label={messages.copyName} className="h-6 w-6" onClick={() => void copy(name, messages)}>
          <Icon name="Copy" className="size-3.5" />
        </ActionButton>
        <span className="shrink-0 text-xs text-muted-foreground" role="status" title={info?.size != null ? `${info.size.toLocaleString(locale)} ${messages.bytes}` : messages.loading}>
          {info ? info.directory ? messages.folder : formatSize(info.size!, locale) : "…"}
        </span>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground" dir="rtl" title={active.path}><bdi dir="ltr">{active.path}</bdi></div>
        <ActionButton lang={locale} label={messages.copyPath} className="h-6 w-6" onClick={() => void copy(active.path, messages)}>
          <Icon name="Copy" className="size-3.5" />
        </ActionButton>
      </div>
      {info?.entries && <p className="mt-1 text-xs text-muted-foreground">
        {messages.filesCount}: {info.entries.files.toLocaleString(locale)} · {messages.foldersCount}: {info.entries.directories.toLocaleString(locale)}
        {info.entries.other > 0 && <> · {messages.otherCount}: {info.entries.other.toLocaleString(locale)}</>}
      </p>}
      {configError && <p className="mt-1 text-xs text-destructive" role="alert">{configError}</p>}
      {error && <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>}
      {info && !info.directory && <FilePreview key={active.path} path={active.path} size={info.size!} hostId={info.hostId} locale={locale} />}
      <div className="mt-2 flex items-center gap-1">
        {config && availableActions.filter(action => action !== (replaceDefaultClick ? defaultAction : info?.directory ? "folder" : "preview")).map(action => <ActionButton key={action} lang={locale} label={actionLabel(action)} disabled={!info || !!error || busy}
          onClick={() => { if (info) void run(action, active, info.hostId); }}>
          <Icon name={actionIcon(config, action)} className="size-4" />
        </ActionButton>)}
        <ActionButton lang={locale} label={messages.openMenu} className="ml-auto" onClick={() => {
          const rect = card.current!.getBoundingClientRect();
          menuRequested.current = true;
          // BB owns the menu, app discovery, icons and opening; do not copy its target registry.
          active.anchor.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true, cancelable: true, button: 2, clientX: rect.left, clientY: rect.bottom + 4,
          }));
        }}>
          <Icon name="ChevronDown" className="size-4" />
        </ActionButton>
      </div>
    </div>
    </TooltipProvider>, document.body,
    )}
  </>;
}

export default definePluginApp((app) => {
  app.slots.settingsSection({ id: "file-link-settings", component: FileLinkSettings });
  app.slots.experimental_threadHeaderAction({ id: "file-link-tools", title: "File Link Tools", component: FileLinkOverlay });
});
