// The quick input: one picker for the command palette, Quick Open, the
// theme picker and other choices. Callers describe items and what happens
// on highlight, accept and cancel.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

export interface QuickItem {
  id: string;
  label: string;
  /** Muted text after the label. */
  description?: string;
  /** Right-aligned text, e.g. a keybinding. */
  detail?: string;
  icon?: ReactNode;
}

export interface QuickPick {
  placeholder: string;
  items: QuickItem[] | (() => Promise<QuickItem[]>);
  initialValue?: string;
  /** Item to highlight first. */
  activeId?: string;
  onAccept(item: QuickItem, value: string): void;
  onHighlight?(item: QuickItem | null): void;
  onCancel?(): void;
  /** Lets typed text switch pickers (e.g. ">" opens the command palette). */
  onValue?(value: string): boolean;
  /** Text shown when nothing matches. */
  empty?: string;
}

/** The open picker; a new object for every pick, so React sees each one. */
let current: { pick: QuickPick; generation: number } | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function set(next: QuickPick | null) {
  current = next ? { pick: next, generation: ++generation } : null;
  for (const l of listeners) l();
}

export function quickPick(pick: QuickPick) {
  set(pick);
}

export function closeQuickInput() {
  set(null);
}

/** Subsequence match score (higher is better), or -1 if no match. */
export function matchScore(label: string, query: string): number {
  if (!query) return 0;
  const l = label.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const idx = l.indexOf(q);
  if (idx >= 0) return 1000 - idx * 2 - (l.length - q.length) * 0.1;
  let score = 0;
  let at = 0;
  let prev = -2;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = l.indexOf(ch, at);
    if (found < 0) return -1;
    score += found === prev + 1 ? 5 : 1;
    if (found === 0 || /[\s:./\\_-]/.test(l[found - 1])) score += 3;
    prev = found;
    at = found + 1;
  }
  return score;
}

export function filterItems(items: QuickItem[], query: string): QuickItem[] {
  if (!query.trim()) return items;
  return items
    .map((item) => ({ item, score: Math.max(matchScore(item.label, query), matchScore(`${item.label} ${item.description ?? ""}`, query) - 50) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

function Picker({ pick }: { pick: QuickPick }) {
  const [value, setValue] = useState(pick.initialValue ?? "");
  const [items, setItems] = useState<QuickItem[] | null>(Array.isArray(pick.items) ? pick.items : null);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (Array.isArray(pick.items)) return;
    let live = true;
    void pick.items().then((i) => live && setItems(i));
    return () => {
      live = false;
    };
  }, [pick]);

  const shown = useMemo(() => filterItems(items ?? [], value), [items, value]);

  // Start on the requested item.
  useEffect(() => {
    if (!pick.activeId || !items) return;
    const i = items.findIndex((x) => x.id === pick.activeId);
    if (i >= 0) setIndex(i);
  }, [items, pick.activeId]);

  useEffect(() => {
    pick.onHighlight?.(shown[index] ?? null);
    list.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }, [index, shown, pick]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const cancel = () => {
    if (done.current) return;
    done.current = true;
    pick.onCancel?.();
    closeQuickInput();
  };
  const accept = (item: QuickItem | undefined) => {
    if (!item || done.current) return;
    done.current = true;
    closeQuickInput();
    pick.onAccept(item, value);
  };

  return (
    <div className="quick-input-backdrop" onMouseDown={cancel}>
      <div className="quick-input" role="dialog" aria-label={pick.placeholder} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={value}
          placeholder={pick.placeholder}
          aria-label={pick.placeholder}
          aria-controls="quick-input-list"
          aria-activedescendant={shown[index] ? `quick-${index}` : undefined}
          role="combobox"
          aria-expanded
          onChange={(e) => {
            const v = e.target.value;
            if (pick.onValue?.(v)) return;
            setValue(v);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "PageDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 10, shown.length - 1));
            } else if (e.key === "PageUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 10, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              accept(shown[index]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancel();
            }
          }}
        />
        <ul className="quick-list" role="listbox" id="quick-input-list" ref={list}>
          {items === null && <li className="quick-empty">Loading…</li>}
          {items !== null && shown.length === 0 && <li className="quick-empty">{pick.empty ?? "No matching results"}</li>}
          {shown.slice(0, 300).map((item, i) => (
            <li
              key={item.id}
              id={`quick-${i}`}
              role="option"
              aria-selected={i === index}
              className={i === index ? "selected" : undefined}
              onMouseMove={() => i !== index && setIndex(i)}
              onClick={() => accept(item)}
            >
              {item.icon && <span className="quick-icon">{item.icon}</span>}
              <span className="quick-label">{item.label}</span>
              {item.description && <span className="quick-description">{item.description}</span>}
              {item.detail && <kbd className="quick-detail">{item.detail}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function QuickInputHost() {
  const state = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  if (!state) return null;
  return <Picker key={state.generation} pick={state.pick} />;
}
