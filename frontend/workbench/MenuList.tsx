// Renders a menu from the menu model: used by the menu bar and context
// menus. Items run commands through the registry; nothing here implements
// an action.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { executeCommand, getCommand, isEnabled, useCommandsVersion } from "@frontend/commands/registry";
import { formatKey, keybindingFor } from "@frontend/commands/keybindings";
import { menuTitle, resolveMenu, useMenusVersion, type MenuId, type MenuItem } from "@frontend/commands/menus";
import { Icon } from "./icons";

function itemEnabled(item: MenuItem): boolean {
  if (!item.command) return true;
  const c = getCommand(item.command);
  return !!c && isEnabled(c);
}

function itemChecked(item: MenuItem): boolean | null {
  const c = item.command ? getCommand(item.command) : undefined;
  return c?.checked ? c.checked() : null;
}

/** `args`: passed to commands whose item has none (e.g. the tab a context menu is for). */
export function MenuList({ menu, onDone, label, autoFocus = true, args }: { menu: MenuId; onDone: () => void; label: string; autoFocus?: boolean; args?: unknown }) {
  useCommandsVersion();
  useMenusVersion();
  const groups = resolveMenu(menu);
  const [submenu, setSubmenu] = useState<number | null>(null);
  const ref = useRef<HTMLUListElement>(null);
  const flat = groups.flat();

  useEffect(() => {
    if (autoFocus) ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [autoFocus]);

  const onKey = (e: ReactKeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>(":scope > li > button:not(:disabled)") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onDone();
    }
  };

  const run = (item: MenuItem) => {
    if (!item.command) return;
    onDone();
    // Let the menu close (and focus return) before the command runs.
    requestAnimationFrame(() => executeCommand(item.command!, item.args ?? args));
  };

  return (
    <ul className="menu-list" role="menu" aria-label={label} ref={ref} onKeyDown={onKey}>
      {groups.map((group, gi) =>
        group.map((item, ii) => {
          const index = flat.indexOf(item);
          const checked = itemChecked(item);
          const key = item.command ? keybindingFor(item.command) : null;
          const separator = gi > 0 && ii === 0;
          if (item.submenu) {
            return (
              <li key={`${gi}-${ii}`} className={separator ? "separated" : undefined} onMouseEnter={() => setSubmenu(index)} onMouseLeave={() => setSubmenu(null)}>
                <button
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={submenu === index}
                  onClick={() => setSubmenu(index)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      setSubmenu(index);
                    }
                  }}
                >
                  <span className="menu-check" />
                  <span className="menu-label">{menuTitle(item)}</span>
                  <Icon name="chevron" size={14} />
                </button>
                {submenu === index && (
                  <div className="submenu" onKeyDown={(e) => e.key === "ArrowLeft" && (e.stopPropagation(), setSubmenu(null))}>
                    <MenuList menu={item.submenu} onDone={onDone} label={menuTitle(item)} autoFocus={false} args={args} />
                  </div>
                )}
              </li>
            );
          }
          return (
            <li key={`${gi}-${ii}`} className={separator ? "separated" : undefined}>
              <button
                role={checked === null ? "menuitem" : "menuitemcheckbox"}
                aria-checked={checked ?? undefined}
                disabled={!itemEnabled(item)}
                onClick={() => run(item)}
              >
                <span className="menu-check">{checked ? "✓" : ""}</span>
                <span className="menu-label">{menuTitle(item)}</span>
                {key && <span className="menu-key">{formatKey(key)}</span>}
              </button>
            </li>
          );
        }),
      )}
    </ul>
  );
}
