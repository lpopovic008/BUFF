"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, UploadIcon } from "@/components/ui/Icon";
import { AppConfig, getSyncState } from "@/lib/localStore";
import { resolveGoogleClientId } from "@/lib/google-config";
import { reconcile, startAutoSync, DRIVE_SYNC_SCOPE, SyncAction } from "@/lib/google-drive-sync";
import { JUST_SIGNED_IN_SCOPE_KEY } from "@/lib/google-auth";

const ACTION_MESSAGE: Record<SyncAction, string> = {
  "apply-remote": "Pulled the newer copy from Drive into this browser.",
  "push-local": "Pushed this browser's data to Drive.",
  noop: "Already up to date.",
};

/**
 * Signing in here syncs everything this browser has saved — tracked
 * leagues, settings, the recap archive, bowl picks — to this Google
 * account's hidden app-data folder in Drive, so signing in with the same
 * account on another device (or another browser) picks up right where this
 * one left off. Reuses the Client ID from the Google Docs section above —
 * one OAuth client covers both scopes.
 */
export function GoogleSyncSection({ config }: { config: AppConfig }) {
  const clientId = resolveGoogleClientId(config.googleClientId);
  const [status, setStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncAction | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(() => getSyncState().lastSyncedAt);

  // Google's own sign-in popup can hang indefinitely with no callback ever
  // firing — iOS Safari and Chrome-on-iOS (same WebKit engine) in
  // particular can block the popup's cross-window messaging outright under
  // strict cookie/tracking-prevention settings. Without a timeout, that
  // looks exactly like "nothing happened" — the button silently reverts to
  // idle/"Never synced" with no error at all. A firm timeout turns that
  // into a real, actionable error message instead.
  function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  async function handleSync() {
    if (!clientId) {
      setStatus("error");
      setError("Connect a Google Client ID in Google Docs above first.");
      return;
    }
    setStatus("syncing");
    setError(null);
    try {
      const action = await withTimeout(
        reconcile(clientId),
        25000,
        "Sign-in didn't finish — this can happen if a pop-up was blocked or the sign-in window was closed. Check this browser's pop-up settings for this site and try again."
      );
      startAutoSync(clientId);
      setResult(action);
      setLastSyncedAt(getSyncState().lastSyncedAt);
      setStatus("synced");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Sync failed.");
    }
  }

  // Standalone/home-screen mode (see google-auth.ts) signs in via a full
  // redirect to Google and back instead of a popup — this page remounts
  // fresh on the way back, so the sync that redirect interrupted needs to
  // finish on its own rather than making the commish tap "Sync now" again
  // right after they just signed in.
  const autoResumedRef = useRef(false);
  useEffect(() => {
    if (autoResumedRef.current || !clientId) return;
    let flaggedScope: string | null = null;
    try {
      flaggedScope = window.sessionStorage.getItem(JUST_SIGNED_IN_SCOPE_KEY);
    } catch {
      flaggedScope = null;
    }
    if (flaggedScope !== DRIVE_SYNC_SCOPE) return;
    autoResumedRef.current = true;
    try {
      window.sessionStorage.removeItem(JUST_SIGNED_IN_SCOPE_KEY);
    } catch {
      // Not fatal — worst case this fires again on a future mount.
    }
    queueMicrotask(() => handleSync());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const alreadyConnected = lastSyncedAt > 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-secondary">
        Sync tracked leagues, settings, the recap archive, and bowl picks to this Google account, so the
        same saved data shows up on every device signed in here. This site has no server, so Drive
        itself is the only thing keeping the browsers in sync — nothing is stored anywhere else.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          icon={status === "synced" ? <CheckIcon /> : <UploadIcon />}
          label={status === "syncing" ? "Syncing…" : alreadyConnected ? "Sync now" : "Connect Google Sync"}
          onClick={handleSync}
          disabled={status === "syncing" || !clientId}
          variant="primary"
        />
        {lastSyncedAt ? (
          <span className="text-xs text-ink-muted">Last synced {new Date(lastSyncedAt).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-ink-muted">Never synced</span>
        )}
      </div>

      {!clientId ? (
        <p className="text-xs text-ink-muted">
          Paste a Google Client ID into the Google Docs section above first — on this device too, since that&rsquo;s
          stored per-browser and doesn&rsquo;t carry over on its own until sync is connected here.
        </p>
      ) : null}
      {error ? <p className="text-xs text-status-critical">{error}</p> : null}
      {status === "synced" && result ? (
        <p className="text-xs text-status-good">{ACTION_MESSAGE[result]} Changes now sync automatically for the rest of this session.</p>
      ) : null}
    </div>
  );
}
