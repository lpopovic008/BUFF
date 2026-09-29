"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth";
import { reconcile, startAutoSync, stopAutoSync } from "@/lib/supabase-sync";

/**
 * Renders nothing — wires up automatic account sync (see supabase-sync.ts)
 * for the lifetime of the app shell. On sign-in, reconciles this browser
 * against the account's Postgres row once (pulling a newer copy down,
 * pushing unsynced local changes up, or seeding a brand-new account with
 * whatever this browser already has), then starts pushing every local
 * write automatically for the rest of the session. On sign-out, stops.
 *
 * Keyed on the signed-in user's id, not the whole session object — Supabase
 * refreshes the session's token periodically without changing who's signed
 * in, and re-running this on every refresh would pointlessly re-reconcile
 * (and risk an unexpected reload) for an already-synced, idle browser.
 */
export function AutoSupabaseSync() {
  const { session, loaded } = useSession();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!loaded) return;
    if (!userId) {
      stopAutoSync();
      return;
    }
    reconcile(userId)
      .then((action) => {
        startAutoSync(userId);
        // A pulled-down copy lands in localStorage, but every already-
        // mounted component read its state once on mount and has no way to
        // notice — without a reload the sync would look like it did
        // nothing even though it just worked (same reasoning Drive sync
        // used to reload on "apply-remote").
        if (action === "pull") window.location.reload();
      })
      .catch(() => {
        // Best-effort — a failed reconcile (offline, brief network blip)
        // just leaves this browser as it was; the next sign-in, local
        // write, or page load retries.
      });
    return () => stopAutoSync();
  }, [loaded, userId]);

  return null;
}
