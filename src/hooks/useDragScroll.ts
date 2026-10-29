"use client";

import { useEffect } from "react";

/**
 * Fired on a list moved by useDragScroll each time it moves it, there and then — so what follows the list (its
 * reflection, see FloorReflection) moves in the same frame as it, pulled past its ends and springing back included.
 */
export const DRAG_SCROLL_EVENT = "drag-scroll";

/** How far a finger goes before it's scrolling the list, not tapping it (px). */
const SLOP = 6;
/** A flick's glide: how quickly it slows (its time constant, ms) — and how stiffly the list springs back from past an end (per ms). */
const DECAY_MS = 325;
const SPRING = 0.02;
/** How much of a finger's pull past an end the list follows: less the further it's pulled, as on a phone. */
const PULL = 0.55;
/** How long after a wheel or trackpad stops pushing past an end the list springs back (ms). */
const WHEEL_SETTLE_MS = 120;

/**
 * A list (`el`, a scroll box the browser can't scroll by touch: touch-action none, marked data-drag-scroll so what
 * follows it knows) scrolled by the page itself rather than the browser: dragged with a finger (or
 * the mouse), flicked to glide on, pulled a little way past either end to spring back, and scrolled by a wheel or
 * trackpad (pushed past an end too, springing back once it stops) — so the list and anything following it move
 * together, each move announced (DRAG_SCROLL_EVENT). Within
 * its ends it's the element's own scroll position (scrollTop, its scroll events, and anything that scrolls it into
 * view all as usual — and moved by the graphics card, nothing repainted); past them, the distance as --overscroll
 * on it, for its contents to move by (set only as it changes: every change restyles the whole list). Drags that start
 * sideways, or on something that takes the finger itself (touch-action: none, like a graph), are left alone.
 */
export function useDragScroll(el: HTMLElement | null) {
  useEffect(() => {
    if (!el) return;
    el.setAttribute("data-drag-scroll", "");
    // Where the list is shown: within its ends, its scrollTop; past them, by how far (`over`).
    let over = 0;
    let frame = 0;
    const max = () => Math.max(0, el.scrollHeight - el.clientHeight);
    const at = () => el.scrollTop - over;
    const show = (p: number) => {
      const s = Math.min(max(), Math.max(0, p));
      const past = s - p;
      el.scrollTop = s;
      if (past !== over) el.style.setProperty("--overscroll", `${past}px`);
      over = past;
      el.dispatchEvent(new Event(DRAG_SCROLL_EVENT));
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    // A finger's pull past an end, as far as the list follows it.
    const pulled = (raw: number) => {
      const m = max();
      const end = raw < 0 ? 0 : raw > m ? m : null;
      if (end === null) return raw;
      const h = el.clientHeight || 1;
      const past = Math.abs(raw - end);
      return end + Math.sign(raw - end) * (1 - 1 / ((past * PULL) / h + 1)) * h;
    };
    // Back to the end it's past, from `x` past it moving at `v` (px/ms): a critically damped spring.
    const springBack = (end: number, x0: number, v0: number) => {
      const start = performance.now();
      const step = (now: number) => {
        const t = now - start;
        const x = (x0 + (v0 + SPRING * x0) * t) * Math.exp(-SPRING * t);
        if (Math.abs(x) < 0.5 && t > 50) {
          show(end);
          frame = 0;
          return;
        }
        show(end + x);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    // Gliding on from `p0` at `v` (px/ms) — into an end, on past it a little and back.
    const glide = (p0: number, v: number) => {
      stop();
      const m = max();
      if (p0 < 0 || p0 > m) return springBack(p0 < 0 ? 0 : m, p0 - (p0 < 0 ? 0 : m), 0);
      if (Math.abs(v) < 0.05) return;
      const reach = v * DECAY_MS;
      const start = performance.now();
      const step = (now: number) => {
        const t = now - start;
        const fade = Math.exp(-t / DECAY_MS);
        const p = p0 + reach * (1 - fade);
        const speed = (reach / DECAY_MS) * fade;
        if (p < 0 || p > m) {
          const end = p < 0 ? 0 : m;
          show(end);
          return springBack(end, 0, speed);
        }
        show(p);
        frame = Math.abs(speed) > 0.01 ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    };

    let drag: { id: number; x: number; y: number; from: number; scrolling: boolean | null; samples: [number, number][] } | null = null;
    let swallowClick = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const own = (e.target as Element).closest(".touch-none, [data-own-touch]");
      if (own && own !== el && el.contains(own)) return;
      stop();
      swallowClick = false;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: at(), scrolling: null, samples: [[e.timeStamp, e.clientY]] };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (drag.scrolling === null) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return;
        drag.scrolling = Math.abs(dy) > Math.abs(dx);
        if (!drag.scrolling) {
          drag = null;
          return;
        }
        el.setPointerCapture(e.pointerId);
      }
      drag.samples.push([e.timeStamp, e.clientY]);
      if (drag.samples.length > 8) drag.samples.shift();
      show(pulled(drag.from - dy));
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.scrolling) return;
      swallowClick = true;
      // The finger's speed over its last moments (none if it stopped before letting go).
      const recent = d.samples.filter(([t]) => e.timeStamp - t < 100);
      const [t0, y0] = recent[0] ?? [e.timeStamp, e.clientY];
      const [t1, y1] = recent.at(-1) ?? [e.timeStamp, e.clientY];
      const v = e.type === "pointerup" && t1 > t0 && e.timeStamp - t1 < 60 ? -(y1 - y0) / (t1 - t0) : 0;
      glide(at(), v);
    };
    const click = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    };
    // A wheel or trackpad pushing on past an end: how far, as if there were no end (pulled() gives how far the list
    // follows), until it's let go of a moment and springs back.
    let pushed: number | null = null;
    let settle = 0;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      stop();
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const raw = (pushed ?? at()) + e.deltaY * px;
      window.clearTimeout(settle);
      if (raw >= 0 && raw <= max()) {
        pushed = null;
        show(raw);
        return;
      }
      pushed = raw;
      show(pulled(raw));
      settle = window.setTimeout(() => {
        pushed = null;
        const end = at() < 0 ? 0 : max();
        springBack(end, at() - end, 0);
      }, WHEEL_SETTLE_MS);
    };
    // Shorter now (its contents changed)? Back within its ends.
    const resize = new ResizeObserver(() => {
      if (!frame && !drag) show(Math.min(max(), Math.max(0, at())));
    });
    resize.observe(el);
    if (el.firstElementChild) resize.observe(el.firstElementChild);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      stop();
      window.clearTimeout(settle);
      resize.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("click", click, true);
      el.removeEventListener("wheel", wheel);
      el.removeAttribute("data-drag-scroll");
      el.style.removeProperty("--overscroll");
    };
  }, [el]);
}
