"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/ui/Icon";

/** A league as the League Room lists it: its name and logo. */
export interface RoomLeague {
  leagueId: string;
  name: string;
  logo: string | null;
}

/** A league's logo and name, centred, with whatever goes after them (`after`). */
export function LeagueTitle({ league, after }: { league: RoomLeague; after?: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide">
      {league.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a remote Sleeper avatar on a static export; nothing for next/image to optimize
        <img src={league.logo} alt="" draggable={false} className="h-4 w-4 shrink-0 rounded-full object-cover" />
      ) : null}
      <span className="min-w-0 truncate">{league.name}</span>
      {after}
    </span>
  );
}

/**
 * On a phone, the league you're looking at in the middle of the page header (see header-slot.ts): its name, centred —
 * swiped sideways to the next league (or back) along with its lineups under it (see useSwipePager: `bar` is swiped,
 * `track` slides), or tapped to drop down every league to pick from, right across the screen under the header.
 */
export function LeagueSwitcher({
  leagues,
  selectedId,
  onSelect,
  bar,
  track,
}: {
  leagues: RoomLeague[];
  selectedId: string;
  onSelect: (leagueId: string) => void;
  bar: (el: HTMLElement | null) => void;
  track: (el: HTMLDivElement | null) => void;
}) {
  const own = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  // A tap anywhere else puts the list away.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!own.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  if (leagues.length === 0) return null;
  return (
    <nav
      ref={(el) => {
        own.current = el;
        bar(el);
      }}
      aria-label="Your leagues"
      className="touch-none select-none"
    >
      <div className="overflow-hidden">
        <div ref={track} className="flex will-change-transform">
          {leagues.map((league) => (
            <button
              key={league.leagueId}
              type="button"
              aria-expanded={open}
              aria-label={`${league.name} — pick another league`}
              onClick={() => setOpen((o) => !o)}
              className="w-full shrink-0 px-1 py-1.5 text-ink-primary"
            >
              <LeagueTitle
                league={league}
                after={<ChevronDownIcon width={12} height={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />}
              />
            </button>
          ))}
        </div>
      </div>
      {/* Every league, to pick one from — under the header, right across it (its row is what it's placed against). */}
      {open ? (
        <ul className="absolute inset-x-0 top-full max-h-[50svh] overflow-y-auto bg-page">
          {leagues.map((league) => {
            const on = league.leagueId === selectedId;
            return (
              <li key={league.leagueId}>
                <button
                  type="button"
                  aria-current={on || undefined}
                  onClick={() => {
                    setOpen(false);
                    onSelect(league.leagueId);
                  }}
                  className={`w-full px-4 py-2.5 transition-colors ${
                    on ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "text-ink-secondary active:text-ink-primary"
                  }`}
                >
                  <LeagueTitle league={league} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </nav>
  );
}
