"use client";

import { useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, UploadIcon } from "@/components/ui/Icon";
import { AppConfig, getSyncState } from "@/lib/localStore";
import { resolveGoogleClientId } from "@/lib/google-config";
import { reconcile, startAutoSync, SyncAction } from "@/lib/google-drive-sync";

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

  async function handleSync() {
    if (!clientId) {
      setStatus("error");
      setError("Connect a Google Client ID in Google Docs above first.");
      return;
    }
    setStatus("syncing");
    setError(null);
    try {
      const action = await reconcile(clientId);
      startAutoSync(clientId);
      setResult(action);
      setLastSyncedAt(getSyncState().lastSyncedAt);
      setStatus("synced");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Sync failed.");
    }
  }

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

      {error ? <p className="text-xs text-status-critical">{error}</p> : null}
      {status === "synced" && result ? (
        <p className="text-xs text-status-good">{ACTION_MESSAGE[result]} Changes now sync automatically for the rest of this session.</p>
      ) : null}
    </div>
  );
}
