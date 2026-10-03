// The application menu bar: File, Edit, Selection, View, Go, Run, Tools,
// Help. Menus come from the menu model ("menubar.file", ...), so extensions
// can contribute items. Alt opens the first menu; arrow keys move between
// menus.

import { useEffect, useRef, useState } from "react";
import { resolveMenu, useMenusVersion } from "@frontend/commands/menus";
import { MenuList } from "./MenuList";
import { BrandMark } from "./BrandMark";

export const MENUBAR: { id: string; title: string }[] = [
  { id: "menubar.file", title: "File" },
  { id: "menubar.edit", title: "Edit" },
  { id: "menubar.selection", title: "Selection" },
  { id: "menubar.view", title: "View" },
  { id: "menubar.go", title: "Go" },
  { id: "menubar.run", title: "Run" },
  { id: "menubar.tools", title: "Tools" },
  { id: "menubar.help", title: "Help" },
];

export function MenuBar({ children }: { children?: React.ReactNode }) {
  useMenusVersion();
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menus = MENUBAR.filter((m) => resolveMenu(m.id).length > 0);

  useEffect(() => {
    if (open === null) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  // Alt alone toggles the first menu, as in desktop applications.
  useEffect(() => {
    let alone = false;
    const down = (e: KeyboardEvent) => (alone = e.key === "Alt" && !e.ctrlKey && !e.shiftKey && !e.metaKey);
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt" && alone) {
        e.preventDefault();
        setOpen((o) => (o === null ? 0 : null));
      }
      alone = false;
    };
    const other = (e: KeyboardEvent) => e.key !== "Alt" && (alone = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keydown", other, true);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keydown", other, true);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return (
    <header className="menubar" ref={ref} data-tauri-drag-region>
      <BrandMark size={18} className="menubar-mark" />
      <nav role="menubar" aria-label="Application menu" className="menubar-menus">
        {menus.map((m, i) => (
          <div key={m.id} className="menubar-entry">
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open === i}
              className={`menubar-item${open === i ? " open" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(open === i ? null : i);
              }}
              onMouseEnter={() => open !== null && setOpen(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(i);
                }
              }}
            >
              {m.title}
            </button>
            {open === i && (
              <div
                className="menubar-dropdown"
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") setOpen((i + 1) % menus.length);
                  else if (e.key === "ArrowLeft") setOpen((i - 1 + menus.length) % menus.length);
                }}
              >
                <MenuList key={m.id} menu={m.id} label={m.title} onDone={() => setOpen(null)} />
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="menubar-spacer" data-tauri-drag-region />
      {children}
    </header>
  );
}
