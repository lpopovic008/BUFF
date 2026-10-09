"use client";

import { useEffect, useState } from "react";
import { PlateCard } from "@/components/ui/PlateCard";
import { BowlGamePick } from "@/lib/localStore";
import { isSectionIncluded, RecapModel, RecapSectionKey } from "@/lib/recap-model";
import { SECTION_TITLE } from "./RecapSectionsEditor";

interface Entry {
  /** Matches the section's data-recap-section in the editor. */
  key: string;
  label: string;
  emoji?: string;
  /** False for a section left out of the write-up. */
  included: boolean;
  /** Under the upcoming week's heading. */
  nested?: boolean;
}

/** The write-up's sections, in the editor's order, named as the editor shows them. */
export function recapContents(
  model: RecapModel,
  picks: { bowl: BowlGamePick | null; honorable: BowlGamePick | null }
): Entry[] {
  const section = (key: Exclude<RecapSectionKey, "bowl" | "honorable">, nested = false): Entry => ({
    key,
    ...SECTION_TITLE[key],
    included: isSectionIncluded(model, key),
    nested,
  });
  return [
    { key: "title", label: model.title.trim() || "Title", included: true },
    section("aiRecap"),
    { key: "bowl", emoji: "👑", label: picks.bowl?.name?.trim() || "Bowl of the Week", included: isSectionIncluded(model, "bowl") },
    {
      key: "honorable",
      emoji: "🏆",
      label: picks.honorable?.name?.trim() || "Honorable Mention",
      included: isSectionIncluded(model, "honorable"),
    },
    section("highScorer"),
    section("winners"),
    section("lastWeek"),
    section("standings"),
    section("records"),
    { key: "upcoming", label: `Upcoming week ${model.upcomingWeek}`, included: true },
    section("upcomingBowl", true),
    section("upcomingHonorable", true),
  ];
}

/** The header and ticker's height: how far down the page a section has to be to be in view. */
function topOffset(): number {
  const root = getComputedStyle(document.documentElement);
  return (parseFloat(root.getPropertyValue("--header-h")) || 0) + 16;
}

const sectionEl = (key: string) => document.querySelector<HTMLElement>(`[data-recap-section="${key}"]`);

/**
 * The recap's table of contents, down the side: each section by name, the
 * one you're reading lit, a click away from any other. A section left out of
 * the write-up is struck through.
 */
export function RecapContents({ entries }: { entries: Entry[] }) {
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
    <PlateCard title="Contents" bodyClassName="p-2">
      <nav aria-label="Recap sections">
        <ul className="flex flex-col">
          {entries.map((entry) => {
            const isActive = active === entry.key;
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => jump(entry.key)}
                  aria-current={isActive ? "location" : undefined}
                  title={entry.included ? undefined : "Left out of the write-up"}
                  className={`flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm transition-colors ${
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
              </li>
            );
          })}
        </ul>
      </nav>
    </PlateCard>
  );
}
