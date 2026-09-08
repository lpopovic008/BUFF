"use client";

import { useMemo, useState } from "react";
import { nextSortState, SortState, sortRows, SortValue } from "@/lib/table-sort";

/**
 * Column sorting for a table: click a header to sort it descending, again for
 * ascending, a third time to drop back to the table's original order.
 *
 * `columns` maps each sortable column's key to the value its rows sort on, so
 * a column can sort on something other than what it displays (a record sorts
 * by win count, a finish by its rank number).
 */
export function useTableSort<T>(rows: T[], columns: Record<string, (row: T) => SortValue>) {
  const [sortState, setSortState] = useState<SortState | null>(null);

  const sorted = useMemo(
    () => sortRows(rows, sortState, (row, key) => columns[key]?.(row)),
    // `columns` is rebuilt every render by callers, so keying on it would
    // resort on every render — the sort only depends on the rows and state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sortState]
  );

  return {
    sorted,
    sortState,
    toggleSort: (key: string) => setSortState((current) => nextSortState(current, key)),
  };
}
