"use client";

// The app as it runs on an iPhone or iPad: the same pages, in the native shell Capacitor wraps them in (see
// capacitor.config.ts). What differs there — links out to other sites open in a Safari sheet over the app rather than
// in place of it; signing in with Google or Apple opens in that sheet too, and comes back into the app by the app's
// own link (APP_SCHEME, see NativeBridge); and what only works in a web browser (Google Docs, Yahoo's sign-in) is left
// out — all keys off isNativeApp.

import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";

/** The app's own link scheme, as its Info.plist registers it: what sign-in comes back into the app by. */
export const APP_SCHEME = "com.lukapopovic.commish";

/** Where a sign-in with Google or Apple comes back to in the app. */
export const AUTH_RETURN_URL = `${APP_SCHEME}://auth`;

/** Whether this is the app on an iPhone or iPad (not a web browser). */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

const never = () => () => {};

/** isNativeApp for a component: false while the page is first drawn (as it was built), then the truth. */
export function useIsNativeApp(): boolean {
  return useSyncExternalStore(never, isNativeApp, () => false);
}

/** Opens another site: in the app, in a Safari sheet over it; in a browser, in a new tab. */
export async function openExternal(url: string): Promise<void> {
  if (isNativeApp()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
