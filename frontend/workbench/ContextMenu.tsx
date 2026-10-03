// Context menus, rendered from the same menu model as the menu bar. A
// context menu is a MenuId plus the arguments its commands receive (for
// example, which tab was right-clicked).

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { MenuId } from "@frontend/commands/menus";
import { MenuList } from "./MenuList";

interface Open {
  x: number;
  y: number;
  menu: MenuId;
  /** Passed to the commands the menu runs (e.g. which tab was clicked). */
  args: unknown;
}

let current: Open | null = null;
const listeners = new Set<() => void>();

function set(next: Open | null) {
  current = next;
  for (const l of listeners) l();
}

/** Opens a context menu at the pointer. Its commands receive `args`. */
export function openContextMenu(e: { clientX: number; clientY: number; preventDefault(): void }, menu: MenuId, args?: unknown) {
  e.preventDefault();
  set({ x: e.clientX, y: e.clientY, menu, args });
}

export function closeContextMenu() {
  set(null);
}

export function ContextMenuHost() {
  const open = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && closeContextMenu();
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", closeContextMenu);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", closeContextMenu);
    };
  }, [open]);

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(4, Math.min(open.x, window.innerWidth - r.width - 4))}px`;
    el.style.top = `${Math.max(4, Math.min(open.y, window.innerHeight - r.height - 4))}px`;
  }, [open]);

  if (!open) return null;
  return (
    <div className="context-menu" ref={ref} style={{ left: open.x, top: open.y }}>
      <MenuList menu={open.menu} label="Context menu" onDone={closeContextMenu} args={open.args} />
    </div>
  );
}
