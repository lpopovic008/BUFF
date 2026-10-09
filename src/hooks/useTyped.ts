"use client";

// Text that types itself out — and deletes itself again — one character at a
// time, fast: the same feel as an opened game on the dashboard map.

import { useEffect, useRef, useState } from "react";

/** How long each character takes to type or delete. */
export const TYPE_MS_PER_CHAR = 6;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A character count that moves toward `target` one character every
 * `msPerChar` (TYPE_MS_PER_CHAR unless said otherwise) — up to type text in,
 * down to delete it — from wherever it is, so a reversal mid-way just turns
 * around. Starts at 0. `delayMs` holds each move back that long before it
 * starts, to stagger lines typing one after another.
 */
export function useTypedCount(
  target: number,
  { msPerChar = TYPE_MS_PER_CHAR, delayMs = 0 }: { msPerChar?: number; delayMs?: number } = {}
): number {
  const [count, setCount] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const step = target > from ? 1 : -1;
    const start = performance.now() + delayMs;
    const instant = prefersReducedMotion();
    let raf = 0;
    const tick = (now: number) => {
      const moved = instant ? Math.abs(target - from) : Math.max(0, Math.floor((now - start) / msPerChar));
      const next = step > 0 ? Math.min(target, from + moved) : Math.max(target, from - moved);
      current.current = next;
      setCount(next);
      if (next !== target) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, msPerChar, delayMs]);
  return count;
}

/** Whether `ref`'s element has ever scrolled into view — false until it first does, then true for good. */
export function useSeenOnce(ref: React.RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setSeen(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, seen]);
  return seen;
}

/** Splits a typed character count across consecutive pieces of text: each piece's typed-so-far slice. */
export function typedSlices(pieces: string[], count: number): string[] {
  let left = count;
  return pieces.map((piece) => {
    const slice = piece.slice(0, Math.max(0, left));
    left -= piece.length;
    return slice;
  });
}

/** Total characters across pieces of text. */
export const totalChars = (pieces: string[]) => pieces.reduce((n, p) => n + p.length, 0);
