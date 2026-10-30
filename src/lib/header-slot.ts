// A page that takes the page header over (the League Room on a phone): the header cleared down to a back button on
// the left and the app's logo on the right, the page's own content in the middle — put there by the page, into the
// header's middle (its slot), with a portal.

import { useSyncExternalStore } from "react";

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
