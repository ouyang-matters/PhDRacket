// A small celebration, hidden in plain sight: click the mark in the menu bar
// seven times in a row and the mortarboard is tossed. It flips on the way
// down so the tassel lands on the other side (at graduation the tassel moves
// from right to left), parentheses rain down, and the graduate is
// congratulated. Once per session; nothing is saved, sent or changed, and
// with reduced motion only the message appears.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useApp } from "@frontend/app/store";
import { BrandMark } from "./BrandMark";

const CLICKS = 7;
/** Clicks further apart than this start the count again. */
const GAP_MS = 600;
const PIECES = ["(", ")", "(", ")", "λ", "(", ")"];

let played = false;

function prefersReducedMotion(pref: boolean): boolean {
  return pref || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** The menu bar's mark, which counts clicks. */
export function TossableMark({ size, className }: { size: number; className?: string }) {
  const reduced = useApp((s) => s.prefs.reducedMotion);
  const clicks = useRef<number[]>([]);
  const ref = useRef<HTMLSpanElement>(null);
  const [toss, setToss] = useState<{ x: number; y: number; reduced: boolean } | null>(null);

  const onClick = () => {
    if (played) return;
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t) => now - t < GAP_MS * CLICKS), now].slice(-CLICKS);
    const quick = clicks.current.every((t, i) => i === 0 || t - clicks.current[i - 1] < GAP_MS);
    if (clicks.current.length === CLICKS && quick) {
      played = true;
      clicks.current = [];
      const r = ref.current?.getBoundingClientRect();
      setToss({ x: r ? r.left + r.width / 2 : 20, y: r ? r.top + r.height / 2 : 14, reduced: prefersReducedMotion(reduced) });
    }
  };

  return (
    <>
      <span ref={ref} className={`tossable-mark${toss && !toss.reduced ? " tossed" : ""}`} onClick={onClick} aria-hidden>
        <BrandMark size={size} className={className} />
      </span>
      {toss && <CapToss {...toss} size={size} onDone={() => setToss(null)} />}
    </>
  );
}

function CapToss({ x, y, size, reduced, onDone }: { x: number; y: number; size: number; reduced: boolean; onDone: () => void }) {
  const [pieces] = useState(() =>
    reduced
      ? []
      : Array.from({ length: 42 }, (_, i) => ({
          ch: PIECES[i % PIECES.length],
          left: Math.random() * 100,
          delay: 650 + Math.random() * 900,
          duration: 1600 + Math.random() * 1400,
          drift: (Math.random() - 0.5) * 160,
          spin: (Math.random() - 0.5) * 900,
          size: 14 + Math.random() * 18,
          accent: i % 3 === 0,
        })),
  );
  useEffect(() => {
    const t = window.setTimeout(onDone, reduced ? 3200 : 4600);
    return () => window.clearTimeout(t);
  }, [onDone, reduced]);

  return (
    <div className={`cap-toss${reduced ? " reduced" : ""}`} aria-live="polite">
      {!reduced && (
        <span className="cap-toss-cap" style={{ left: x - size, top: y - size } as CSSProperties}>
          <BrandMark size={size * 2} />
        </span>
      )}
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`cap-toss-piece${p.accent ? " accent" : ""}`}
          style={
            {
              left: `${p.left}%`,
              fontSize: p.size,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
            } as CSSProperties
          }
        >
          {p.ch}
        </span>
      ))}
      <div className="cap-toss-message" role="status">
        <strong>Congratulations, Doctor.</strong>
        <span>The tassel has been moved.</span>
      </div>
    </div>
  );
}
