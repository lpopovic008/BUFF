"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@/components/ui/Icon";
import { useSwipePager } from "@/hooks/useSwipePager";
import { setHeaderBare, useBackStep, useHeaderSlot } from "@/lib/header-slot";

/** A league as the League Room lists it: its name and logo. */
export interface RoomLeague {
  leagueId: string;
  name: string;
  logo: string | null;
}

/**
 * A league's logo and name, centred (or `start`, against the left edge), with whatever goes after them (`after`) —
 * `large`, as big as the header's "Week N".
 */
export function LeagueTitle({
  league,
  after,
  large = false,
  start = false,
}: {
  league: RoomLeague;
  after?: React.ReactNode;
  large?: boolean;
  start?: boolean;
}) {
  return (
    <span
      className={`flex min-w-0 items-center ${start ? "justify-start" : "justify-center"} uppercase tracking-wide ${
        large ? "gap-2 text-lg font-extrabold sm:text-3xl" : "gap-1.5 text-xs font-bold"
      }`}
    >
      {league.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a remote Sleeper avatar on a static export; nothing for next/image to optimize
        <img src={league.logo} alt="" draggable={false} className={`shrink-0 rounded-full object-cover ${large ? "h-5 w-5 sm:h-7 sm:w-7" : "h-4 w-4"}`} />
      ) : null}
      <span className="min-w-0 truncate">{league.name}</span>
      {after}
    </span>
  );
}

/**
 * How much bigger a room's columns draw their text (CSS zoom) for a middle column `middle` px wide: the League Room's
 * lineups are made for a middle column MIDDLE_MADE_FOR wide, and wider, everything in its three columns is drawn that
 * much bigger, up to MIDDLE_MOST_ZOOM — never smaller — so their text is the same size across them.
 */
export const MIDDLE_MADE_FOR = 640;
export const MIDDLE_MOST_ZOOM = 1.35;
export function roomTextZoom(middle: number): number {
  return Math.min(MIDDLE_MOST_ZOOM, Math.max(1, middle / MIDDLE_MADE_FOR));
}
/** How much wider a room's middle column is than either side one (see the League Room's). */
export const MIDDLE_OVER_SIDE = 1.6;

/**
 * Leagues to pick from, as the League Room's left column lists them: each its logo and name against the left edge,
 * the one picked lit like the header's page tabs — and under it, whatever goes with it there (`under`).
 */
export function RoomLeagueList({
  leagues,
  selectedId,
  onSelect,
  label,
  under,
  zoomed = true,
}: {
  leagues: RoomLeague[];
  selectedId: string | null;
  onSelect: (leagueId: string) => void;
  label: string;
  under?: React.ReactNode;
  /** Drawn bigger with its column (see roomTextZoom) — not where it's dropped down from something else. */
  zoomed?: boolean;
}) {
  // Its text as big as the League Room's: drawn bigger as its column is wider, by as much as the League Room draws its
  // columns' (see roomTextZoom) — its column a side one, the middle MIDDLE_OVER_SIDE as wide.
  const [box, setBox] = useState<HTMLUListElement | null>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const column = box?.parentElement;
    if (!column || !zoomed) return;
    const measure = () => setZoom(roomTextZoom(column.clientWidth * MIDDLE_OVER_SIDE));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [box, zoomed]);
  return (
    <ul ref={setBox} className="flex flex-col gap-1" aria-label={label} style={zoom === 1 || !zoomed ? undefined : { zoom }}>
      {leagues.map((league) => {
        const on = league.leagueId === selectedId;
        return (
          <li key={league.leagueId}>
            <button
              type="button"
              aria-current={on || undefined}
              onClick={() => onSelect(league.leagueId)}
              className={`flex w-full items-center gap-2 px-3 py-2 transition-colors ${on ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "text-ink-secondary hover:text-ink-primary"}`}
            >
              <span className="min-w-0 flex-1">
                <LeagueTitle league={league} start />
              </span>
            </button>
            {on && under ? <div className="pb-2 pt-1">{under}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The league picked, as a header: its logo and name against the left edge, a chevron at the right — tapped, every
 * league to pick from dropped down under it (see RoomLeagueList), put away again by a pick, a tap anywhere else, or
 * Escape.
 */
export function LeagueDropdown({ leagues, selectedId, onSelect, label }: { leagues: RoomLeague[]; selectedId: string | null; onSelect: (leagueId: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const picked = leagues.find((l) => l.leagueId === selectedId) ?? leagues[0];
  if (!picked) return null;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${picked.name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 border-b border-ink-primary/60 py-1.5 text-ink-primary"
      >
        <span className="min-w-0 flex-1">
          <LeagueTitle league={picked} start />
        </span>
        <ChevronDownIcon width={14} height={14} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 border border-border bg-page p-1 shadow-lg">
          <RoomLeagueList
            leagues={leagues}
            selectedId={picked.leagueId}
            onSelect={(id) => {
              onSelect(id);
              setOpen(false);
            }}
            label={label}
            zoomed={false}
          />
        </div>
      ) : null}
    </div>
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
  // Dropped down, a back button's one step back puts it away.
  useBackStep(open, () => setOpen(false));

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
              className="w-full shrink-0 px-1 text-ink-primary"
            >
              <LeagueTitle
                league={league}
                large
                after={<ChevronDownIcon width={16} height={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />}
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

/**
 * A page's leagues (or whatever it picks between) switched in the page header on a phone, as the League Room's are
 * (see LeagueSwitcher): the header cleared down to its back button and the app's logo, the one picked named in its
 * middle — swiped sideways to the next, or tapped to drop them all down to pick from.
 */
export function HeaderLeagueSwitcher({
  leagues,
  selectedId,
  onSelect,
}: {
  leagues: RoomLeague[];
  selectedId: string;
  onSelect: (leagueId: string) => void;
}) {
  useEffect(() => {
    setHeaderBare(true);
    return () => setHeaderBare(false);
  }, []);
  const slot = useHeaderSlot();
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const [names, setNames] = useState<HTMLDivElement | null>(null);
  const index = Math.max(0, leagues.findIndex((l) => l.leagueId === selectedId));
  useSwipePager({
    surfaces: [bar],
    tracks: [names],
    follow: null,
    count: leagues.length,
    index,
    onPick: (page) => onSelect(leagues[page].leagueId),
  });
  return slot ? createPortal(<LeagueSwitcher leagues={leagues} selectedId={selectedId} onSelect={onSelect} bar={setBar} track={setNames} />, slot) : null;
}
