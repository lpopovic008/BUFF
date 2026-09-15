"use client";

import { useEffect } from "react";
import { useConfig } from "@/hooks/useConfig";
import { resolveGoogleClientId } from "@/lib/google-config";
import { startAutoSync, reconcileIfSignedIn } from "@/lib/google-drive-sync";
import { preloadGoogleIdentityServices } from "@/lib/google-auth";

/**
 * Renders nothing — just wires up automatic Drive sync (see
 * google-drive-sync.ts) for the lifetime of the app shell, so every page
 * gets it without importing it directly. Wiring the push listener here
 * doesn't by itself pop a sign-in popup; it only starts pushing once this
 * browser has an access token, which happens after the commish clicks "Sync
 * now" in Settings at least once this session (see GoogleSyncSection.tsx).
 *
 * Pushing on every local write covers this browser sending its own changes
 * up, but on its own that's only half of "synced" — nothing ever pulled a
 * newer copy back down except a deliberate "Sync now" click, so a browser
 * left open on one device would never notice another device's edits. This
 * also reconciles (pull-or-push, see reconcile) on mount and whenever the
 * tab regains focus, using reconcileIfSignedIn so it only ever runs with an
 * already-cached token — never a surprise popup. When that finds a genuinely
 * newer remote copy, the page reloads so every already-mounted component
 * (useConfig, the recap archive, ...) actually shows it — none of them
 * re-read localStorage on their own once mounted.
 *
 * Also preloads the Google Identity Services script (see google-auth.ts)
 * as soon as a Client ID is known, so the very first click of "Connect
 * Google Sync"/"Save to Doc" doesn't have to fetch it first — some mobile
 * browsers silently drop the sign-in popup if it opens after any async gap
 * following the click, which without this preload looks exactly like the
 * button doing nothing at all.
 */
export function AutoSync() {
  const { config, loaded } = useConfig();

  useEffect(() => {
    if (!loaded) return;
    const clientId = resolveGoogleClientId(config.googleClientId);
    if (!clientId) return;
    preloadGoogleIdentityServices().catch(() => {
      // Best-effort — a failed preload (offline, blocked script host) just
      // means the first real click falls back to loading it inline, same
      // as before this existed.
    });

    function reconcileNow() {
      reconcileIfSignedIn(clientId)
        .then((action) => {
          if (action === "apply-remote") window.location.reload();
        })
        .catch(() => {
          // Best-effort, same as the auto-push below — a failed background
          // reconcile just leaves this browser as it was.
        });
    }
    reconcileNow();
    function onVisible() {
      if (document.visibilityState === "visible") reconcileNow();
    }
    document.addEventListener("visibilitychange", onVisible);

    const stopAutoPush = startAutoSync(clientId);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stopAutoPush();
    };
  }, [loaded, config.googleClientId]);

  return null;
}
