// Menus as data. A menu is a list of items that point at commands (or at
// submenus); items are grouped, and groups are separated in the rendered
// menu. The menu bar, context menus and extension contributions all use
// this one model.

import { useSyncExternalStore } from "react";
import { getCommand, isVisible } from "./registry";

export type MenuId = string;

export interface MenuItem {
  /** A command to run. */
  command?: string;
  args?: unknown;
  /** A submenu instead of a command. */
  submenu?: MenuId;
  /** Overrides the command's title; required for submenus. */
  title?: string;
  /** Items with the same group are adjacent; groups are separated. */
  group?: string;
  order?: number;
  /** Shown only when this returns true. */
  when?(): boolean;
}

/** Items computed when the menu opens (e.g. recent files). */
export type MenuProvider = () => MenuItem[];

const items = new Map<MenuId, MenuItem[]>();
const providers = new Map<MenuId, MenuProvider[]>();
const listeners = new Set<() => void>();
let version = 0;

function changed() {
  version++;
  for (const l of listeners) l();
}

export function registerMenuItems(menu: MenuId, list: MenuItem[]): () => void {
  items.set(menu, [...(items.get(menu) ?? []), ...list]);
  changed();
  return () => {
    items.set(
      menu,
      (items.get(menu) ?? []).filter((i) => !list.includes(i)),
    );
    changed();
  };
}

export function registerMenuProvider(menu: MenuId, provider: MenuProvider): () => void {
  providers.set(menu, [...(providers.get(menu) ?? []), provider]);
  changed();
  return () => {
    providers.set(
      menu,
      (providers.get(menu) ?? []).filter((p) => p !== provider),
    );
    changed();
  };
}

function shown(item: MenuItem): boolean {
  if (item.when && !item.when()) return false;
  if (item.command) {
    const c = getCommand(item.command);
    return !!c && isVisible(c);
  }
  if (item.submenu) return resolveMenu(item.submenu).length > 0;
  return false;
}

/** The visible items of a menu, as groups in order. Empty groups and
 * submenus disappear. */
export function resolveMenu(menu: MenuId): MenuItem[][] {
  const all = [...(items.get(menu) ?? []), ...(providers.get(menu) ?? []).flatMap((p) => p())].filter(shown);
  const groups = new Map<string, MenuItem[]>();
  for (const i of all) {
    const g = i.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), i]);
  }
  return [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((g) => groups.get(g)!.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
}

export function menuTitle(item: MenuItem): string {
  return item.title ?? (item.command ? (getCommand(item.command)?.title ?? item.command) : "");
}

export function subscribeMenus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMenusVersion(): number {
  return useSyncExternalStore(subscribeMenus, () => version);
}

/** For tests. */
export function resetMenusForTests() {
  items.clear();
  providers.clear();
  changed();
}
