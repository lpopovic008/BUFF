"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeftIcon } from "@/components/ui/Icon";
import { ScrollThumb } from "@/components/ScrollThumb";
import { useListScroll } from "@/hooks/useListScroll";
import { useRecapWriteup } from "@/app/(chrome)/recap/useRecapWriteup";
import { RecapEditor } from "@/app/(chrome)/recap/RecapEditor";
import { RecapContents } from "@/app/(chrome)/recap/RecapContents";

/** How long the panel takes to come up out of the floor, or go back down into it (ms). */
const RISE_MS = 450;
/** How far its header's dragged before it's a drag, not a tap (px); and how fast and far a drag down puts it away. */
const DRAG_START_PX = 6;
const FLING_PX_PER_MS = 0.8;
const FLING_WINDOW_MS = 100;
const FLING_MIN_PX = 24;

interface PanelProps {
  open: boolean;
  leagueId: string;
  week: number | null;
  /** Where its top stands (screen y): under the matchups — and its bottom. */
  top: number;
  bottom: number;
  /** Across the screen: its left edge and width (px) — else `className` places it. */
  left?: number;
  width?: number;
  className?: string;
  /** Puts it away: flung down by its header, or (`back`, from laptop width up) its own back button. */
  onClose: () => void;
  back?: boolean;
  /** Where the write-up's contents go (from laptop width up, the right-hand column): none, no contents. */
  contentsSlot?: HTMLElement | null;
}

/**
 * The League Room's write-ups: the league's write-up for the week (as the Write-ups page edits it, auto-saved) in a
 * panel up out of the floor to just under the week's matchups, the rest of the screen, see-through as the home
 * page's Red Zone is — its sections side by side as many as fit, scrolling within it, a section to add at the bottom.
 * Dragged up or down by its header (flung down, put away). From laptop width up, the write-up's contents go in
 * `contentsSlot`. Sinks back down when it's closed, then leaves.
 */
export function WriteupsPanel(props: PanelProps) {
  const { open } = props;
  // Up (or on its way), and drawn at all: kept drawn while it sinks.
  const [up, setUp] = useState(false);
  const [drawn, setDrawn] = useState(open);
  useEffect(() => {
    if (open) {
      const show = requestAnimationFrame(() => {
        setDrawn(true);
        requestAnimationFrame(() => setUp(true));
      });
      return () => cancelAnimationFrame(show);
    }
    const sink = requestAnimationFrame(() => setUp(false));
    const gone = window.setTimeout(() => setDrawn(false), RISE_MS);
    return () => {
      cancelAnimationFrame(sink);
      window.clearTimeout(gone);
    };
  }, [open]);
  if (!drawn && !open) return null;
  return <PanelBody {...props} up={up} />;
}

function PanelBody({ leagueId, week, top, bottom, left, width, className = "", onClose, back, contentsSlot, up }: PanelProps & { up: boolean }) {
  const { ready, error, actions, editorProps, contentsProps } = useRecapWriteup(leagueId, week);
  const [list, setList] = useState<HTMLDivElement | null>(null);
  // Scrolled as an iPhone scrolls (see useListScroll).
  useListScroll(list);

  // Its header dragged: its top where it's dragged to — as high as under the page's header, as low as leaves its own.
  const [dragTop, setDragTop] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const head = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const limits = useRef({ bottom, onClose });
  useEffect(() => {
    limits.current = { bottom, onClose };
  });
  useEffect(() => {
    const el = head.current;
    if (!el) return;
    let drag: { id: number; y0: number; top0: number; moved: boolean; trail: [number, number][] } | null = null;
    const highest = () => {
      const css = getComputedStyle(document.documentElement);
      return (parseFloat(css.getPropertyValue("--header-h")) || 0) + 0.5 * (parseFloat(css.fontSize) || 16);
    };
    const down = (e: PointerEvent) => {
      if (e.button > 0 || (e.target as Element).closest("button")) return;
      drag = { id: e.pointerId, y0: e.clientY, top0: box.current?.getBoundingClientRect().top ?? 0, moved: false, trail: [[e.timeStamp, e.clientY]] };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(dy) < DRAG_START_PX) return;
      if (!drag.moved) {
        drag.moved = true;
        setDragging(true);
      }
      drag.trail = [...drag.trail.filter(([t]) => e.timeStamp - t < FLING_WINDOW_MS), [e.timeStamp, e.clientY]];
      const lowest = limits.current.bottom - el.offsetHeight - 8;
      setDragTop(Math.min(lowest, Math.max(highest(), drag.top0 + dy)));
    };
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const done = drag;
      drag = null;
      if (!done.moved) return;
      setDragging(false);
      // Flung down: put away.
      const [t0, y0] = done.trail[0];
      const speed = (e.clientY - y0) / Math.max(1, e.timeStamp - t0);
      if (e.type === "pointerup" && speed > FLING_PX_PER_MS && e.clientY - done.y0 > FLING_MIN_PX) limits.current.onClose();
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const shownTop = dragTop ?? top;
  return (
    <>
      <div
        ref={box}
        data-floor-ui
        className={`fixed z-[6] overflow-hidden ${dragging ? "" : "transition-[top,height] duration-300 ease-out"} ${className}`}
        style={{ top: shownTop, height: Math.max(0, bottom - shownTop), left, width }}
      >
        <section
          aria-label="Write-ups"
          className="flex h-full flex-col transition-transform ease-out"
          style={{ transform: up ? "translateY(0)" : "translateY(100%)", transitionDuration: `${RISE_MS}ms` }}
        >
          {/* Its header: what it is, whether it's saved — and grabbed, it moves the panel. */}
          <div ref={head} className="flex shrink-0 cursor-ns-resize touch-none select-none items-center gap-1 py-1.5">
            {back ? (
              <button type="button" onClick={onClose} aria-label="Back" title="Back" className="-ml-1 flex h-6 w-6 items-center justify-center text-ink-secondary transition-colors hover:text-ink-primary">
                <ChevronLeftIcon width={16} height={16} />
              </button>
            ) : null}
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-primary">Write-ups</h2>
            <span className="ml-auto text-[0.625rem] text-ink-muted">
              {actions.lastSavedAt ? `Saved ${new Date(actions.lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ready ? "Not saved yet" : ""}
            </span>
          </div>
          <div className="relative min-h-0 flex-1">
            <div ref={setList} data-scroll-list className="h-full touch-none overflow-y-auto overscroll-none pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div>
                {error ? (
                  <p className="text-sm text-status-critical">{error}</p>
                ) : !ready ? (
                  <p className="text-sm text-ink-secondary">Loading the write-up…</p>
                ) : (
                  <RecapEditor {...editorProps} room />
                )}
              </div>
            </div>
            <ScrollThumb source={list} />
          </div>
        </section>
      </div>
      {contentsSlot && contentsProps && ready ? createPortal(<RecapContents {...contentsProps} scroller={list} />, contentsSlot) : null}
    </>
  );
}
