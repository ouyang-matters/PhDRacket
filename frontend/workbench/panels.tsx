// The bottom panel framework. Every panel, built-in or contributed, is a
// registered view; the framework provides switching, closing, maximizing and
// resizing, so no feature invents its own drawer.

import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { setPanel, setPrefs, togglePanelMaximized, useApp } from "@frontend/app/store";
import { executeCommand } from "@frontend/commands/registry";
import { Icon, type IconName } from "./icons";

export interface PanelView {
  id: string;
  title: string;
  icon: IconName;
  order: number;
  render(): ReactNode;
  /** A count shown on the tab, if any. */
  badge?(): { count: number; tone?: "fail" } | null;
  /** Keep the view mounted while hidden (e.g. to keep editor state). */
  keepMounted?: boolean;
  /** Whether the panel is offered now (default: always). */
  visible?(): boolean;
}

let views: PanelView[] = [];
const listeners = new Set<() => void>();

export function registerPanelView(view: PanelView): () => void {
  views = [...views.filter((v) => v.id !== view.id), view].sort((a, b) => a.order - b.order);
  for (const l of listeners) l();
  return () => {
    views = views.filter((v) => v !== view);
    for (const l of listeners) l();
  };
}

export function usePanelViews(): PanelView[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => views,
  );
}

function Badge({ view }: { view: PanelView }) {
  // Select primitives: a fresh object per call would re-render forever.
  const count = useApp(() => view.badge?.()?.count ?? 0);
  const tone = useApp(() => view.badge?.()?.tone ?? null);
  if (count === 0) return null;
  return <span className={`badge${tone === "fail" ? " fail" : ""}`}>{count}</span>;
}

export function BottomPanel() {
  const registered = usePanelViews();
  const shownIds = useApp(() => registered.filter((v) => !v.visible || v.visible()).map((v) => v.id).join(","));
  const all = registered.filter((v) => shownIds.split(",").includes(v.id));
  const selected = useApp((s) => s.panel);
  const maximized = useApp((s) => s.panelMaximized);
  const height = useApp((s) => s.prefs.panelHeight);
  const dragging = useRef(false);
  const current = all.find((v) => v.id === selected) ?? all[0];
  if (!current) return null;

  return (
    <section className={`bottom-panel${maximized ? " maximized" : ""}`} style={maximized ? undefined : { height }} aria-label="Panel">
      {!maximized && (
        <div
          className="sash horizontal"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize panel"
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            const h = Math.min(Math.max(window.innerHeight - e.clientY - 24, 90), window.innerHeight - 160);
            setPrefs({ panelHeight: Math.round(h) });
          }}
          onPointerUp={() => (dragging.current = false)}
        />
      )}
      <div className="panel-header">
        <div className="panel-tabs" role="tablist" aria-label="Panels">
          {all.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={current.id === v.id}
              className={current.id === v.id ? "active" : ""}
              onClick={() => setPanel(v.id)}
            >
              <Icon name={v.icon} size={14} />
              {v.title}
              <Badge view={v} />
            </button>
          ))}
        </div>
        <div className="panel-actions">
          <button className="icon-button" title={maximized ? "Restore Panel Size" : "Maximize Panel"} onClick={togglePanelMaximized}>
            <Icon name={maximized ? "restore" : "maximize"} />
          </button>
          <button className="icon-button" title="Close Panel" onClick={() => executeCommand("view.togglePanel")}>
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className="panel-body">
        {/* Views that keep state stay in one place and are only hidden. */}
        {all
          .filter((v) => v.keepMounted)
          .map((v) => (
            <div key={v.id} hidden={v.id !== current.id} className="panel-view" role="tabpanel" aria-label={v.title}>
              {v.render()}
            </div>
          ))}
        {!current.keepMounted && (
          <div key={current.id} className="panel-view" role="tabpanel" aria-label={current.title}>
            {current.render()}
          </div>
        )}
      </div>
    </section>
  );
}
