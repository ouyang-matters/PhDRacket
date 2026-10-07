import { describe, expect, it } from "vitest";
import {
  clampSplit,
  closeBelow,
  normalizePlacement,
  openAbove,
  openBelow,
  showView,
  swapViews,
  toggleSplit,
  toggleView,
  type SidebarPlacement,
} from "./sidebar-layout";

const IDS = ["explorer", "outline", "search", "scm"];
const one: SidebarPlacement = { visible: true, top: "explorer", bottom: "" };
const two: SidebarPlacement = { visible: true, top: "explorer", bottom: "outline" };

describe("sidebar placement", () => {
  it("splits to the next view and joins again", () => {
    expect(toggleSplit(one, IDS)).toEqual(two);
    expect(toggleSplit(two, IDS)).toEqual(one);
    expect(toggleSplit({ ...one, top: "scm" }, IDS).bottom).toBe("explorer");
    expect(toggleSplit(one, ["explorer"]).bottom).toBe("");
    expect(toggleSplit({ ...one, visible: false }, IDS).visible).toBe(true);
  });

  it("toggles a view where it is shown", () => {
    expect(toggleView(two, "outline")).toEqual(one);
    expect(toggleView(two, "explorer")).toEqual({ ...two, visible: false });
    expect(toggleView(two, "search")).toEqual({ ...two, top: "search" });
    expect(toggleView({ ...two, visible: false }, "outline")).toEqual(two);
  });

  it("shows a view without moving it out of the lower half", () => {
    expect(showView(two, "outline")).toEqual(two);
    expect(showView({ ...two, visible: false }, "search")).toEqual({ ...two, top: "search" });
  });

  it("opens views above and below", () => {
    expect(openBelow(one, "search")).toEqual({ ...one, bottom: "search" });
    expect(openBelow(two, "explorer")).toEqual({ ...two, top: "outline", bottom: "explorer" });
    expect(openBelow(one, "explorer")).toEqual(one);
    expect(openAbove(two, "outline")).toEqual({ ...two, top: "outline", bottom: "explorer" });
    expect(openAbove(two, "search")).toEqual({ ...two, top: "search" });
    expect(swapViews(one)).toEqual(one);
    expect(closeBelow(two)).toEqual(one);
  });

  it("drops views that are not registered", () => {
    expect(normalizePlacement({ visible: true, top: "gone", bottom: "outline" }, IDS)).toEqual({ visible: true, top: "explorer", bottom: "outline" });
    expect(normalizePlacement({ visible: true, top: "outline", bottom: "outline" }, IDS).bottom).toBe("");
    expect(normalizePlacement({ visible: true, top: "explorer", bottom: "gone" }, IDS).bottom).toBe("");
  });

  it("keeps both halves visible", () => {
    expect(clampSplit(0.01)).toBe(0.15);
    expect(clampSplit(0.99)).toBe(0.85);
    expect(clampSplit(NaN)).toBe(0.5);
  });
});
