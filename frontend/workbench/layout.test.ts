import { describe, expect, it } from "vitest";
import {
  activeTab,
  applyPreset,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  groupOrder,
  initialLayout,
  moveTab,
  moveToNewGroup,
  openDocIds,
  openTab,
  removeDoc,
  resizeSplit,
  splitGroup,
  validate,
  type EditorLayout,
} from "./layout";

function ok(l: EditorLayout): EditorLayout {
  expect(validate(l)).toEqual([]);
  return l;
}

function withTabs(...ids: string[]) {
  return ids.reduce((l, id) => openTab(l, id), initialLayout());
}

describe("editor layout", () => {
  it("opens tabs after the active tab and activates them", () => {
    let l = withTabs("a", "b");
    l = openTab(l, "c");
    l = ok(openTab(openTab(l, "a"), "d"));
    expect(l.groups.g1.tabs).toEqual(["a", "d", "b", "c"]);
    expect(activeTab(l)).toBe("d");
  });

  it("split right shows the same document in a new group", () => {
    const l = ok(splitGroup(withTabs("a", "b"), "g1", "right", "b"));
    expect(l.root).toMatchObject({ type: "split", orientation: "row", sizes: [0.5, 0.5] });
    expect(groupOrder(l)).toEqual(["g1", "g2"]);
    expect(l.groups.g2.tabs).toEqual(["b"]);
    expect(l.activeGroup).toBe("g2");
    // One document, two views: still one open document id.
    expect([...openDocIds(l)].sort()).toEqual(["a", "b"]);
  });

  it("builds recursive layouts: A | (B / C)", () => {
    let l = splitGroup(withTabs("a"), "g1", "right", null);
    l = openTab(l, "b");
    l = ok(splitGroup(l, "g2", "down", null));
    l = ok(openTab(l, "c"));
    expect(l.root).toMatchObject({
      type: "split",
      orientation: "row",
      children: [{ type: "group", groupId: "g1" }, { type: "split", orientation: "column", children: [{ groupId: "g2" }, { type: "group" }] }],
    });
    expect(groupOrder(l)).toEqual(["g1", "g2", l.activeGroup]);
    expect(l.groups[l.activeGroup].tabs).toEqual(["c"]);
  });

  it("splitting again in the same direction adds a sibling", () => {
    let l = splitGroup(withTabs("a"), "g1", "right", "a");
    l = ok(splitGroup(l, "g2", "right", "a"));
    expect(l.root).toMatchObject({ type: "split", children: [{}, {}, {}], sizes: [0.5, 0.25, 0.25] });
  });

  it("closing the last tab of a group removes the group and collapses the split", () => {
    let l = splitGroup(withTabs("a"), "g1", "right", "b");
    l = ok(closeTab(l, "g2", "b"));
    expect(l.root).toEqual({ type: "group", groupId: "g1" });
    expect(l.activeGroup).toBe("g1");
    // The only group is kept, empty.
    l = ok(closeTab(l, "g1", "a"));
    expect(l.groups.g1).toEqual({ id: "g1", tabs: [], active: null });
  });

  it("removing a group gives its space to its siblings", () => {
    let l = splitGroup(withTabs("a"), "g1", "right", "b");
    l = splitGroup(l, "g2", "right", "c");
    l = ok(closeTab(l, l.activeGroup, "c"));
    expect(l.root).toMatchObject({ sizes: [0.5, 0.5] });
  });

  it("moves tabs between groups and reorders within a group", () => {
    let l = splitGroup(withTabs("a", "b", "c"), "g1", "right", null);
    l = ok(moveTab(l, "g1", "g2", "b"));
    expect(l.groups.g1.tabs).toEqual(["a", "c"]);
    expect(l.groups.g2.tabs).toEqual(["b"]);
    expect(l.activeGroup).toBe("g2");
    l = ok(moveTab(l, "g1", "g1", "c", 0));
    expect(l.groups.g1.tabs).toEqual(["c", "a"]);
    // Moving the last tab out removes the group.
    l = ok(moveTab(l, "g2", "g1", "b"));
    expect(groupOrder(l)).toEqual(["g1"]);
  });

  it("move into new group", () => {
    const l = ok(moveToNewGroup(withTabs("a", "b"), "g1", "b", "down"));
    expect(l.groups.g1.tabs).toEqual(["a"]);
    expect(l.groups[l.activeGroup].tabs).toEqual(["b"]);
    expect(l.root).toMatchObject({ orientation: "column" });
  });

  it("close others, close to the right, close a document everywhere", () => {
    let l = withTabs("a", "b", "c", "d");
    expect(ok(closeOtherTabs(l, "g1", "b")).groups.g1.tabs).toEqual(["b"]);
    expect(ok(closeTabsToRight(l, "g1", "b")).groups.g1.tabs).toEqual(["a", "b"]);
    l = splitGroup(l, "g1", "right", "c");
    l = ok(removeDoc(l, "c"));
    expect(groupOrder(l)).toEqual(["g1"]);
    expect(l.groups.g1.tabs).toEqual(["a", "b", "d"]);
  });

  it("layout presets keep every open tab", () => {
    let l = splitGroup(withTabs("a", "b"), "g1", "down", "c");
    l = ok(applyPreset(l, "single"));
    expect(l.groups[l.activeGroup].tabs).toEqual(["a", "b", "c"]);
    l = ok(applyPreset(l, "two-columns"));
    expect(l.root).toMatchObject({ orientation: "row" });
    l = ok(applyPreset(l, "two-rows"));
    expect(l.root).toMatchObject({ orientation: "column" });
    expect([...openDocIds(l)].sort()).toEqual(["a", "b", "c"]);
  });

  it("resizes splits with normalized fractions", () => {
    let l = splitGroup(withTabs("a"), "g1", "right", "a");
    const id = (l.root as { id: string }).id;
    l = ok(resizeSplit(l, id, [3, 1]));
    expect(l.root).toMatchObject({ sizes: [0.75, 0.25] });
  });

  it("keeps invariants under random operations", () => {
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    let l = initialLayout();
    const docs = ["a", "b", "c", "d", "e"];
    for (let i = 0; i < 2000; i++) {
      const groups = groupOrder(l);
      const g = groups[rnd(groups.length)];
      const tabs = l.groups[g].tabs;
      const doc = docs[rnd(docs.length)];
      switch (rnd(6)) {
        case 0:
          l = openTab(l, doc, g);
          break;
        case 1:
          if (groups.length < 6) l = splitGroup(l, g, rnd(2) ? "right" : "down", tabs[0] ?? null);
          break;
        case 2:
          if (tabs.length) l = closeTab(l, g, tabs[rnd(tabs.length)]);
          break;
        case 3:
          if (tabs.length) l = moveTab(l, g, groups[rnd(groups.length)], tabs[rnd(tabs.length)], rnd(4));
          break;
        case 4:
          l = removeDoc(l, doc);
          break;
        case 5:
          if (tabs.length && groups.length < 6) l = moveToNewGroup(l, g, tabs[0], rnd(2) ? "right" : "down");
          break;
      }
      const problems = validate(l);
      if (problems.length) throw new Error(`step ${i}: ${problems.join(", ")}`);
    }
  });
});
