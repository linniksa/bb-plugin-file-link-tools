export function attachLongPress(
  root: EventTarget,
  anchorFor: (node: EventTarget | null) => HTMLAnchorElement | null,
  onHold: (anchor: HTMLAnchorElement) => void,
) {
  let pending: { anchor: HTMLAnchorElement; id: number; x: number; y: number } | null = null;
  let held: HTMLAnchorElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  function cancel() {
    clearTimeout(timer); pending = null;
    if (held) {
      // Browsers may emit contextmenu before release and click afterwards.
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => { held = null; }, 1000);
    }
  }
  function down(event: Event) {
    const pointer = event as PointerEvent;
    cancel(); held = null; clearTimeout(releaseTimer);
    if (pointer.pointerType !== "touch" || !pointer.isPrimary || pointer.button !== 0) return;
    const anchor = anchorFor(event.target);
    if (!anchor) return;
    pending = { anchor, id: pointer.pointerId, x: pointer.clientX, y: pointer.clientY };
    timer = setTimeout(() => {
      if (!pending || anchorFor(anchor) !== anchor) return;
      held = anchor;
      onHold(anchor);
    }, 400);
  }
  function move(event: Event) {
    const pointer = event as PointerEvent;
    if (pending?.id === pointer.pointerId && Math.hypot(pointer.clientX - pending.x, pointer.clientY - pending.y) > 10) cancel();
  }
  function up(event: Event) {
    if (pending?.id !== (event as PointerEvent).pointerId) return;
    cancel();
  }
  function suppress(event: Event) {
    if (!held || anchorFor(event.target) !== held || (event.type === "click" && (event as MouseEvent).detail === 0)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.type === "click") { held = null; clearTimeout(releaseTimer); }
  }
  const listeners = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: up, scroll: cancel, click: suppress, contextmenu: suppress };
  for (const [name, handler] of Object.entries(listeners)) root.addEventListener(name, handler, true);
  return () => {
    cancel(); clearTimeout(releaseTimer); held = null;
    for (const [name, handler] of Object.entries(listeners)) root.removeEventListener(name, handler, true);
  };
}
