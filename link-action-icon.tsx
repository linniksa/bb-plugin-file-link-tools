import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { ToolIcon } from "./actions";
import { usePortalScopeProps } from "./lib/portal-scope";

export function LinkActionIcon({ anchor, action }: { anchor: HTMLAnchorElement; action: ToolIcon }) {
  const [mount, setMount] = useState<HTMLSpanElement | null>(null);
  const scope = usePortalScopeProps();
  useEffect(() => {
    // shortcut: BB has no file-link decoration slot; restore its icon on disposal.
    const original = anchor.querySelector<SVGSVGElement>("svg:last-child");
    if (!original) return;
    const container = document.createElement("span");
    container.dataset.fileLinkToolsAction = action;
    const display = original.style.display;
    original.style.display = "none";
    original.after(container);
    setMount(container);
    return () => {
      original.style.display = display;
      container.remove();
      setMount(null);
    };
  }, [anchor, action]);
  return mount ? createPortal(<span {...scope} aria-hidden="true"><Icon name={action} className="ml-1 inline size-3 align-[-0.125em] text-subtle-foreground" /></span>, mount) : null;
}
