"use client";

// The league page's matchups list (tablet and up), as a wheel: the picked
// matchup sits in the middle, and the rest turn away above and below it,
// dimmer the farther round they are. The mouse wheel (or a trackpad, or the
// arrow keys) turns it a matchup at a time, round and round; clicking one
// turns it to the middle.

import { useEffect, useLayoutEffect, useRef } from "react";

/** How far apart the boxes sit: a box (4.5rem) and the gap under it. */
const STEP_REM = 4.875;
/** How long a turn takes. */
const TURN_MS = 280;
/** Scroll that adds up to a turn — one mouse-wheel notch, or a short trackpad swipe. */
const TURN_DELTA = 40;
/** The quickest the wheel turns again, so a fast swipe doesn't spin it off. */
const MIN_TURN_GAP_MS = 80;

/** Where a box `offset` places from the middle sits, and how bright it is. */
function slotStyle(offset: number, visible: boolean): { transform: string; opacity: number } {
  const d = Math.abs(offset);
  return {
    transform: `translateY(${offset * STEP_REM}rem) rotateX(${-offset * 14}deg) scale(${1 - 0.07 * Math.min(d, 4)})`,
    opacity: visible ? Math.max(0.18, 1 - 0.32 * d) : 0,
  };
}

const mod = (x: number, n: number) => ((x % n) + n) % n;

/** Whether the box `offset` places from the middle shows — never one item twice. */
function visibleAt(offset: number, n: number, reach: number): boolean {
  return n === 2 ? offset === 0 || offset === 1 : Math.abs(offset) <= reach;
}

export function MatchupWheel<T>({
  items,
  index,
  onPick,
  render,
  label,
}: {
  items: T[];
  /** The picked item, in the middle. */
  index: number;
  onPick: (index: number) => void;
  render: (item: T, active: boolean) => React.ReactNode;
  label: string;
}) {
  const n = items.length;
  // How many show on each side of the middle — never so many that one shows twice.
  const reach = n <= 1 ? 0 : n === 2 ? 1 : Math.min(3, Math.floor((n - 1) / 2));
  // One hidden slot past each end, for a box to turn in from (or out to).
  const offsets = Array.from({ length: 2 * reach + 3 }, (_, i) => i - reach - 1);

  // Turning: every slot's new box starts where it just was and turns into place.
  const slots = useRef(new Map<number, HTMLElement>());
  const shown = useRef(index);
  useLayoutEffect(() => {
    const prev = shown.current;
    shown.current = index;
    if (prev === index || n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let turn = mod(index - prev, n);
    if (turn > n / 2) turn -= n;
    for (const [offset, el] of slots.current) {
      el.animate([slotStyle(offset + turn, visibleAt(offset + turn, n, reach)), slotStyle(offset, visibleAt(offset, n, reach))], {
        duration: TURN_MS,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
  }, [index, n, reach]);

  // The latest turn, for the wheel listener (added once) to call.
  const turnBy = useRef<(by: number) => void>(() => {});
  useEffect(() => {
    turnBy.current = (by: number) => {
      if (n > 1) onPick(mod(index + by, n));
    };
  });

  const wheel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wheel.current;
    if (!el) return;
    let total = 0;
    let lastTurn = 0;
    const onWheel = (e: WheelEvent) => {
      // The wheel turns the matchups, not the page.
      e.preventDefault();
      total += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const now = performance.now();
      if (Math.abs(total) < TURN_DELTA || now - lastTurn < MIN_TURN_GAP_MS) return;
      lastTurn = now;
      turnBy.current(total > 0 ? 1 : -1);
      total = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={wheel}
      role="group"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          turnBy.current(e.key === "ArrowDown" ? 1 : -1);
        }
      }}
      className="relative overflow-hidden outline-none [perspective:60rem] focus-visible:ring-1 focus-visible:ring-ink-muted/40"
      style={{ height: `${(2 * reach + 1) * STEP_REM}rem` }}
    >
      {offsets.map((offset) => {
        const visible = visibleAt(offset, n, reach);
        const itemIndex = mod(index + offset, Math.max(1, n));
        const item = items[itemIndex];
        if (item === undefined) return null;
        return (
          <div
            key={offset}
            ref={(el) => {
              if (el) slots.current.set(offset, el);
              else slots.current.delete(offset);
            }}
            aria-hidden={!visible || undefined}
            className={`absolute inset-x-0 top-1/2 -mt-[2.25rem] h-[4.5rem] ${visible ? "" : "pointer-events-none"}`}
            style={{ ...slotStyle(offset, visible), zIndex: 10 - Math.abs(offset) }}
          >
            <button
              type="button"
              tabIndex={-1}
              aria-current={offset === 0 || undefined}
              onClick={() => offset !== 0 && onPick(itemIndex)}
              className={`flex h-full w-full items-center border px-3 text-left transition-colors ${
                offset === 0
                  ? "border-ink-primary bg-[color-mix(in_srgb,var(--map-tag)_7%,var(--page))]"
                  : "border-border bg-page hover:border-ink-primary/40"
              }`}
            >
              <span className="min-w-0 flex-1">{render(item, offset === 0)}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
