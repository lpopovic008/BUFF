import test from "node:test";
import assert from "node:assert/strict";
import { migrateLegacyStorage, STORAGE_MIGRATION_SCRIPT } from "./storage-migration";

function memoryStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

test("old buff: keys move to commish:, leaving other keys alone", () => {
  const s = memoryStorage({ "buff:config": "{\"a\":1}", "buff:theme": "dark", "other": "x" });
  migrateLegacyStorage(s);
  assert.equal(s.getItem("commish:config"), "{\"a\":1}");
  assert.equal(s.getItem("commish:theme"), "dark");
  assert.equal(s.getItem("buff:config"), null);
  assert.equal(s.getItem("buff:theme"), null);
  assert.equal(s.getItem("other"), "x");
});

test("a value already under the new name wins, and running it twice changes nothing", () => {
  const s = memoryStorage({ "buff:theme": "light", "commish:theme": "dark" });
  migrateLegacyStorage(s);
  migrateLegacyStorage(s);
  assert.equal(s.getItem("commish:theme"), "dark");
  assert.equal(s.length, 1);
});

test("the inline script is valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(STORAGE_MIGRATION_SCRIPT));
});
