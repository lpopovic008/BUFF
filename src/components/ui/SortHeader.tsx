"use client";

import { ariaSortFor, SortState } from "@/lib/table-sort";

/**
 * A clickable column header. Shows which way the column is currently pointed,
 * and keeps a dimmed caret on every other column so it reads as sortable
 * before it's ever been clicked.
 */
export function SortHeader({
  sortKey,
  state,
  onSort,
  align = "left",
  children,
}: {
  sortKey: string;
  state: SortState | null;
  onSort: (key: string) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const active = state?.key === sortKey;
  return (
    <th
      className={`py-2 pr-3 font-medium ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={ariaSortFor(state, sortKey)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-ink-primary ${
          active ? "text-ink-primary" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{children}</span>
        <span aria-hidden="true" className={active ? "text-series-1" : "text-ink-muted/40"}>
          {active ? (state!.direction === "asc" ? "▲" : "▼") : "▾"}
        </span>
      </button>
    </th>
  );
}
