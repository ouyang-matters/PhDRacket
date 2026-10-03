// The activity bar and sidebar. Sidebar views are registered like panels;
// the activity bar switches between them, and clicking the active view's
// icon hides the sidebar.

import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { getState, setPrefs, useApp } from "@frontend/app/store";
import { executeCommand } from "@frontend/commands/registry";
import { formatKey, keybindingFor } from "@frontend/commands/keybindings";
import { Icon, type IconName } from "./icons";

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

/** Shows a sidebar view, or hides the sidebar if it is already showing it. */
export function toggleSidebarView(id: string) {
  const p = getState().prefs;
  setPrefs(p.explorerVisible && p.sidebarView === id ? { explorerVisible: false } : { sidebarView: id, explorerVisible: true });
}

export function ActivityBar() {
  const all = useSidebarViews();
  const current = useApp((s) => s.prefs.sidebarView);
  const visible = useApp((s) => s.prefs.explorerVisible);
  return (
    <nav className="activity-bar" aria-label="Views">
      {all.map((v) => {
        const active = visible && current === v.id;
        const key = v.command ? keybindingFor(v.command) : null;
        return (
          <button
            key={v.id}
            className={`activity-item${active ? " active" : ""}`}
            title={key ? `${v.title} (${formatKey(key)})` : v.title}
            aria-pressed={active}
            onClick={() => toggleSidebarView(v.id)}
          >
            <Icon name={v.icon} size={20} />
          </button>
        );
      })}
      <span className="activity-spacer" />
      <button className="activity-item" title="Settings" onClick={() => executeCommand("preferences.settings")}>
        <Icon name="settings" size={20} />
      </button>
    </nav>
  );
}

export function Sidebar() {
  const all = useSidebarViews();
  const current = useApp((s) => s.prefs.sidebarView);
  const width = useApp((s) => s.prefs.explorerWidth);
  const dragging = useRef(false);
  const view = all.find((v) => v.id === current) ?? all[0];
  if (!view) return null;
  return (
    <aside className="sidebar" style={{ width }} aria-label={view.title}>
      <div className="sidebar-view">{view.render()}</div>
      <div
        className="sash vertical"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
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
