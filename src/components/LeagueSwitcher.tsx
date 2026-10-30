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
 * On a phone, the league you're looking at along the top of the screen, right under the header, where the home page's
 * ticker runs: its name, centred — swiped sideways to the next league (or back) along with its lineups under it (see
 * useSwipePager: `bar` is swiped, `track` slides), or tapped to drop down every league to pick from. It publishes its
 * height as --ticker-h, as the ticker does, so what's under it starts below it.
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

  useEffect(() => {
    const el = own.current;
    if (!el) return;
    const root = document.documentElement.style;
    const publish = () => root.setProperty("--ticker-h", `${el.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeProperty("--ticker-h");
    };
  }, []);

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
      className="fixed inset-x-0 top-[var(--header-h,0px)] z-40 touch-none select-none bg-page/70 backdrop-blur-[3px]"
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
              className="w-full shrink-0 px-4 py-2.5 text-ink-primary"
            >
              <LeagueTitle
                league={league}
                after={<ChevronDownIcon width={12} height={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />}
              />
            </button>
          ))}
        </div>
      </div>
      {/* Every league, to pick one from. */}
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
