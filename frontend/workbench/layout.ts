// Editor groups and their layout, as a pure model.
//
//   EditorLayout
//   ├── root: LayoutNode          a tree of splits whose leaves are groups
//   │     SplitNode { orientation, children[], sizes[] }
//   │     GroupNode { groupId }
//   └── groups: { id → EditorGroup { tabs: docId[], active } }
//
// A tab refers to a document by id. The same document may be open in
// several groups; all of them show the one shared editor model, so edits
// stay synchronized and nothing is duplicated.

/** "row": children side by side (split right); "column": stacked (split down). */
export type Orientation = "row" | "column";

export interface GroupNode {
  type: "group";
  groupId: string;
}

export interface SplitNode {
  type: "split";
  id: string;
  orientation: Orientation;
  children: LayoutNode[];
  /** Fractions of the available space, summing to 1. */
  sizes: number[];
}

export type LayoutNode = GroupNode | SplitNode;

export interface EditorGroup {
  id: string;
  tabs: string[];
  active: string | null;
}

export interface EditorLayout {
  root: LayoutNode;
  groups: Record<string, EditorGroup>;
  activeGroup: string;
  nextId: number;
}

export type SplitDirection = "right" | "down";

export function initialLayout(): EditorLayout {
  return { root: { type: "group", groupId: "g1" }, groups: { g1: { id: "g1", tabs: [], active: null } }, activeGroup: "g1", nextId: 2 };
}

/** Groups in reading order (left to right, top to bottom). */
export function groupOrder(layout: EditorLayout): string[] {
  const out: string[] = [];
  const walk = (n: LayoutNode) => (n.type === "group" ? out.push(n.groupId) : n.children.forEach(walk));
  walk(layout.root);
  return out;
}

export function activeTab(layout: EditorLayout): string | null {
  return layout.groups[layout.activeGroup]?.active ?? null;
}

/** Every document shown in some group. */
export function openDocIds(layout: EditorLayout): Set<string> {
  return new Set(Object.values(layout.groups).flatMap((g) => g.tabs));
}

function setGroup(layout: EditorLayout, group: EditorGroup): EditorLayout {
  return { ...layout, groups: { ...layout.groups, [group.id]: group } };
}

/** Opens `docId` in a group (the active one by default) and activates it. */
export function openTab(layout: EditorLayout, docId: string, groupId = layout.activeGroup, index?: number): EditorLayout {
  const g = layout.groups[groupId];
  if (!g) return layout;
  let tabs = g.tabs;
  if (!tabs.includes(docId)) {
    const at = index ?? (g.active ? tabs.indexOf(g.active) + 1 : tabs.length);
    tabs = [...tabs.slice(0, at), docId, ...tabs.slice(at)];
  }
  return { ...setGroup(layout, { ...g, tabs, active: docId }), activeGroup: groupId };
}

export function focusGroup(layout: EditorLayout, groupId: string): EditorLayout {
  return layout.groups[groupId] ? { ...layout, activeGroup: groupId } : layout;
}

/** The tab to show after `docId` closes: the one to its right, else left. */
function neighbor(tabs: string[], docId: string): string | null {
  const i = tabs.indexOf(docId);
  return tabs[i + 1] ?? tabs[i - 1] ?? null;
}

function removeNode(node: LayoutNode, groupId: string): LayoutNode | null {
  if (node.type === "group") return node.groupId === groupId ? null : node;
  const kept: LayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((c, i) => {
    const r = removeNode(c, groupId);
    if (r) {
      kept.push(r);
      sizes.push(node.sizes[i]);
    } else if (sizes.length > 0) {
      // The neighbor before it takes its space, undoing the split that made it.
      sizes[sizes.length - 1] += node.sizes[i];
    } else {
      sizes.push(-node.sizes[i]); // carried to the next kept child
    }
  });
  if (kept.length === 0) return null;
  if (kept.length === 1) return kept[0];
  const fixed: number[] = [];
  let carry = 0;
  for (const s of sizes) {
    if (s < 0) carry += -s;
    else {
      fixed.push(s + carry);
      carry = 0;
    }
  }
  return { ...node, children: kept, sizes: fixed };
}

/** Removes a group from the layout (its tabs go with it). The last group is
 * never removed; it is emptied instead. */
export function removeGroup(layout: EditorLayout, groupId: string): EditorLayout {
  const order = groupOrder(layout);
  if (!layout.groups[groupId]) return layout;
  if (order.length === 1) return setGroup(layout, { ...layout.groups[groupId], tabs: [], active: null });
  const root = removeNode(layout.root, groupId)!;
  const groups = { ...layout.groups };
  delete groups[groupId];
  const i = order.indexOf(groupId);
  const activeGroup = layout.activeGroup === groupId ? (order[i - 1] ?? order[i + 1]) : layout.activeGroup;
  return { ...layout, root, groups, activeGroup };
}

/** Closes a tab. A group left empty is removed unless it is the only one. */
export function closeTab(layout: EditorLayout, groupId: string, docId: string): EditorLayout {
  const g = layout.groups[groupId];
  if (!g || !g.tabs.includes(docId)) return layout;
  const tabs = g.tabs.filter((t) => t !== docId);
  if (tabs.length === 0 && groupOrder(layout).length > 1) return removeGroup(layout, groupId);
  const active = g.active === docId ? neighbor(g.tabs, docId) : g.active;
  return setGroup(layout, { ...g, tabs, active });
}

export function closeOtherTabs(layout: EditorLayout, groupId: string, docId: string): EditorLayout {
  const g = layout.groups[groupId];
  if (!g) return layout;
  return setGroup(layout, { ...g, tabs: g.tabs.filter((t) => t === docId), active: docId });
}

export function closeTabsToRight(layout: EditorLayout, groupId: string, docId: string): EditorLayout {
  const g = layout.groups[groupId];
  if (!g) return layout;
  const tabs = g.tabs.slice(0, g.tabs.indexOf(docId) + 1);
  return setGroup(layout, { ...g, tabs, active: tabs.includes(g.active ?? "") ? g.active : docId });
}

/** Removes a document from every group (it was closed). */
export function removeDoc(layout: EditorLayout, docId: string): EditorLayout {
  let out = layout;
  for (const id of groupOrder(layout)) out = closeTab(out, id, docId);
  return out;
}

function insertSplit(node: LayoutNode, target: string, created: string, orientation: Orientation, splitId: () => string): LayoutNode {
  if (node.type === "group") {
    if (node.groupId !== target) return node;
    return { type: "split", id: splitId(), orientation, children: [node, { type: "group", groupId: created }], sizes: [0.5, 0.5] };
  }
  const i = node.children.findIndex((c) => c.type === "group" && c.groupId === target);
  if (i >= 0 && node.orientation === orientation) {
    // Same direction: add a sibling and share the target's space with it.
    const half = node.sizes[i] / 2;
    return {
      ...node,
      children: [...node.children.slice(0, i + 1), { type: "group", groupId: created }, ...node.children.slice(i + 1)],
      sizes: [...node.sizes.slice(0, i), half, half, ...node.sizes.slice(i + 1)],
    };
  }
  return { ...node, children: node.children.map((c) => insertSplit(c, target, created, orientation, splitId)) };
}

/** Splits a group. The new group shows `docId` (the same document, not a
 * copy) or starts empty, and becomes active. */
export function splitGroup(layout: EditorLayout, groupId: string, direction: SplitDirection, docId: string | null): EditorLayout {
  if (!layout.groups[groupId]) return layout;
  let n = layout.nextId;
  const created = `g${n++}`;
  const root = insertSplit(layout.root, groupId, created, direction === "right" ? "row" : "column", () => `s${n++}`);
  const group: EditorGroup = { id: created, tabs: docId ? [docId] : [], active: docId };
  return { ...layout, root, groups: { ...layout.groups, [created]: group }, activeGroup: created, nextId: n };
}

/** Moves a tab to another group (at `index`, or after its active tab). */
export function moveTab(layout: EditorLayout, from: string, to: string, docId: string, index?: number): EditorLayout {
  if (!layout.groups[from] || !layout.groups[to]) return layout;
  if (from === to) {
    const g = layout.groups[from];
    const without = g.tabs.filter((t) => t !== docId);
    const at = Math.min(Math.max(index ?? without.length, 0), without.length);
    return { ...setGroup(layout, { ...g, tabs: [...without.slice(0, at), docId, ...without.slice(at)], active: docId }), activeGroup: from };
  }
  const target = layout.groups[to];
  const placed = setGroup(layout, { ...target, tabs: target.tabs.filter((t) => t !== docId) });
  const opened = openTab(placed, docId, to, index);
  return focusGroup(closeTab(opened, from, docId), to);
}

/** Moves a tab out of its group into a new group beside it. */
export function moveToNewGroup(layout: EditorLayout, groupId: string, docId: string, direction: SplitDirection): EditorLayout {
  const g = layout.groups[groupId];
  if (!g || !g.tabs.includes(docId)) return layout;
  if (g.tabs.length === 1) return splitGroup(layout, groupId, direction, null);
  const split = splitGroup(layout, groupId, direction, docId);
  return focusGroup(closeTab(split, groupId, docId), split.activeGroup);
}

/** One group with every open tab, in reading order. */
export function joinAll(layout: EditorLayout): EditorLayout {
  const order = groupOrder(layout);
  const tabs: string[] = [];
  for (const id of order) for (const t of layout.groups[id].tabs) if (!tabs.includes(t)) tabs.push(t);
  const keep = order[0];
  const active = activeTab(layout) ?? tabs[0] ?? null;
  return { ...layout, root: { type: "group", groupId: keep }, groups: { [keep]: { id: keep, tabs, active } }, activeGroup: keep };
}

export type LayoutPreset = "single" | "two-columns" | "two-rows";

export function applyPreset(layout: EditorLayout, preset: LayoutPreset): EditorLayout {
  const single = joinAll(layout);
  if (preset === "single") return single;
  return splitGroup(single, single.activeGroup, preset === "two-columns" ? "right" : "down", activeTab(single));
}

/** Sets the sizes of a split (fractions; normalized to sum to 1). */
export function resizeSplit(layout: EditorLayout, splitId: string, sizes: number[]): EditorLayout {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total <= 0) return layout;
  const norm = sizes.map((s) => s / total);
  const walk = (n: LayoutNode): LayoutNode =>
    n.type === "group" ? n : n.id === splitId && n.children.length === norm.length ? { ...n, sizes: norm } : { ...n, children: n.children.map(walk) };
  return { ...layout, root: walk(layout.root) };
}

/** Checks the model's invariants; returns a list of problems (empty if valid). */
export function validate(layout: EditorLayout): string[] {
  const problems: string[] = [];
  const order = groupOrder(layout);
  if (new Set(order).size !== order.length) problems.push("a group appears twice");
  for (const id of order) if (!layout.groups[id]) problems.push(`missing group ${id}`);
  for (const id of Object.keys(layout.groups)) if (!order.includes(id)) problems.push(`orphan group ${id}`);
  if (!layout.groups[layout.activeGroup]) problems.push("active group missing");
  for (const g of Object.values(layout.groups)) {
    if (new Set(g.tabs).size !== g.tabs.length) problems.push(`duplicate tab in ${g.id}`);
    if (g.active !== null && !g.tabs.includes(g.active)) problems.push(`active tab not in ${g.id}`);
  }
  const walk = (n: LayoutNode) => {
    if (n.type === "split") {
      if (n.children.length < 2) problems.push(`split ${n.id} has fewer than two children`);
      if (Math.abs(n.sizes.reduce((a, b) => a + b, 0) - 1) > 1e-6) problems.push(`split ${n.id} sizes do not sum to 1`);
      n.children.forEach(walk);
    }
  };
  walk(layout.root);
  return problems;
}
