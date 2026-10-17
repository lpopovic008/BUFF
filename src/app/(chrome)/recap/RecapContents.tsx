"use client";

import { useEffect, useState } from "react";
import { PlateCard } from "@/components/ui/PlateCard";
import { BowlGamePick } from "@/lib/localStore";
import { isSectionIncluded, isUpcomingSection, RECAP_SECTIONS, recapLayout, RecapModel, RecapSectionKey } from "@/lib/recap-model";
import { sectionName } from "./RecapSectionsEditor";

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
export function recapContents(
  model: RecapModel,
  picks: { bowl: BowlGamePick | null; honorable: BowlGamePick | null }
): Entry[] {
  const layout = recapLayout(model);
  const entries: Entry[] = [{ key: "title", label: model.title.trim() || "Title", included: true }];
  for (const key of layout) {
    if (isUpcomingSection(key) && !entries.some((e) => e.key === "upcoming")) {
      entries.push({ key: "upcoming", label: `Upcoming week ${model.upcomingWeek}`, included: true });
    }
    const named = sectionName(key);
    const picked = key === "bowl" ? picks.bowl?.name?.trim() : key === "honorable" ? picks.honorable?.name?.trim() : "";
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

/** The sections not in the recap's layout — the ones there are to add. */
export function sectionsToAdd(model: RecapModel): RecapSectionKey[] {
  const layout = recapLayout(model);
  return RECAP_SECTIONS.map((s) => s.key).filter((k) => !layout.includes(k));
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
  onMove,
  onRemove,
  onAdd,
}: {
  entries: Entry[];
  /** The sections there are to add (see sectionsToAdd). */
  toAdd?: RecapSectionKey[];
  onMove?: (key: RecapSectionKey, by: -1 | 1) => void;
  onRemove?: (key: RecapSectionKey) => void;
  onAdd?: (key: RecapSectionKey) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const keys = entries.map((e) => e.key).join(",");

  // The section you're reading: the last whose top has passed under the header.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = topOffset() + 40;
      let current: string | null = null;
      for (const key of keys.split(",")) {
        const el = sectionEl(key);
        if (el && el.getBoundingClientRect().top <= line) current = key;
      }
      // At the very bottom, the last section is the one in view however short it is.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = keys.split(",").at(-1) ?? current;
      setActive(current ?? keys.split(",")[0]);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    queueMicrotask(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [keys]);

  const jump = (key: string) => {
    const el = sectionEl(key);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - topOffset(), behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div className="flex flex-col gap-2">
    <PlateCard title="Contents" bodyClassName="p-2">
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
                  className={`flex min-w-0 flex-1 items-baseline gap-2 px-2 py-1.5 text-left text-sm transition-colors ${
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
    </PlateCard>
    {/* Under the contents: a section to add — the rest of this week's and every week's after. */}
    {onAdd && toAdd.length > 0 ? (
      adding ? (
        <div className="flex flex-col border border-border bg-surface-raised p-2">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">Add a section</span>
            <RowButton label="Close" onClick={() => setAdding(false)}>
              ×
            </RowButton>
          </div>
          <ul className="flex flex-col">
            {toAdd.map((key) => {
              const { emoji, label } = sectionName(key);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(key);
                      setAdding(false);
                    }}
                    className="flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm text-ink-secondary transition-colors hover:bg-page hover:text-ink-primary"
                  >
                    <span aria-hidden className="w-5 shrink-0 text-center">{emoji}</span>
                    <span className="min-w-0 truncate">{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="bg-[var(--map-tag)] px-3 py-2 text-sm font-semibold text-[var(--map-tag-ink)] hover:opacity-90"
        >
          + Add section
        </button>
      )
    ) : null}
    </div>
  );
}
