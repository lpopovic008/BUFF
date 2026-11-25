"use client";

import { useEffect, useState } from "react";
import { LIST_MOVE } from "@/hooks/useListScroll";
import { PlateCard } from "@/components/ui/PlateCard";
import { pickAt, RecapBowlPicks } from "@/lib/localStore";
import { isSectionIncluded, isUpcomingSection, matchupNumber, recapLayout, RecapModel, RecapSectionKey } from "@/lib/recap-model";
import { addableSections, sectionName } from "./RecapSectionsEditor";

interface Entry {
  /** Matches the section's data-recap-section in the editor. */
  key: string;
  label: string;
  emoji?: string;
  /** False for a section left out of the write-up. */
  included: boolean;
  /** Under the upcoming week's heading. */
  nested?: boolean;
  /** A section of the layout (not the title or the upcoming week's heading) — one that can be moved or removed. */
  section?: RecapSectionKey;
}

/** The write-up's sections, in the editor's order (the recap's own layout), named as the editor shows them. */
export function recapContents(model: RecapModel, resultPicks: RecapBowlPicks | null): Entry[] {
  const layout = recapLayout(model);
  const entries: Entry[] = [{ key: "title", label: model.title.trim() || "Title", included: true }];
  for (const key of layout) {
    if (isUpcomingSection(key) && !entries.some((e) => e.key === "upcoming")) {
      entries.push({ key: "upcoming", label: `Upcoming week ${model.upcomingWeek}`, included: true });
    }
    const named = sectionName(key, model);
    // A Bowl of the Week by the name it was given, once it has one.
    const n = matchupNumber(key);
    const picked = n !== null && !isUpcomingSection(key) ? pickAt(resultPicks, n).name.trim() : "";
    entries.push({
      key,
      section: key,
      emoji: named.emoji,
      label: picked || named.label,
      included: isSectionIncluded(model, key),
      nested: isUpcomingSection(key),
    });
  }
  return entries;
}

/** The sections not in the recap's layout — the ones there are to add (a Matchup of the Week for each of the league's games). */
export function sectionsToAdd(model: RecapModel, maxMatchups: number): RecapSectionKey[] {
  return addableSections(recapLayout(model), maxMatchups);
}

/** The header and ticker's height: how far down the page a section has to be to be in view. */
function topOffset(): number {
  const root = getComputedStyle(document.documentElement);
  return (parseFloat(root.getPropertyValue("--header-h")) || 0) + 16;
}

const sectionEl = (key: string) => document.querySelector<HTMLElement>(`[data-recap-section="${key}"]`);

/** A small square button on a contents row: move up, move down, remove. */
function RowButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center text-xs text-ink-muted transition-colors hover:text-ink-primary disabled:opacity-25 disabled:hover:text-ink-muted"
    >
      {children}
    </button>
  );
}

/**
 * The recap's table of contents, down the side: each section by name, the
 * one you're reading lit, a click away from any other. A section left out of
 * the write-up is struck through. Each section can be moved up or down or
 * removed, and under the list, any section not in the recap can be added —
 * the layout carrying on to the weeks after (see RecapModel.layout).
 */
export function RecapContents({
  entries,
  toAdd = [],
  upcomingLabel = "Upcoming week",
  onMove,
  onRemove,
  onAdd,
  onToggleIncluded,
  room = false,
  scroller = null,
}: {
  entries: Entry[];
  /** The heading over next week's sections in the list to add: "Upcoming week 5". */
  upcomingLabel?: string;
  /** The sections there are to add (see sectionsToAdd). */
  toAdd?: RecapSectionKey[];
  onMove?: (key: RecapSectionKey, by: -1 | 1) => void;
  onRemove?: (key: RecapSectionKey) => void;
  onAdd?: (key: RecapSectionKey) => void;
  /** Leaves a section out of the write-up, or puts it back — in the League Room (`room`), where its own box has no button for it. */
  onToggleIncluded?: (key: RecapSectionKey) => void;
  /**
   * In the League Room (by its write-ups, on the back wall): see-through, in the room's smaller type, each section's
   * row with its box to leave it out.
   */
  room?: boolean;
  /** What the write-up's scrolled in, when it isn't the page (the League Room's write-ups panel). */
  scroller?: HTMLElement | null;
}) {
  const [adding, setAdding] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const keys = entries.map((e) => e.key).join(",");

  // The section you're reading: the last whose top has passed under the header (or its box's top).
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = (scroller ? scroller.getBoundingClientRect().top : topOffset()) + 40;
      let current: string | null = null;
      for (const key of keys.split(",")) {
        const el = sectionEl(key);
        if (el && el.getBoundingClientRect().top <= line) current = key;
      }
      // At the very bottom, the last section is the one in view however short it is.
      const atBottom = scroller
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
        : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) current = keys.split(",").at(-1) ?? current;
      setActive(current ?? keys.split(",")[0]);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    queueMicrotask(update);
    const source: EventTarget = scroller ?? window;
    source.addEventListener("scroll", onScroll, { passive: true });
    scroller?.addEventListener(LIST_MOVE, onScroll);
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      source.removeEventListener("scroll", onScroll);
      scroller?.removeEventListener(LIST_MOVE, onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [keys, scroller]);

  const jump = (key: string) => {
    const el = sectionEl(key);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (scroller) {
      const top = scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
      scroller.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
      return;
    }
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - topOffset(), behavior: reduced ? "auto" : "smooth" });
  };

  const list = (
      <nav aria-label="Recap sections">
        <ul className="flex flex-col">
          {entries.map((entry) => {
            const isActive = active === entry.key;
            // Moves keep to the section's own group: the write-up's, or next week's previews.
            const group = entries.filter((e) => e.section && !!e.nested === !!entry.nested);
            const at = group.indexOf(entry);
            return (
              <li key={entry.key} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => jump(entry.key)}
                  aria-current={isActive ? "location" : undefined}
                  title={entry.included ? undefined : "Left out of the write-up"}
                  className={`flex min-w-0 flex-1 items-baseline gap-2 px-2 text-left transition-colors ${room ? "py-1 text-xs" : "py-1.5 text-sm"} ${
                    entry.nested ? "pl-6" : ""
                  } ${
                    isActive
                      ? "bg-[var(--map-tag)] font-semibold text-[var(--map-tag-ink)]"
                      : "text-ink-secondary hover:text-ink-primary"
                  } ${entry.included ? "" : "line-through opacity-60"}`}
                >
                  {entry.emoji ? <span aria-hidden className="w-5 shrink-0 text-center">{entry.emoji}</span> : null}
                  <span className="min-w-0 truncate">{entry.label}</span>
                </button>
                {entry.section && onMove && onRemove ? (
                  <span className="flex shrink-0 items-center">
                    {room && onToggleIncluded ? (
                      <label className="flex h-6 w-6 shrink-0 items-center justify-center" title={entry.included ? `Leave ${entry.label} out` : `Put ${entry.label} back in`}>
                        <input
                          type="checkbox"
                          checked={entry.included}
                          onChange={() => onToggleIncluded(entry.section!)}
                          aria-label={entry.included ? `Leave ${entry.label} out` : `Put ${entry.label} back in`}
                          className="h-3.5 w-3.5 accent-[var(--ink-primary)]"
                        />
                      </label>
                    ) : null}
                    <RowButton label={`Move ${entry.label} up`} onClick={() => onMove(entry.section!, -1)} disabled={at <= 0}>
                      ↑
                    </RowButton>
                    <RowButton label={`Move ${entry.label} down`} onClick={() => onMove(entry.section!, 1)} disabled={at >= group.length - 1}>
                      ↓
                    </RowButton>
                    <RowButton label={`Remove ${entry.label}`} onClick={() => onRemove(entry.section!)}>
                      ×
                    </RowButton>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>
  );
  return (
    <div className="flex flex-col gap-2">
    {room ? (
      // See-through, as everything on the back wall is: just its heading over the list.
      <section className="flex flex-col gap-1">
        <h2 className="border-b border-border pb-1 text-xs font-bold uppercase tracking-wide text-ink-primary">Contents</h2>
        {list}
      </section>
    ) : (
      <PlateCard title="Contents" bodyClassName="p-2">
        {list}
      </PlateCard>
    )}
    {/* Under the contents: a section to add — the rest of this week's and every week's after. */}
    {onAdd && toAdd.length > 0 ? (
      adding ? (
        <div className={`flex flex-col border border-border p-2 ${room ? "" : "bg-surface-raised"}`}>
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">Add a section</span>
            <RowButton label="Close" onClick={() => setAdding(false)}>
              ×
            </RowButton>
          </div>
          {/* This week's recap, then next week's previews — each under its own heading. */}
          {[
            { label: "This week's recap", keys: toAdd.filter((k) => !isUpcomingSection(k)) },
            { label: upcomingLabel, keys: toAdd.filter((k) => isUpcomingSection(k)) },
          ].map((group) =>
            group.keys.length > 0 ? (
              <div key={group.label} className="flex flex-col">
                <span className="px-2 pb-0.5 pt-2 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-muted">{group.label}</span>
                <ul className="flex flex-col">
                  {group.keys.map((key) => {
                    const { emoji, label } = sectionName(key);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => {
                            onAdd(key);
                            setAdding(false);
                          }}
                          className={`flex w-full items-baseline gap-2 px-2 text-left text-ink-secondary transition-colors hover:text-ink-primary ${room ? "py-1 text-xs" : "py-1.5 text-sm hover:bg-page"}`}
                        >
                          <span aria-hidden className="w-5 shrink-0 text-center">{emoji}</span>
                          <span className="min-w-0 truncate">{label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={room ? "border border-ink-primary px-3 py-1.5 text-xs font-semibold text-ink-primary hover:bg-[var(--map-tag)] hover:text-[var(--map-tag-ink)]" : "bg-[var(--map-tag)] px-3 py-2 text-sm font-semibold text-[var(--map-tag-ink)] hover:opacity-90"}
        >
          + Add section
        </button>
      )
    ) : null}
    </div>
  );
}
