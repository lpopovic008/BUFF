"use client";

import { useEffect } from "react";
import { useConfig } from "@/hooks/useConfig";
import { resolveGoogleClientId } from "@/lib/google-config";
import { startAutoSync } from "@/lib/google-drive-sync";

/**
 * Renders nothing — just wires up automatic Drive sync (see
 * google-drive-sync.ts) for the lifetime of the app shell, so every page
 * gets it without importing it directly. Wiring the listener here doesn't
 * by itself pop a sign-in popup; it only starts pushing once this browser
 * has an access token, which happens after the commish clicks "Sync now" in
 * Settings at least once this session (see GoogleSyncSection.tsx).
 */
export function AutoSync() {
  const { config, loaded } = useConfig();

  useEffect(() => {
    if (!loaded) return;
    const clientId = resolveGoogleClientId(config.googleClientId);
    if (!clientId) return;
    return startAutoSync(clientId);
  }, [loaded, config.googleClientId]);

  return null;
}
