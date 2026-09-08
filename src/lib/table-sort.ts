// Three-state column sorting shared by the history page's tables: the first
// click on a column sorts it descending, the second ascending, and the third
// drops the sort entirely and hands back the table's original order.

export type SortDirection = "desc" | "asc";

export interface SortState {
  key: string;
  direction: SortDirection;
}

/** The value a column sorts on. Null/undefined means "no value" — those rows sink to the bottom whichever way the column is pointed. */
export type SortValue = string | number | null | undefined;

/** Cycles one column through desc -> asc -> unsorted. Clicking a different column starts that column's cycle over. */
export function nextSortState(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) return { key, direction: "desc" };
  if (current.direction === "desc") return { key, direction: "asc" };
  return null;
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  // numeric:true so "Week 2" lands before "Week 10" rather than after it.
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Sorts a copy of `rows` by the given column. Rows with no value for that
 * column stay at the bottom in both directions, so a column full of em-dashes
 * never pushes real data down the table. Ties keep their original relative
 * order (Array.prototype.sort is stable), and an unsorted state returns the
 * original array untouched.
 */
export function sortRows<T>(
  rows: T[],
  state: SortState | null,
  valueOf: (row: T, key: string) => SortValue
): T[] {
  if (!state) return rows;
  const direction = state.direction === "asc" ? 1 : -1;
  return [...rows].sort((rowA, rowB) => {
    const a = valueOf(rowA, state.key);
    const b = valueOf(rowB, state.key);
    const aMissing = a === null || a === undefined;
    const bMissing = b === null || b === undefined;
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return 0;
      return aMissing ? 1 : -1;
    }
    return direction * compareValues(a, b);
  });
}

/** What a column header should report to screen readers, per the ARIA sort states. */
export function ariaSortFor(state: SortState | null, key: string): "ascending" | "descending" | "none" {
  if (!state || state.key !== key) return "none";
  return state.direction === "asc" ? "ascending" : "descending";
}
