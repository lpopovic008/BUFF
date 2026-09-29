import test from "node:test";
import assert from "node:assert/strict";
import { decideSyncAction } from "./supabase-sync";

test("no account row yet pushes local up, seeding the account for the first time", () => {
  assert.equal(decideSyncAction({ lastLocalWriteAt: 0, lastSyncedAt: 0 }, null), "push");
});

test("remote newer than anything this browser has written pulls the remote copy", () => {
  const local = { lastLocalWriteAt: 100, lastSyncedAt: 100 };
  assert.equal(decideSyncAction(local, 200), "pull");
});

test("unsynced local changes newer than the account's copy push local up", () => {
  const local = { lastLocalWriteAt: 200, lastSyncedAt: 100 };
  assert.equal(decideSyncAction(local, 100), "push");
});

test("already in sync with the account does nothing", () => {
  const local = { lastLocalWriteAt: 100, lastSyncedAt: 150 };
  assert.equal(decideSyncAction(local, 150), "noop");
});

test("a remote exactly as old as this browser's last write favors the local copy, not a wasted pull", () => {
  const local = { lastLocalWriteAt: 100, lastSyncedAt: 100 };
  assert.equal(decideSyncAction(local, 100), "noop");
});
