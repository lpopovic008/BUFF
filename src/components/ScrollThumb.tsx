"use client";

import { useEffect, useRef } from "react";

/** How long the thumb stays up after the list stops moving (ms). */
const LINGER_MS = 900;

/**
 * A list's scroll thumb, as on an iPhone: a thin bar down its right edge, up only while it's scrolling, its scrollbar
 * otherwise hidden (it'd take the list's width, and its reflection's copy wouldn't line up with it). Placed beside
 * the list (`source`) in the same positioned box; not to be grabbed, nor reflected (data-no-reflect).
 */
export function ScrollThumb({ source }: { source: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const thumb = ref.current;
    if (!source || !thumb) return;
    let timer = 0;
    const show = () => {
      const pad = parseFloat(getComputedStyle(source).paddingTop) || 0;
      const track = source.clientHeight - pad - 8;
      const range = source.scrollHeight - source.clientHeight;
      if (range <= 1 || track <= 0) return;
      const size = Math.max(24, (track * source.clientHeight) / source.scrollHeight);
      thumb.style.height = `${size}px`;
      thumb.style.top = `${source.offsetTop + pad + 4 + ((track - size) * Math.min(range, Math.max(0, source.scrollTop))) / range}px`;
      thumb.style.opacity = "1";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (thumb.style.opacity = "0"), LINGER_MS);
    };
    source.addEventListener("scroll", show, { passive: true });
    return () => {
      window.clearTimeout(timer);
      source.removeEventListener("scroll", show);
    };
  }, [source]);
  return (
    <div
      ref={ref}
      aria-hidden
      data-no-reflect
      className="pointer-events-none absolute right-0.5 z-10 w-[3px] rounded-full bg-ink-primary/40 opacity-0 transition-opacity duration-300"
    />
  );
}
