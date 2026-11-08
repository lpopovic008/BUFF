"use client";

import { useEffect } from "react";

/**
 * Fired on a list scrolled by useListScroll every time it moves, there and then — so what's drawn from it (its
 * reflection, see FloorReflection; its scroll thumb) moves with it in the same frame, past its ends and all.
 */
export const LIST_MOVE = "list-move";

// Where each list's shown from (see listPosition).
const positions = new WeakMap<HTMLElement, number>();

/**
 * Where a list's shown from, in px down its contents: its scroll — less how far it's pulled down past its top
 * (negative), or plus how far up past its bottom.
 */
export function listPosition(el: HTMLElement): number {
  return positions.get(el) ?? el.scrollTop;
}

// iOS's own scrolling: a flick slows by this much every ms (UIScrollView's normal deceleration rate); pulled past an
// end, the list follows this much of the pull, less the further it goes (its rubber band); and it springs back into
// place, or bounces off an end it glides into, critically damped at this rate (per ms) — about half a second.
const DECELERATION = 0.998;
const RUBBER = 0.55;
const SPRING = 0.012;
/** How far a finger goes before it's scrolling the list, not tapping it (px). */
const SLOP = 6;
/** Slower than this (px/ms), a glide's over; faster, a touch that stops it isn't a tap on what's under it. */
const STOPPED = 0.01;
const MOVING = 0.1;
/** How much of a finger's last moves its speed is taken from (ms), and how long it may have held still before letting go and still fling (ms). */
const FLING_WINDOW_MS = 80;
const STILL_MS = 50;
/** A wheel's step bigger than this (px) is a mouse's notch, eased into; smaller, a trackpad's, followed as it comes. */
const NOTCH_PX = 40;
const NOTCH_MS = 220;
/** How long after a trackpad stops pushing past an end the list springs back (ms). */
const WHEEL_SETTLE_MS = 120;

/** How far a list follows a pull `x` past its end, at height `d` (iOS's rubber band). */
const rubber = (x: number, d: number) => Math.sign(x) * (1 - 1 / ((Math.abs(x) * RUBBER) / d + 1)) * d;
/** How far a pull it's followed `f` of the way was. */
const unrubber = (f: number, d: number) => Math.sign(f) * ((Math.abs(f) * d) / ((d - Math.min(Math.abs(f), d - 1)) * RUBBER));

/**
 * A list (`el`: a box of overflow auto holding one element, its contents) scrolled the way an iPhone scrolls — dragged
 * by a finger or the mouse, flicked to glide on and slow as iOS's lists do, pulled past either end on a rubber band
 * and sprung back, a glide into an end bouncing off it, a touch on a gliding list just stopping it — and by a wheel or
 * trackpad. The page moves it, not the browser, so that everything drawn from it moves in the very same frame
 * (LIST_MOVE). Within its ends it's the box's own scroll (scrollTop, scroll events, scrolling it from code all as
 * usual); past them, its contents are moved that far, on the graphics card. Drags that start sideways, or on
 * something that takes the finger itself (touch-action none, or data-own-touch — but for one marked
 * data-sideways-only, its up-and-down drags), or a mouse's in a text box, are left alone.
 */
export function useListScroll(el: HTMLElement | null) {
  useEffect(() => {
    if (!el) return;
    el.setAttribute("data-scroll-list", "");
    const contents = () => el.firstElementChild as HTMLElement | null;
    // How far it scrolls: its contents' own height (not what they're moved by) and its padding, less its height.
    let maxTop = 0;
    const measure = () => {
      const style = getComputedStyle(el);
      const inner = (contents()?.offsetHeight ?? 0) + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      maxTop = Math.max(0, inner - el.clientHeight);
    };
    measure();

    // Where it's shown from (see listPosition), and what's moving it.
    let at = el.scrollTop;
    let frame = 0;
    let speed = 0;
    const show = (p: number) => {
      const top = Math.min(maxTop, Math.max(0, p));
      const past = p - top;
      if (el.scrollTop !== top) el.scrollTop = top;
      const c = contents();
      if (c) c.style.transform = past ? `translate3d(0,${-past}px,0)` : "";
      // As it's actually scrolled (a browser may round it), and pulled.
      at = el.scrollTop + past;
      positions.set(el, at);
      el.dispatchEvent(new Event(LIST_MOVE));
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      speed = 0;
    };
    const run = (step: (t: number) => boolean) => {
      stop();
      const start = performance.now();
      const tick = (now: number) => {
        const id = frame;
        const more = step(now - start);
        // Something else took over from inside the step (a glide bouncing off an end).
        if (frame !== id) return;
        frame = more ? requestAnimationFrame(tick) : 0;
        if (!frame) speed = 0;
      };
      frame = requestAnimationFrame(tick);
    };
    // Back into place at `end` from `x` past it, moving at `v` (px/ms): critically damped, as iOS springs back.
    const springBack = (end: number, x0: number, v0: number) =>
      run((t) => {
        const fade = Math.exp(-SPRING * t);
        const x = (x0 + (v0 + SPRING * x0) * t) * fade;
        speed = (v0 - SPRING * (v0 + SPRING * x0) * t) * fade;
        if (Math.abs(x) < 0.5 && Math.abs(speed) < STOPPED) {
          show(end);
          return false;
        }
        show(end + x);
        return true;
      });
    // Gliding on from `p0` at `v0` (px/ms), slowing as iOS's lists do — into an end, bouncing off it.
    const glide = (p0: number, v0: number) => {
      // Let go past an end: back into place.
      if (p0 < 0 || p0 > maxTop) return springBack(p0 < 0 ? 0 : maxTop, p0 - (p0 < 0 ? 0 : maxTop), 0);
      if (Math.abs(v0) < STOPPED) return stop();
      const k = Math.log(DECELERATION);
      run((t) => {
        const fade = Math.exp(k * t);
        const p = p0 + (v0 * (fade - 1)) / k;
        speed = v0 * fade;
        if (p < 0 || p > maxTop) {
          const end = p < 0 ? 0 : maxTop;
          show(end);
          springBack(end, 0, speed);
          return false;
        }
        show(p);
        return Math.abs(speed) >= STOPPED;
      });
    };

    let drag: { id: number; x: number; y: number; from: number; scrolling: boolean | null; samples: [number, number][] } | null = null;
    let swallowClick = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const own = (e.target as Element).closest(".touch-none, [data-own-touch]");
      // Something that takes the finger itself — unless it only takes sideways drags (a graph's cursor), whose
      // up-and-down ones still scroll the list.
      if (own && own !== el && el.contains(own) && !own.hasAttribute("data-sideways-only")) return;
      // A mouse in a text box selects its text, as ever.
      if (e.pointerType === "mouse" && (e.target as Element).closest("input, textarea, select, [contenteditable='true']")) return;
      // A touch on a gliding list stops it, and is no tap on what's under it.
      swallowClick = Math.abs(speed) > MOVING;
      stop();
      // Taken from wherever it is, past an end too: the pull it's at, as far as a finger would have gone for it.
      const past = at < 0 ? at : at > maxTop ? at - maxTop : 0;
      const end = at < 0 ? 0 : at > maxTop ? maxTop : at;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: end + unrubber(past, el.clientHeight || 1), scrolling: null, samples: [[e.timeStamp, e.clientY]] };
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
        // A mouse dragging it selects nothing (a selection would scroll the box on its own).
        window.getSelection()?.removeAllRanges();
        el.style.userSelect = "none";
      }
      drag.samples.push([e.timeStamp, e.clientY]);
      if (drag.samples.length > 12) drag.samples.shift();
      const raw = drag.from - dy;
      show(raw < 0 ? rubber(raw, el.clientHeight || 1) : raw > maxTop ? maxTop + rubber(raw - maxTop, el.clientHeight || 1) : raw);
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      el.style.removeProperty("user-select");
      if (!d.scrolling) {
        // Stopped while past an end: back into place.
        if (at < 0 || at > maxTop) glide(at, 0);
        return;
      }
      swallowClick = true;
      // The finger's speed over its last moments — none if it held still before letting go.
      const recent = d.samples.filter(([t]) => e.timeStamp - t <= FLING_WINDOW_MS);
      const [t0, y0] = recent[0] ?? [e.timeStamp, e.clientY];
      const [t1, y1] = recent.at(-1) ?? [e.timeStamp, e.clientY];
      const v = e.type === "pointerup" && t1 > t0 && e.timeStamp - t1 < STILL_MS ? -(y1 - y0) / (t1 - t0) : 0;
      glide(at, v);
    };
    const click = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    };

    // A wheel: a mouse's notch eased into over a moment, a trackpad's scroll followed as it comes — pushed on past an
    // end, on the rubber band, until it's let go a moment and springs back.
    let pushed: number | null = null;
    let settle = 0;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1);
      window.clearTimeout(settle);
      if (Math.abs(delta) >= NOTCH_PX) {
        pushed = null;
        const from = at;
        const to = Math.min(maxTop, Math.max(0, (frame ? at : from) + delta));
        return run((t) => {
          const f = Math.min(1, t / NOTCH_MS);
          show(from + (to - from) * (1 - Math.pow(1 - f, 3)));
          return f < 1;
        });
      }
      stop();
      const raw = (pushed ?? at) + delta;
      if (raw >= 0 && raw <= maxTop) {
        pushed = null;
        return show(raw);
      }
      pushed = raw;
      const end = raw < 0 ? 0 : maxTop;
      show(end + rubber(raw - end, el.clientHeight || 1));
      settle = window.setTimeout(() => {
        pushed = null;
        glide(at, 0);
      }, WHEEL_SETTLE_MS);
    };

    // Scrolled from code (or by the browser, bringing something into view): followed as it goes.
    const scrolled = () => {
      if (frame || drag?.scrolling || at < 0 || at > maxTop) return;
      if (el.scrollTop === at) return;
      at = el.scrollTop;
      positions.set(el, at);
      el.dispatchEvent(new Event(LIST_MOVE));
    };
    // Shorter or taller now: back within its ends, unless it's being moved.
    const resize = new ResizeObserver(() => {
      measure();
      if (!frame && !drag?.scrolling && at > maxTop) show(maxTop);
    });
    resize.observe(el);
    const observeContents = () => {
      const c = contents();
      if (c) resize.observe(c);
    };
    observeContents();
    const swapped = new MutationObserver(observeContents);
    swapped.observe(el, { childList: true });

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      stop();
      window.clearTimeout(settle);
      resize.disconnect();
      swapped.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("click", click, true);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("scroll", scrolled);
      el.removeAttribute("data-scroll-list");
      contents()?.style.removeProperty("transform");
      positions.delete(el);
    };
  }, [el]);
}
