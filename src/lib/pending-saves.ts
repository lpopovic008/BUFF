// Saves still waiting to happen — a write-up's edits not yet written to this browser's storage (see useRecapActions)
// — kept here so anything about to read or replace what's stored (account sync, see supabase-sync.ts; the page going
// away) can have them written first, and nothing typed is ever caught between being typed and being saved.

const pending = new Set<() => void>();

/** Adds a way to write something not yet saved, right now; returns how to take it off again. */
export function onFlush(flush: () => void): () => void {
  pending.add(flush);
  return () => pending.delete(flush);
}

/** Writes everything not yet saved, now. */
export function flushPendingSaves(): void {
  for (const flush of pending) {
    try {
      flush();
    } catch {
      // One failing never keeps the rest from being saved.
    }
  }
}
