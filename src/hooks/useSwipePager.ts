"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/** How far a finger goes before it's a swipe, not a tap (px). */
const SLOP = 6;
/** How far a swipe's let-go speed carries it on (ms of it), to pick the page it ends on. */
const CARRY_MS = 180;
/** How much of a pull past the first or last page is followed. */
const PULL = 0.35;
/**
 * How stiffly the pages spring into place, as iOS's paging does: a critically damped spring (per ms), carrying on
 * from the finger's speed.
 */
const SPRING = 0.02;

/** Slid sideways by `x` px (none: back where it's drawn). */
function slide(el: HTMLElement | null, x: number | null) {
  if (el) el.style.transform = x === null ? "" : `translate3d(${x}px,0,0)`;
}

/**
 * Pages side by side, swiped through together: every one of `tracks` (rows of `count` pages, each as wide as the
 * track — the first surface's width, or narrower, moved in proportion) slid along as one by a sideways drag on any of `surfaces`, coming to rest on the
 * page it's let go nearest (carried on a little by its speed, never more than one page over) — then `onPick(page)`.
 * Slides there too when `index` changes from elsewhere. Up-and-down drags are left alone.
 *
 * `follow` is something drawn from where the pages stood when it was last placed (FloorReflection, placed on a window
 * resize): it's moved along with them as they slide, and placed again — a resize — once they've come to rest.
 */
export function useSwipePager({
  surfaces,
  tracks,
  follow,
  count,
  index,
  onPick,
}: {
  surfaces: (HTMLElement | null)[];
  tracks: (HTMLElement | null)[];
  follow: HTMLElement | null;
  count: number;
  index: number;
  onPick: (page: number) => void;
}) {
  // Where the pages are slid to (px from the first), and where they were when `follow` was last placed.
  const state = useRef({ x: 0, placedAt: 0, frame: 0, width: 1 });
  const latest = useRef({ tracks, follow, count, index, onPick });
  useEffect(() => {
    latest.current = { tracks, follow, count, index, onPick };
  });

  const width = () => surfaces[0]?.clientWidth || window.innerWidth;
  const apply = (x: number) => {
    const s = state.current;
    s.x = x;
    // Each track's pages as wide as it is (the swiped surface's may be wider), slid as far through them.
    for (const t of latest.current.tracks) slide(t, t ? (-x * t.clientWidth) / s.width : 0);
    slide(latest.current.follow, s.placedAt - x);
  };
  // At rest: what follows the pages placed again where they now stand.
  const settle = () => {
    const s = state.current;
    s.placedAt = s.x;
    slide(latest.current.follow, null);
    window.dispatchEvent(new Event("resize"));
  };
  // Into place from where the pages are, moving at `v` (px/ms, the way the pages are slid) to begin with.
  const slideTo = (page: number, then?: () => void, v = 0) => {
    const s = state.current;
    cancelAnimationFrame(s.frame);
    const to = page * width();
    const x0 = s.x - to;
    const done = () => {
      s.frame = 0;
      apply(to);
      settle();
      then?.();
    };
    if (Math.abs(x0) < 0.5 && Math.abs(v) < 0.05) return done();
    const start = performance.now();
    const step = (now: number) => {
      const t = now - start;
      const fade = Math.exp(-SPRING * t);
      const x = (x0 + (v + SPRING * x0) * t) * fade;
      const speed = (v - SPRING * (v + SPRING * x0) * t) * fade;
      if (Math.abs(x) < 0.5 && Math.abs(speed) < 0.02) return done();
      apply(to + x);
      s.frame = requestAnimationFrame(step);
    };
    s.frame = requestAnimationFrame(step);
  };

  // On the page picked: there at once at first, slid over to when it's picked from elsewhere.
  const placed = useRef(false);
  useLayoutEffect(() => {
    const s = state.current;
    if (!placed.current || s.width !== width()) {
      placed.current = true;
      s.width = width();
      apply(index * s.width);
      settle();
      return;
    }
    // A track that's new (or redrawn) put where the others are.
    apply(s.x);
    if (!s.frame && Math.abs(s.x - index * s.width) > 0.5) slideTo(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the page changes, or the tracks do
  }, [index, count, tracks[0], tracks[1], follow]);

  // A new screen width: still on the same page.
  useEffect(() => {
    const el = surfaces[0];
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const s = state.current;
      const w = width();
      if (w === s.width) return;
      s.width = w;
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      apply(latest.current.index * w);
      s.placedAt = s.x;
      slide(latest.current.follow, null);
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the first surface sets the width
  }, [surfaces[0]]);

  useEffect(() => {
    const els = surfaces.filter((s): s is HTMLElement => s !== null);
    if (els.length === 0) return;
    let drag: { id: number; on: HTMLElement; x: number; y: number; base: number; sideways: boolean | null; samples: [number, number][] } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag = { id: e.pointerId, on: e.currentTarget as HTMLElement, x: e.clientX, y: e.clientY, base: state.current.x, sideways: null, samples: [[e.timeStamp, e.clientX]] };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (drag.sideways === null) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return;
        drag.sideways = Math.abs(dx) > Math.abs(dy);
        if (!drag.sideways) {
          drag = null;
          return;
        }
        cancelAnimationFrame(state.current.frame);
        state.current.frame = 0;
        drag.base = state.current.x;
        drag.x = e.clientX;
        drag.on.setPointerCapture(e.pointerId);
      }
      drag.samples.push([e.timeStamp, e.clientX]);
      if (drag.samples.length > 8) drag.samples.shift();
      const last = (latest.current.count - 1) * width();
      const raw = drag.base - (e.clientX - drag.x);
      apply(raw < 0 ? raw * PULL : raw > last ? last + (raw - last) * PULL : raw);
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.sideways) return;
      // Not a tap on what it started on.
      const swallow = (c: MouseEvent) => {
        c.stopPropagation();
        c.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      const recent = d.samples.filter(([t]) => e.timeStamp - t < 100);
      const [t0, x0] = recent[0] ?? [e.timeStamp, e.clientX];
      const [t1, x1] = recent.at(-1) ?? [e.timeStamp, e.clientX];
      const v = e.type === "pointerup" && t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;
      const w = width();
      const { count, index } = latest.current;
      const from = Math.round(d.base / w);
      const aimed = Math.round((state.current.x - v * CARRY_MS) / w);
      const target = Math.max(0, from - 1, Math.min(count - 1, from + 1, aimed));
      // On from the finger's speed (the pages move the other way to it).
      slideTo(
        target,
        () => {
          if (target !== index) latest.current.onPick(target);
        },
        -v
      );
    };
    for (const el of els) {
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    }
    return () => {
      for (const el of els) {
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the surfaces themselves
  }, [surfaces[0], surfaces[1]]);
}
