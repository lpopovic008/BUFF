"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { APP_SCROLL_ID } from "@/lib/page-scroll";

// Where each page was scrolled to, by address, for going back to it.
const scrolledTo = new Map<string, number>();

/**
 * The app's shell. On a phone it's a box the size of the screen that the app scrolls in, so the document itself never
 * scrolls (see page-scroll.ts) — opening a page from the top, and going back (or forward) to one where it was left.
 * Wider, just a column the document scrolls.
 */
export function AppScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const back = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        scrolledTo.set(location.href, el.scrollTop);
      });
    };
    const onPop = () => (back.current = true);
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPop);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || getComputedStyle(el).overflowY === "visible") return;
    const to = back.current ? (scrolledTo.get(location.href) ?? 0) : 0;
    back.current = false;
    el.scrollTop = to;
    // Once the page has drawn what it needs to be that tall.
    const again = requestAnimationFrame(() => requestAnimationFrame(() => (el.scrollTop = to)));
    return () => cancelAnimationFrame(again);
  }, [pathname]);
  return (
    <div
      ref={ref}
      id={APP_SCROLL_ID}
      className="flex min-h-full flex-col max-md:fixed max-md:inset-0 max-md:overflow-y-auto max-md:overflow-x-hidden max-md:overscroll-none"
    >
      {children}
    </div>
  );
}
