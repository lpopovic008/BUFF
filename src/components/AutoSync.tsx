"use client";

import { useEffect } from "react";
import { useConfig } from "@/hooks/useConfig";
import { resolveGoogleClientId } from "@/lib/google-config";
import { preloadGoogleIdentityServices } from "@/lib/google-auth";

/**
 * Renders nothing — just preloads the Google Identity Services script (see
 * google-auth.ts) as soon as a Client ID is known, so the first click of
 * "Save to Doc" doesn't have to fetch it first: some mobile browsers
 * silently drop a sign-in popup opened after any async gap following the
 * click, which without this preload looks exactly like the button doing
 * nothing at all.
 *
 * This used to also drive Google Drive sync (reconcile-on-mount, auto-push
 * on every local write) — that job now belongs to AutoSupabaseSync, which
 * replaced Drive sync with real accounts (see docs/architecture.md).
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
  }, [loaded, config.googleClientId]);

  return null;
}
