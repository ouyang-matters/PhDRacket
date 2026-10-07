// Which views the sidebar shows, as a pure model. The sidebar shows one view,
// or two stacked (e.g. the Explorer above the Outline). `bottom` is "" when
// it is not split.

export interface SidebarPlacement {
  visible: boolean;
  top: string;
  bottom: string;
}

/** Drops views that are not registered (e.g. a feature that was removed);
 * `ids` are the registered views in order. */
export function normalizePlacement(p: SidebarPlacement, ids: string[]): SidebarPlacement {
  const top = ids.includes(p.top) ? p.top : (ids[0] ?? p.top);
  const bottom = p.bottom !== top && ids.includes(p.bottom) ? p.bottom : "";
  return { ...p, top, bottom };
}

/** Shows a view: where it already is, otherwise in the upper half. */
export function showView(p: SidebarPlacement, id: string): SidebarPlacement {
  return id === p.bottom ? { ...p, visible: true } : { ...p, visible: true, top: id };
}

/** The activity bar: a shown view's icon hides it (the lower half closes;
 * the upper view hides the sidebar), any other view is shown. */
export function toggleView(p: SidebarPlacement, id: string): SidebarPlacement {
  if (p.visible && id === p.top) return { ...p, visible: false };
  if (p.visible && id === p.bottom) return { ...p, bottom: "" };
  return showView(p, id);
}

/** Shows a view in the lower half (the upper one moves down if it is that view). */
export function openBelow(p: SidebarPlacement, id: string): SidebarPlacement {
  if (id === p.top) return p.bottom ? swapViews({ ...p, visible: true }) : { ...p, visible: true };
  return { ...p, visible: true, bottom: id };
}

/** Shows a view in the upper half. */
export function openAbove(p: SidebarPlacement, id: string): SidebarPlacement {
  if (id === p.bottom) return swapViews({ ...p, visible: true });
  return { ...p, visible: true, top: id };
}

export function swapViews(p: SidebarPlacement): SidebarPlacement {
  return p.bottom ? { ...p, top: p.bottom, bottom: p.top } : p;
}

export function closeBelow(p: SidebarPlacement): SidebarPlacement {
  return { ...p, bottom: "" };
}

/** Splits the sidebar, showing the view after the upper one below it
 * (Explorer, then Outline), or joins it back into one view. */
export function toggleSplit(p: SidebarPlacement, ids: string[]): SidebarPlacement {
  if (p.bottom) return { ...p, visible: true, bottom: "" };
  const i = ids.indexOf(p.top);
  const next = ids.length > 1 ? ids[(i + 1) % ids.length] : "";
  return { ...p, visible: true, bottom: next === p.top ? "" : next };
}

/** Fraction of the height for the upper view, kept so neither half vanishes. */
export function clampSplit(fraction: number): number {
  return Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0.15), 0.85) : 0.5;
}
