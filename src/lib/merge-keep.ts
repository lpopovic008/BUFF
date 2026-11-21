// Merging two copies of something typed — this browser's and the account's (see supabase-sync.ts), or the write-up
// editor's and what's saved under it (see useRecapActions) — so nothing typed on either side is ever lost.
//
// A three-way merge against `base`, the copy both last agreed on: whatever only one side changed since, that side's
// change is kept (a deletion included — it was made on purpose); whatever both changed, both are kept — text that
// differs is joined, the one added onto the other, never one picked over the other by which is newer. With no base
// (they never agreed), everything both have is "changed on both sides".

type Json = unknown;

const isObject = (v: Json): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Whether two JSON values are the same, key order aside. */
export function sameJson(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!sameJson(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/**
 * Two texts both changed, kept both: one that's empty takes the other; one that already has all of the other in it
 * is kept as it is; otherwise the other's added onto this one — on a new paragraph for writing that runs over lines,
 * after a " / " for a one-line name.
 */
export function joinTexts(local: string, remote: string): string {
  if (local === remote) return local;
  if (!local.trim()) return remote;
  if (!remote.trim()) return local;
  if (local.includes(remote.trim())) return local;
  if (remote.includes(local.trim())) return remote;
  const lines = local.includes("\n") || remote.includes("\n");
  return `${local.trimEnd()}${lines ? "\n\n" : " / "}${remote.trim()}`;
}

/**
 * `local` and `remote` merged against `base` (see the top of this file): changed on one side only, that side's;
 * on both, objects merged key by key, texts joined (see joinTexts), lists of names (a write-up's sections) put
 * together — this side's in its order, then any of the other's it hasn't — and anything else, this side's.
 */
export function mergeKeep(base: Json, local: Json, remote: Json): Json {
  if (sameJson(local, remote)) return local;
  if (base !== undefined && sameJson(remote, base)) return local;
  if (base !== undefined && sameJson(local, base)) return remote;
  if (local === undefined) return remote;
  if (remote === undefined) return local;
  if (isObject(local) && isObject(remote)) {
    const out: Record<string, Json> = {};
    const b = isObject(base) ? base : undefined;
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const v = mergeKeep(b?.[k], local[k], remote[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (typeof local === "string" && typeof remote === "string") return joinTexts(local, remote);
  if (Array.isArray(local) && Array.isArray(remote) && [...local, ...remote].every((v) => typeof v === "string")) {
    return [...local, ...remote.filter((v) => !local.includes(v))];
  }
  return local;
}

/**
 * Two collections by key (every saved write-up, say) merged against their base, each entry by mergeKeep — one this
 * side deleted on purpose (in the base, not here, unchanged there) stays deleted; one only the other side has, kept.
 */
export function mergeCollections<T>(base: Record<string, T> | undefined, local: Record<string, T>, remote: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const v = mergeKeep(base?.[k], local[k], remote[k]);
    if (v !== undefined) out[k] = v as T;
  }
  return out;
}
