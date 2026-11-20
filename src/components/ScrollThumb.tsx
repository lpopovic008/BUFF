"use client";

import { useEffect, useRef } from "react";
import { LIST_MOVE, listPosition } from "@/hooks/useListScroll";

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
    // The list's sizes, measured when they change rather than each time it moves (reading them then would have the
    // browser lay the page out again, mid-scroll).
    let sizes = { pad: 0, track: 0, height: 0, range: 0, top: 0, client: 0 };
    const measure = () => {
      const pad = parseFloat(getComputedStyle(source).paddingTop) || 0;
      const client = source.clientHeight;
      const height = source.scrollHeight;
      sizes = { pad, track: client - pad - 8, height, range: height - client, top: source.offsetTop, client };
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(source);
    const observeContents = () => {
      if (source.firstElementChild) resize.observe(source.firstElementChild);
      measure();
    };
    observeContents();
    const swapped = new MutationObserver(observeContents);
    swapped.observe(source, { childList: true });
    // Pulled past an end, it shrinks against that end, as on an iPhone.
    const show = () => {
      const { pad, track, height, range, top, client } = sizes;
      if (range <= 1 || track <= 0) return;
      const at = listPosition(source);
      const past = at < 0 ? -at : at > range ? at - range : 0;
      const size = Math.max(8, Math.max(24, (track * client) / height) - past);
      thumb.style.height = `${size}px`;
      thumb.style.top = `${top + pad + 4 + ((track - size) * Math.min(range, Math.max(0, at))) / range}px`;
      thumb.style.opacity = "1";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (thumb.style.opacity = "0"), LINGER_MS);
    };
    source.addEventListener(LIST_MOVE, show);
    source.addEventListener("scroll", show, { passive: true });
    return () => {
      window.clearTimeout(timer);
      resize.disconnect();
      swapped.disconnect();
      source.removeEventListener(LIST_MOVE, show);
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
