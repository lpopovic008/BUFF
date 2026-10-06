"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/ui/Icon";

/**
 * A small "Week N" button that opens the season's weeks to pick from — the
 * current one marked, playoff weeks labeled. Closes on a pick, a click
 * elsewhere, or Escape.
 */
export function WeekPicker({
  week,
  currentWeek,
  lastWeek,
  regularSeasonWeeks,
  onChange,
}: {
  week: number;
  currentWeek: number;
  /** The season's final week (the championship). */
  lastWeek: number;
  /** Weeks after this are the playoffs; null when unknown. */
  regularSeasonWeeks: number | null;
  onChange: (week: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const weeks = Array.from({ length: Math.max(lastWeek, currentWeek, week) }, (_, i) => i + 1);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 border border-border px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-ink-primary transition-colors hover:border-ink-primary"
      >
        Week {week}
        <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Week"
          className="absolute left-0 top-full z-20 mt-1 max-h-72 w-40 animate-[dropdown_0.12s_ease-out] overflow-y-auto border border-border bg-surface-raised py-1 shadow-lg"
        >
          {weeks.map((w) => {
            const selected = w === week;
            const playoffs = regularSeasonWeeks != null && w > regularSeasonWeeks;
            return (
              <li key={w} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(w);
                    setOpen(false);
                  }}
                  className={`flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-xs tabular-nums transition-colors ${
                    selected ? "bg-[var(--map-tag)] font-bold text-[var(--map-tag-ink)]" : "text-ink-primary hover:bg-page"
                  }`}
                >
                  <span>Week {w}</span>
                  <span className={`text-[0.625rem] uppercase tracking-wide ${selected ? "" : "text-ink-muted"}`}>
                    {w === currentWeek ? "Now" : playoffs ? "Playoffs" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
