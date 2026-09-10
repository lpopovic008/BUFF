import test from "node:test";
import assert from "node:assert/strict";
import { decideSyncAction } from "./google-drive-sync";

test("no remote file yet pushes local up, seeding Drive for the first time", () => {
  assert.equal(decideSyncAction({ lastLocalWriteAt: 0, lastSyncedAt: 0 }, null), "push-local");
});

test("remote newer than anything this browser has written applies the remote copy", () => {
  const local = { lastLocalWriteAt: 100, lastSyncedAt: 100 };
  assert.equal(decideSyncAction(local, 200), "apply-remote");
});

test("unsynced local changes newer than Drive's copy push local up", () => {
  const local = { lastLocalWriteAt: 200, lastSyncedAt: 100 };
  assert.equal(decideSyncAction(local, 100), "push-local");
});

test("already in sync with Drive does nothing", () => {
  const local = { lastLocalWriteAt: 100, lastSyncedAt: 150 };
  assert.equal(decideSyncAction(local, 150), "noop");
});

test("a remote exactly as old as this browser's last write favors the local copy, not a wasted apply", () => {
  const local = { lastLocalWriteAt: 100, lastSyncedAt: 100 };
  assert.equal(decideSyncAction(local, 100), "noop");
});
