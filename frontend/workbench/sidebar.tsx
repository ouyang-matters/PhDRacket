// The activity bar and sidebar. Sidebar views are registered like panels;
// the activity bar switches between them, and clicking the active view's
// icon hides the sidebar. The sidebar can be split to show two views, one
// above the other (sidebar-layout.ts).

import { useRef, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";
import { getState, setPrefs, useApp } from "@frontend/app/store";
import { executeCommand } from "@frontend/commands/registry";
import { formatKey, keybindingFor } from "@frontend/commands/keybindings";
import { openContextMenu } from "./ContextMenu";
import { Icon, type IconName } from "./icons";
import * as placement from "./sidebar-layout";

export interface SidebarView {
  id: string;
  title: string;
  icon: IconName;
  order: number;
  /** Command that shows this view (for its keybinding hint). */
  command?: string;
  render(): ReactNode;
}

let views: SidebarView[] = [];
const listeners = new Set<() => void>();

export function registerSidebarView(view: SidebarView): () => void {
  views = [...views.filter((v) => v.id !== view.id), view].sort((a, b) => a.order - b.order);
  for (const l of listeners) l();
  return () => {
    views = views.filter((v) => v !== view);
    for (const l of listeners) l();
  };
}

function useSidebarViews(): SidebarView[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => views,
  );
}

function current(): placement.SidebarPlacement {
  const p = getState().prefs;
  return placement.normalizePlacement({ visible: p.explorerVisible, top: p.sidebarView, bottom: p.sidebarBottomView }, views.map((v) => v.id));
}

function apply(next: placement.SidebarPlacement) {
  setPrefs({ explorerVisible: next.visible, sidebarView: next.top, sidebarBottomView: next.bottom });
}

/** Shows a sidebar view, or hides it if it is already showing. */
export function toggleSidebarView(id: string) {
  apply(placement.toggleView(current(), id));
}

/** Shows a sidebar view (in whichever half already shows it). */
export function showSidebarView(id: string) {
  apply(placement.showView(current(), id));
}

/** Splits the sidebar into two views, or joins it back into one. */
export function toggleSidebarSplit() {
  apply(placement.toggleSplit(current(), views.map((v) => v.id)));
}

export function isSidebarSplit(): boolean {
  const p = current();
  return p.visible && p.bottom !== "";
}

export function swapSidebarViews() {
  apply(placement.swapViews(current()));
}

export function closeSidebarBelow() {
  apply(placement.closeBelow(current()));
}

/** Closes the upper view; the lower one takes the whole sidebar. */
export function closeSidebarAbove() {
  apply(placement.closeBelow(placement.swapViews(current())));
}

/** The view an activity bar context menu was opened on. */
let contextView: string | null = null;

/** Whether Show Above / Show Below would change anything for the view. */
export function canShowSidebarView(where: "above" | "below"): boolean {
  const p = current();
  const id = contextView;
  if (!id) return false;
  if (!p.visible) return where === "above" || id !== p.top;
  return where === "above" ? id !== p.top : id !== p.bottom && !(id === p.top && !p.bottom);
}

function viewArg(args: unknown): string | null {
  const id = (args as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id : contextView;
}

export function openSidebarViewAbove(args?: unknown) {
  const id = viewArg(args);
  if (id) apply(placement.openAbove(current(), id));
}

export function openSidebarViewBelow(args?: unknown) {
  const id = viewArg(args);
  if (id) apply(placement.openBelow(current(), id));
}

export function ActivityBar() {
  const all = useSidebarViews();
  const top = useApp((s) => s.prefs.sidebarView);
  const bottom = useApp((s) => s.prefs.sidebarBottomView);
  const visible = useApp((s) => s.prefs.explorerVisible);
  return (
    <nav className="activity-bar" aria-label="Views">
      {all.map((v) => {
        const active = visible && (top === v.id || bottom === v.id);
        const key = v.command ? keybindingFor(v.command) : null;
        return (
          <button
            key={v.id}
            className={`activity-item${active ? " active" : ""}`}
            title={key ? `${v.title} (${formatKey(key)})` : v.title}
            aria-pressed={active}
            onClick={() => toggleSidebarView(v.id)}
            onContextMenu={(e) => {
              contextView = v.id;
              openContextMenu(e, "sidebar.viewContext", { id: v.id });
            }}
          >
            <Icon name={v.icon} size={20} />
          </button>
        );
      })}
      <span className="activity-spacer" />
      <BrowserButton />
      <button className="activity-item" title="Settings" onClick={() => executeCommand("preferences.settings")}>
        <Icon name="settings" size={20} />
      </button>
    </nav>
  );
}

/** Opens a web page (an assignment, the docs) beside the code. */
function BrowserButton() {
  const key = keybindingFor("view.openBrowser");
  return (
    <button
      className="activity-item"
      title={`Open Web Page beside the Code${key ? ` (${formatKey(key)} opens it here)` : ""}`}
      aria-label="Open web page"
      onClick={() => executeCommand("view.openBrowserToSide")}
    >
      <Icon name="globe" size={20} />
    </button>
  );
}

/** A view's title bar, shown only when the sidebar is split. */
function PaneHeader({ view, lower }: { view: SidebarView; lower: boolean }) {
  return (
    <div
      className="sidebar-pane-header"
      onContextMenu={(e) => {
        contextView = view.id;
        openContextMenu(e, "sidebar.viewContext", { id: view.id });
      }}
    >
      <span className="sidebar-pane-title">{view.title}</span>
      <span className="toolbar-spacer" />
      <button className="icon-button" title="Swap Views" aria-label="Swap views" onClick={swapSidebarViews}>
        <Icon name="sort" size={14} />
      </button>
      <button className="icon-button" title="Close" aria-label={`Close ${view.title}`} onClick={lower ? closeSidebarBelow : closeSidebarAbove}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

export function Sidebar() {
  const all = useSidebarViews();
  const topId = useApp((s) => s.prefs.sidebarView);
  const bottomId = useApp((s) => s.prefs.sidebarBottomView);
  const split = useApp((s) => s.prefs.sidebarSplit);
  const width = useApp((s) => s.prefs.explorerWidth);
  const dragging = useRef(false);
  const draggingSplit = useRef(false);
  const view = all.find((v) => v.id === topId) ?? all[0];
  const lower = bottomId && bottomId !== view?.id ? all.find((v) => v.id === bottomId) : undefined;
  if (!view) return null;

  const startDrag = (flag: { current: boolean }) => (e: PointerEvent<HTMLElement>) => {
    flag.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  return (
    <aside className={`sidebar${lower ? " sidebar-split" : ""}`} style={{ width }} aria-label={lower ? `${view.title} and ${lower.title}` : view.title}>
      {lower ? (
        <div className="sidebar-panes">
          <section className="sidebar-pane" style={{ flexGrow: split }} aria-label={view.title}>
            <PaneHeader view={view} lower={false} />
            <div className="sidebar-view">{view.render()}</div>
          </section>
          <section className="sidebar-pane" style={{ flexGrow: 1 - split }} aria-label={lower.title}>
            <div
              className="sash horizontal"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize sidebar views"
              onPointerDown={startDrag(draggingSplit)}
              onPointerMove={(e) => {
                if (!draggingSplit.current) return;
                const box = e.currentTarget.closest(".sidebar-panes")?.getBoundingClientRect();
                if (!box || box.height <= 0) return;
                setPrefs({ sidebarSplit: placement.clampSplit((e.clientY - box.top) / box.height) });
              }}
              onPointerUp={() => (draggingSplit.current = false)}
              onDoubleClick={() => setPrefs({ sidebarSplit: 0.5 })}
            />
            <PaneHeader view={lower} lower />
            <div className="sidebar-view">{lower.render()}</div>
          </section>
        </div>
      ) : (
        <div className="sidebar-view">{view.render()}</div>
      )}
      <div
        className="sash vertical"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={startDrag(dragging)}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const left = (e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0);
          setPrefs({ explorerWidth: Math.round(Math.min(Math.max(e.clientX - left, 160), 600)) });
        }}
        onPointerUp={() => (dragging.current = false)}
      />
    </aside>
  );
}
