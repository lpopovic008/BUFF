"use client";

import { useEffect } from "react";
import { useConfig } from "@/hooks/useConfig";
import { resolveGoogleClientId } from "@/lib/google-config";
import { startAutoSync } from "@/lib/google-drive-sync";
import { preloadGoogleIdentityServices } from "@/lib/google-auth";

/**
 * Renders nothing — just wires up automatic Drive sync (see
 * google-drive-sync.ts) for the lifetime of the app shell, so every page
 * gets it without importing it directly. Wiring the listener here doesn't
 * by itself pop a sign-in popup; it only starts pushing once this browser
 * has an access token, which happens after the commish clicks "Sync now" in
 * Settings at least once this session (see GoogleSyncSection.tsx).
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
    return startAutoSync(clientId);
  }, [loaded, config.googleClientId]);

  return null;
}
