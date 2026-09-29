"use client";

// Syncs every browser-local thing this app keeps (config, recap archive,
// bowl picks, draft targets — see localStore.ts's exportAllData) through a
// single row in Postgres, keyed by the signed-in user — the same job
// google-drive-sync.ts used to do through a hidden file in Drive, just
// backed by a real account instead of a Drive OAuth token (see
// docs/architecture.md for why this replaced Drive sync rather than running
// alongside it).
//
// The reconciliation logic below is a direct port of
// google-drive-sync.ts's decideSyncAction/reconcile — same last-write-wins
// tradeoff, same reasoning: this is for one person's own devices, never two
// people editing at once, so comparing "when did each side last actually
// change" is enough; there's no real multi-writer conflict to resolve.

import {
  exportAllData,
  importAllData,
  onLocalWrite,
  getSyncState,
  saveSyncState,
  SyncState,
} from "./localStore";
import { supabase } from "./supabase";

export type SyncAction = "pull" | "push" | "noop";

/**
 * What to do given this browser's own sync bookkeeping and the timestamp
 * (null if this account has no row yet — a brand new account, or the first
 * device ever signed into it) of whatever's currently in Postgres. Pulled
 * out as a pure function for the same reason google-drive-sync.ts's
 * decideSyncAction is — testable without mocking a network call.
 */
export function decideSyncAction(local: SyncState, remoteUpdatedAt: number | null): SyncAction {
  if (remoteUpdatedAt === null) return "push";

  const remoteIsNew = remoteUpdatedAt > local.lastSyncedAt;
  const hasUnsyncedLocalChanges = local.lastLocalWriteAt > local.lastSyncedAt;
  if (!remoteIsNew) {
    return hasUnsyncedLocalChanges ? "push" : "noop";
  }
  return remoteUpdatedAt > local.lastLocalWriteAt ? "pull" : "push";
}

/** Writes this browser's current data to this user's row, creating it on the first push from any device. */
export async function pushToSupabase(userId: string): Promise<void> {
  const data = JSON.parse(exportAllData());
  const { error } = await supabase
    .from("app_data")
    .upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  saveSyncState({ ...getSyncState(), lastSyncedAt: Date.now() });
}

/**
 * Reconciles this browser against this user's Postgres row: pulls it down
 * if it's newer than anything this browser has written, pushes this
 * browser's data up if it has unsynced changes Postgres doesn't have yet
 * (including seeding a brand-new account with whatever this browser already
 * had), or does nothing if the two already agree. Call once on sign-in (see
 * AutoSupabaseSync) and from Settings' "Sync now" button.
 */
export async function reconcile(userId: string): Promise<SyncAction> {
  const { data: row, error } = await supabase
    .from("app_data")
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const remoteUpdatedAt = row ? new Date(row.updated_at).getTime() : null;
  const action = decideSyncAction(getSyncState(), remoteUpdatedAt);

  if (action === "pull" && row) {
    importAllData(JSON.stringify(row.data));
    saveSyncState({ lastLocalWriteAt: remoteUpdatedAt!, lastSyncedAt: remoteUpdatedAt! });
  } else if (action === "push") {
    await pushToSupabase(userId);
  }
  return action;
}

const PUSH_DEBOUNCE_MS = 3000;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let stopListening: (() => void) | null = null;

/**
 * Wires up automatic sync for the rest of this session: every local write
 * bumps this browser's watermark and schedules a debounced push shortly
 * after (so a burst of edits pushes once, not per-keystroke). Call on
 * sign-in; call the returned function (or stopAutoSync) on sign-out.
 */
export function startAutoSync(userId: string): () => void {
  stopAutoSync();
  stopListening = onLocalWrite(() => {
    saveSyncState({ ...getSyncState(), lastLocalWriteAt: Date.now() });
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushToSupabase(userId).catch(() => {
        // Best-effort — a failed background push (offline, brief network
        // blip) just leaves this browser's storage ahead of Postgres; the
        // next reconcile or push catches it up, so there's nothing useful
        // to surface here.
      });
    }, PUSH_DEBOUNCE_MS);
  });
  return stopAutoSync;
}

export function stopAutoSync(): void {
  stopListening?.();
  stopListening = null;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
}
