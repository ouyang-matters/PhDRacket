// Logs that grow while you read them (Interactions, task output): stay at the
// end as output arrives, but stop following once the user scrolls up, so
// new output does not pull the view back down.

import { useLayoutEffect, useRef, type RefObject, type WheelEvent } from "react";

/** How close to the end still counts as "at the end" (fractional scroll
 * positions on scaled displays never reach it exactly). */
const SLACK = 16;

export function useStickToBottom(ref: RefObject<HTMLElement | null>, content: unknown) {
  const following = useRef(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Nothing to scroll (e.g. just cleared): follow whatever comes next.
    if (el.scrollHeight <= el.clientHeight) following.current = true;
    if (following.current) el.scrollTop = el.scrollHeight;
  }, [content]);

  return {
    /** Spread onto the scrolling element. */
    props: {
      onScroll() {
        const el = ref.current;
        if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight <= SLACK;
      },
      // Decide on the gesture itself: a scroll event can arrive after the
      // next chunk of output has already moved the view back to the end.
      onWheel(e: WheelEvent) {
        if (e.deltaY < 0) following.current = false;
      },
    },
    /** Follow the end again, e.g. after the user submits something. */
    follow() {
      following.current = true;
    },
  };
}
