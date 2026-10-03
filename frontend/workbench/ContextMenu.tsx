// Context menus, rendered from the same menu model as the menu bar. A
// context menu is a MenuId plus the arguments its commands receive (for
// example, which tab was right-clicked).

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { registerMenuProvider, type MenuId, type MenuItem } from "@frontend/commands/menus";
import { MenuList } from "./MenuList";

interface Open {
  x: number;
  y: number;
  menu: MenuId;
}

let current: Open | null = null;
const listeners = new Set<() => void>();
let contextArgs: unknown = undefined;

function set(next: Open | null) {
  current = next;
  for (const l of listeners) l();
}

/** The arguments of the context menu being shown (e.g. the clicked tab). */
export function contextMenuArgs<T>(): T {
  return contextArgs as T;
}

/** Opens a context menu at the pointer. Items registered for `menu` run
 * with `args` available through `contextMenuArgs()`. */
export function openContextMenu(e: { clientX: number; clientY: number; preventDefault(): void }, menu: MenuId, args?: unknown) {
  e.preventDefault();
  contextArgs = args;
  set({ x: e.clientX, y: e.clientY, menu });
}

export function closeContextMenu() {
  set(null);
}

/** Items whose command args are computed from the context menu's args. */
export function contextItems(menu: MenuId, make: (args: unknown) => MenuItem[]): () => void {
  return registerMenuProvider(menu, () => (current?.menu === menu ? make(contextArgs) : []));
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
      <MenuList menu={open.menu} label="Context menu" onDone={closeContextMenu} />
    </div>
  );
}
