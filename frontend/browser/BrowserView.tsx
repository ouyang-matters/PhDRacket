// A browser tab's content: an address bar and the page. The page is a
// native webview (apps/desktop/src-tauri/src/browser.rs) kept exactly over
// the placeholder below the address bar. Native views sit above the HTML, so
// the page is hidden while a menu, dialog or palette would overlap it.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { backend, type Bounds } from "@frontend/ipc/backend";
import { getState, notify, openWebTab, rememberWebAddress, updateWebTab, useApp, type WebTab } from "@frontend/app/store";
import { Icon } from "@frontend/workbench/icons";
import { toWebAddress } from "./address";

/** Elements drawn above the editor area that a page must not cover. */
const OVERLAYS = ".modal-backdrop, .context-menu, .quick-input-backdrop, .menubar-dropdown, .cap-toss, .unsaved-backdrop, [role='menu']";

/** Pages created so far (a page survives its tab moving between groups). */
const created = new Set<string>();

let listening = false;
function listenOnce() {
  if (listening) return;
  listening = true;
  void backend.onBrowserEvent((e) => {
    if (e.kind === "load") {
      updateWebTab(e.id, { url: e.url, loading: e.loading });
      if (!e.loading && /^https?:/.test(e.url)) rememberWebAddress(e.url);
    } else if (e.kind === "title") {
      if (e.title.trim()) updateWebTab(e.id, { title: e.title.trim() });
    } else if (e.kind === "new-tab") {
      if (/^https?:/.test(e.url)) openWebTab(e.url);
    } else if (e.kind === "blocked") {
      notify("info", `Only web pages open in browser tabs; ${e.url.split(":")[0]}: links are not followed.`);
    }
  });
}

function overlapsOverlay(r: DOMRect): boolean {
  for (const el of document.querySelectorAll(OVERLAYS)) {
    const o = el.getBoundingClientRect();
    if (o.width && o.height && o.left < r.right && o.right > r.left && o.top < r.bottom && o.bottom > r.top) return true;
  }
  return false;
}

/** Keeps the native page over `host` while `active`, hidden otherwise. */
function usePlacement(tab: WebTab, host: React.RefObject<HTMLDivElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !tab.url) return;
    let frame = 0;
    let last = "";
    let alive = true;
    const place = () => {
      frame = 0;
      if (!alive) return;
      const r = el.getBoundingClientRect();
      const visible = active && r.width > 4 && r.height > 4 && !overlapsOverlay(r);
      const bounds: Bounds = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
      const key = `${visible}:${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
      if (key === last) return;
      last = key;
      if (!created.has(tab.id)) {
        if (!visible) return;
        created.add(tab.id);
        backend.browserOpen(tab.id, tab.url, bounds).catch((e) => {
          created.delete(tab.id);
          notify("error", `Cannot open the page: ${e}`);
        });
        return;
      }
      void backend.browserPlace(tab.id, bounds, visible).catch(() => {});
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    schedule();
    const resize = new ResizeObserver(schedule);
    resize.observe(el);
    resize.observe(document.body);
    // Menus and dialogs come and go anywhere in the document.
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    const poll = window.setInterval(schedule, 500);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.clearInterval(poll);
      if (created.has(tab.id)) void backend.browserPlace(tab.id, { x: 0, y: 0, width: 1, height: 1 }, false).catch(() => {});
    };
  }, [tab.id, tab.url === "", active, host]);
}

export function BrowserView({ id, active }: { id: string; active: boolean }) {
  listenOnce();
  const tab = useApp((s) => s.webTabs.find((t) => t.id === id) ?? null);
  const recent = useApp((s) => s.prefs.browserRecent);
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState(tab?.url ?? "");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setAddress(tab?.url ?? "");
  }, [tab?.url, editing]);
  useEffect(() => {
    if (tab && !tab.url && active) input.current?.focus();
  }, [tab, active]);

  usePlacement(tab ?? { id, url: "", title: "", loading: false }, host, active);
  if (!tab) return null;

  const go = (text: string) => {
    const url = toWebAddress(text);
    if (!url) {
      notify("warning", "Enter a web address, such as student.cs.uwaterloo.ca/~cs145.");
      return;
    }
    setEditing(false);
    input.current?.blur();
    if (!tab.url) updateWebTab(tab.id, { url, title: url, loading: true });
    else void backend.browserNavigate(tab.id, url).catch((e) => notify("error", String(e)));
  };
  const history = (action: "back" | "forward" | "reload") => void backend.browserHistory(tab.id, action).catch(() => {});

  return (
    <div className="browser-view" data-key-context="browser">
      <form
        className="browser-bar"
        onSubmit={(e) => {
          e.preventDefault();
          go(address);
        }}
      >
        <button type="button" className="icon-button" title="Back" aria-label="Back" disabled={!tab.url} onClick={() => history("back")}>
          <Icon name="back" size={15} />
        </button>
        <button type="button" className="icon-button" title="Forward" aria-label="Forward" disabled={!tab.url} onClick={() => history("forward")}>
          <Icon name="forward" size={15} />
        </button>
        <button type="button" className="icon-button" title="Reload" aria-label="Reload" disabled={!tab.url} onClick={() => history("reload")}>
          <Icon name={tab.loading ? "stop" : "restart"} size={14} />
        </button>
        <input
          ref={input}
          className="browser-address"
          aria-label="Address"
          placeholder="Type a web address, e.g. the assignment page"
          list={`browser-recent-${tab.id}`}
          spellCheck={false}
          value={address}
          onFocus={(e) => {
            setEditing(true);
            e.currentTarget.select();
          }}
          onBlur={() => setEditing(false)}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go(e.currentTarget.value);
            }
            if (e.key === "Escape") {
              setAddress(tab.url);
              e.currentTarget.blur();
            }
          }}
        />
        <datalist id={`browser-recent-${tab.id}`}>
          {recent.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <button
          type="button"
          className="icon-button"
          title="Open in your web browser"
          aria-label="Open in your web browser"
          disabled={!/^https:/.test(tab.url)}
          onClick={() => void openUrl(tab.url).catch((e) => notify("error", String(e)))}
        >
          <Icon name="external" size={14} />
        </button>
      </form>
      <div className="browser-page" ref={host}>
        {!tab.url && (
          <div className="browser-empty">
            <p>Open a page beside your code: an assignment, the course notes, the documentation.</p>
            {recent.length > 0 && (
              <>
                <h3>Recent</h3>
                <ul>
                  {recent.slice(0, 8).map((u) => (
                    <li key={u}>
                      <button className="link" onClick={() => go(u)}>
                        {u}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="muted small">Pages open inside PhDRacket. They cannot see your files or run anything in PhDRacket.</p>
          </div>
        )}
        {tab.url && tab.loading && <div className="browser-loading" aria-hidden />}
      </div>
    </div>
  );
}

/** The command: a new browser tab, beside the code when a file is open. */
export function openBrowserTab(toSide = false) {
  const hasEditor = !!getState().layout.groups[getState().layout.activeGroup]?.tabs.length;
  return openWebTab("", toSide && hasEditor);
}
