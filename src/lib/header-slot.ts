// A page that takes the page header over (the League Room on a phone): the header cleared down to a back button on
// the left and the app's logo on the right, the page's own content in the middle — put there by the page, into the
// header's middle (its slot), with a portal.

import { useEffect, useRef, useSyncExternalStore } from "react";

let bare = false;
let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

/** Clears the header down to its back button and logo, for the page to fill its middle (true) — or back to normal. */
export function setHeaderBare(on: boolean): void {
  if (on === bare) return;
  bare = on;
  notify();
}

/** Whether a page has cleared the header. */
export function useHeaderBare(): boolean {
  return useSyncExternalStore(subscribe, () => bare, () => false);
}

/** The cleared header's middle, where the page's content goes (set by the header). */
export function setHeaderSlot(el: HTMLElement | null): void {
  if (el === slot) return;
  slot = el;
  notify();
}

/** The cleared header's middle, once it's drawn. */
export function useHeaderSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribe, () => slot, () => null);
}

// What's open over a page, in the order it opened (a floor's panel, a player's card over it, a list dropped down…):
// a back button closes the last of them — one step back — and only with nothing open goes back a page.
const steps: (() => void)[] = [];

/**
 * While `open`, something's up that a back button closes (`close`), one step back, before it goes back a page — the
 * last opened first.
 */
export function useBackStep(open: boolean, close: () => void): void {
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const step = () => latest.current();
    steps.push(step);
    notify();
    return () => {
      const at = steps.lastIndexOf(step);
      if (at >= 0) steps.splice(at, 1);
      notify();
    };
  }, [open]);
}

/** One step back: what's open last closed (true) — or nothing open (false), for the page to be gone back from. */
export function takeBackStep(): boolean {
  const step = steps.at(-1);
  if (!step) return false;
  step();
  return true;
}

/** Whether anything's open for a back button to close. */
export function useHasBackStep(): boolean {
  return useSyncExternalStore(subscribe, () => steps.length > 0, () => false);
}
