"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/ui/Icon";

/** "Week 4", or "Preseason" for week 0. */
export function weekLabel(week: number): string {
  return week === 0 ? "Preseason" : `Week ${week}`;
}

/**
 * The header's week, as a button that opens the season's weeks to pick from —
 * the current one marked, playoff weeks labeled. Closes on a pick, a click
 * elsewhere, or Escape.
 */
export function WeekPicker({
  label,
  week,
  currentWeek,
  lastWeek,
  regularSeasonWeeks,
  firstWeek = 1,
  onChange,
}: {
  /** What the button reads, e.g. "Week 5". */
  label: string;
  week: number;
  currentWeek: number;
  /** The season's final week (the championship). */
  lastWeek: number;
  /** Weeks after this are the playoffs; null when unknown. */
  regularSeasonWeeks: number | null;
  /** The first week offered: 1, or 0 to offer the preseason too. */
  firstWeek?: number;
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

  const last = Math.max(lastWeek, currentWeek, week);
  const weeks = Array.from({ length: last - firstWeek + 1 }, (_, i) => firstWeek + i);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-lg font-extrabold uppercase tracking-wide text-ink-primary sm:gap-2 sm:text-3xl"
      >
        {label}
        <ChevronDownIcon className={`h-4 w-4 text-ink-secondary transition-transform sm:h-6 sm:w-6 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Week"
          className="absolute left-1/2 top-full z-20 mt-2 max-h-72 w-40 -translate-x-1/2 animate-[dropdown_0.12s_ease-out] overflow-y-auto border border-border bg-surface-raised py-1 shadow-lg"
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
                  <span>{weekLabel(w)}</span>
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
