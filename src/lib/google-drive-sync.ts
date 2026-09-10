"use client";

// Syncs every browser-local thing this app keeps (config, recap archive,
// bowl picks, draft targets — see localStore.ts's exportAllData) through a
// single JSON file in the signed-in-in-Settings Google account's Drive
// appDataFolder: a hidden, per-app folder Drive gives every OAuth client
// that requests the `drive.appdata` scope, invisible in the account's normal
// Drive UI. No server, no database — the file itself is the sync point, the
// same way it'd be if two browsers shared a Dropbox folder.
//
// There's no conflict resolution beyond last-write-wins: whichever browser
// wrote most recently overwrites the other's unsynced changes wholesale.
// That's the right tradeoff for one commish editing from a couple of their
// own devices, never two people editing at once, and it's exactly what
// `SyncState` (see localStore.ts) exists to decide — see decideSyncAction.

import {
  exportAllData,
  importAllData,
  onLocalWrite,
  getSyncState,
  saveSyncState,
  SyncState,
} from "./localStore";
import { getGoogleAccessToken } from "./google-auth";

export const DRIVE_SYNC_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

const SYNC_FILE_NAME = "buff-sync.json";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

/** The Drive file's actual shape — this browser's exported data, plus when it was written, so another browser can tell whether it's newer than its own. */
export interface SyncPayload {
  syncedAt: number;
  data: unknown;
}

/** Turns whatever's in this browser's localStorage right now into the payload a push would write. */
export function buildSyncPayload(): SyncPayload {
  return { syncedAt: Date.now(), data: JSON.parse(exportAllData()) };
}

/** Writes a payload pulled from Drive back into this browser's localStorage. */
function applySyncPayload(payload: SyncPayload): void {
  importAllData(JSON.stringify(payload.data));
}

/**
 * What to do given this browser's own sync bookkeeping and the timestamp
 * (null if the file doesn't exist yet) of whatever's currently on Drive.
 * Pulled out as a pure function so the decision itself is unit-testable
 * without mocking a single fetch call — see google-drive-sync.test.ts.
 */
export type SyncAction = "apply-remote" | "push-local" | "noop";

export function decideSyncAction(local: SyncState, remoteSyncedAt: number | null): SyncAction {
  if (remoteSyncedAt === null) return "push-local";

  const remoteIsNew = remoteSyncedAt > local.lastSyncedAt;
  const hasUnsyncedLocalChanges = local.lastLocalWriteAt > local.lastSyncedAt;
  if (!remoteIsNew) {
    return hasUnsyncedLocalChanges ? "push-local" : "noop";
  }
  // Remote has something this browser hasn't synced yet. If this browser
  // also has its own unsynced edits, last-write-wins by comparing when each
  // actually happened, not just which side noticed first.
  return remoteSyncedAt > local.lastLocalWriteAt ? "apply-remote" : "push-local";
}

async function driveFetch(url: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google Drive API error (${res.status}): ${detail || res.statusText}`);
  }
  return res;
}

/** The sync file's id, or null if this Drive account has never synced before. */
async function findSyncFileId(accessToken: string): Promise<string | null> {
  const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${encodeURIComponent(`name='${SYNC_FILE_NAME}'`)}&fields=files(id)`;
  const res = await driveFetch(url, accessToken);
  const body = (await res.json()) as { files?: { id: string }[] };
  return body.files?.[0]?.id ?? null;
}

/** Creates the (empty) sync file in appDataFolder — metadata only, no content yet; a separate upload writes the body. */
async function createSyncFile(accessToken: string): Promise<string> {
  const res = await driveFetch(DRIVE_FILES_URL, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: SYNC_FILE_NAME, parents: ["appDataFolder"] }),
  });
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function uploadSyncPayload(accessToken: string, fileId: string, payload: SyncPayload): Promise<void> {
  await driveFetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function downloadSyncPayload(accessToken: string, fileId: string): Promise<SyncPayload> {
  const res = await driveFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, accessToken);
  return (await res.json()) as SyncPayload;
}

/** Pushes this browser's current data to Drive, creating the sync file first if this is the first push from any device. */
export async function pushToDrive(clientId: string): Promise<void> {
  const accessToken = await getGoogleAccessToken(clientId, DRIVE_SYNC_SCOPE);
  const fileId = (await findSyncFileId(accessToken)) ?? (await createSyncFile(accessToken));
  const payload = buildSyncPayload();
  await uploadSyncPayload(accessToken, fileId, payload);
  saveSyncState({ ...getSyncState(), lastSyncedAt: payload.syncedAt });
}

let applyingRemote = false;

/**
 * Reconciles this browser against Drive: pulls and applies remote data if
 * it's newer than anything this browser has written, pushes this browser's
 * data up if it has unsynced changes Drive doesn't have yet, or does nothing
 * if the two already agree. Call on app boot (see AutoSync in layout.tsx)
 * and from the Settings "Sync now" button.
 */
export async function reconcile(clientId: string): Promise<SyncAction> {
  const accessToken = await getGoogleAccessToken(clientId, DRIVE_SYNC_SCOPE);
  const fileId = await findSyncFileId(accessToken);
  const remote = fileId ? await downloadSyncPayload(accessToken, fileId) : null;
  const local = getSyncState();
  const action = decideSyncAction(local, remote?.syncedAt ?? null);

  if (action === "apply-remote" && remote) {
    applyingRemote = true;
    try {
      applySyncPayload(remote);
    } finally {
      applyingRemote = false;
    }
    saveSyncState({ lastLocalWriteAt: remote.syncedAt, lastSyncedAt: remote.syncedAt });
  } else if (action === "push-local") {
    await pushToDrive(clientId);
  }

  return action;
}

const PUSH_DEBOUNCE_MS = 3000;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let stopListening: (() => void) | null = null;

/**
 * Wires up automatic sync: every local write bumps this browser's watermark
 * and schedules a debounced push shortly after (so a burst of keystrokes
 * pushes once, not per-keystroke). Safe to call more than once — only the
 * first call actually subscribes; call the returned function to stop.
 * A background push needs an already-cached access token (see
 * google-auth.ts) — with no refresh token, GIS can only reissue one
 * silently, never with a fresh consent popup outside a user gesture, so the
 * very first sync on a browser has to come from a deliberate click (Settings'
 * "Connect Google Sync") before automatic pushes can work at all.
 */
export function startAutoSync(clientId: string): () => void {
  if (stopListening) return stopListening;
  stopListening = onLocalWrite(() => {
    if (applyingRemote || !clientId) return;
    saveSyncState({ ...getSyncState(), lastLocalWriteAt: Date.now() });
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushToDrive(clientId).catch(() => {
        // Best-effort — a failed background push (offline, no cached token
        // yet, popup blocked outside a user gesture) just leaves this
        // browser's storage ahead of Drive; the next reconcile or push
        // catches it up, so there's nothing useful to surface here.
      });
    }, PUSH_DEBOUNCE_MS);
  });
  return () => {
    stopListening?.();
    stopListening = null;
    if (pushTimer) clearTimeout(pushTimer);
  };
}
