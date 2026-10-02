// The app was called BUFF before it was Commi$h, and everything it keeps in
// the browser was stored under "buff:" keys. Those now live under
// "commish:" — this moves anything still under the old prefix across once,
// before the app reads any of it, so nobody's settings, recaps or theme are
// lost to the rename.

export const LEGACY_STORAGE_PREFIX = "buff:";
export const STORAGE_PREFIX = "commish:";

/** Moves every "buff:" key in `storage` to its "commish:" name. A key already set under the new name wins; the old one is dropped either way. */
export function migrateLegacyStorage(storage: Storage): void {
  const legacy: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.indexOf("buff:") === 0) legacy.push(key);
  }
  for (const key of legacy) {
    const renamed = "commish:" + key.slice("buff:".length);
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(renamed) === null) storage.setItem(renamed, value);
    storage.removeItem(key);
  }
}

/** Inline <head> script: runs the migration on both storages before anything else on the page reads them. */
export const STORAGE_MIGRATION_SCRIPT = `(function(){var m=${migrateLegacyStorage.toString()};
try{m(localStorage)}catch(e){}try{m(sessionStorage)}catch(e){}})();`;
