// What a page scrolls in. On a phone the app scrolls in a box of its own the size of the screen (#app-scroll, see the
// chrome layout and AppScroll) — the document itself never scrolls there, so nothing iOS does to a scrolled document
// (bars fixed to the screen's bottom drifting off it) can happen. Wider, the document scrolls, as usual.

export const APP_SCROLL_ID = "app-scroll";

/** The element the page scrolls in now: the app's own box on a phone, else the document's. */
export function pageScroller(): HTMLElement {
  const app = document.getElementById(APP_SCROLL_ID);
  if (app && getComputedStyle(app).overflowY !== "visible") return app;
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Holds the page still (a page that fits the screen and moves things itself): until the returned function's called. */
export function lockPageScroll(): () => void {
  const els = [document.documentElement, document.body, document.getElementById(APP_SCROLL_ID)].filter((el): el is HTMLElement => el !== null);
  const was = els.map((el) => [el.style.overflow, el.style.overscrollBehavior] as const);
  for (const el of els) {
    el.style.overflow = "hidden";
    el.style.overscrollBehavior = "none";
    el.scrollTop = 0;
  }
  return () => {
    els.forEach((el, i) => {
      [el.style.overflow, el.style.overscrollBehavior] = was[i];
    });
  };
}
