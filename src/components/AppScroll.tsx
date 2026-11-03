"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { APP_SCROLL_ID } from "@/lib/page-scroll";

/**
 * How far short of the screen's bottom a home-screen app's screen is drawn: on iOS 26, an app opened from the home
 * screen with a translucent status bar is given a screen that stops about a status bar's height above the screen's real
 * bottom (WebKit bug 301108), and everything fixed to its bottom with it. Measured as the real screen's height (a
 * large viewport, or the device's own screen) less a box fixed to the whole screen; none in a browser, where there's
 * no such bug and the screen's what the browser's toolbars leave.
 */
function screenShortfall(): number {
  const homeScreen = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!homeScreen) return 0;
  const probe = (css: string) => {
    const el = document.createElement("div");
    el.style.cssText = `position:fixed;left:0;width:0;visibility:hidden;pointer-events:none;${css}`;
    document.body.appendChild(el);
    const height = el.getBoundingClientRect().height;
    el.remove();
    return height;
  };
  const drawn = probe("top:0;bottom:0");
  const large = probe("top:0;height:100lvh");
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const device = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const short = Math.max(large, device) - drawn;
  // Only ever about a status bar's worth: anything else isn't this.
  return short >= 1 && short <= 120 ? Math.round(short) : 0;
}

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
  // The screen drawn short (see screenShortfall): what's fixed to its bottom moved down to the real one (--vp-gap).
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    const measure = () => root.setProperty("--vp-gap", `${screenShortfall()}px`);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      root.removeProperty("--vp-gap");
    };
  }, []);
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
      className="flex min-h-full flex-col max-md:fixed max-md:inset-0 max-md:bottom-[calc(-1*var(--vp-gap,0px))] max-md:overflow-y-auto max-md:overflow-x-hidden max-md:overscroll-none"
    >
      {children}
    </div>
  );
}
