"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MatchupRows, TickerLeague } from "@/components/LeagueTicker";
import { ChevronDownIcon } from "@/components/ui/Icon";

/** How long a swipe has to have settled before the league it's on is picked (ms). */
const SETTLE_MS = 100;

/**
 * A league as the ticker shows it: its logo and name over your matchup this week, the winner lit — its place in your
 * leagues outlined at the top right, with whatever else goes there (`corner`) beside it.
 */
export function LeagueLines({ league, position, corner }: { league: TickerLeague; position: number; corner?: React.ReactNode }) {
  const { matchup, my, opponent } = league;
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-ink-muted">
        {league.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a remote Sleeper avatar on a static export; nothing for next/image to optimize
          <img src={league.logo} alt="" draggable={false} className="h-3 w-3 shrink-0 rounded-full object-cover" />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{league.name}</span>
        <span className="shrink-0 border border-ink-primary px-1 font-semibold tabular-nums leading-[1.4] text-ink-primary">{position}</span>
        {corner}
      </span>
      {matchup && my ? (
        <MatchupRows
          fitWidth
          dense
          teams={[
            { name: matchup.my.teamName, points: matchup.my.points, standing: my, mine: true, winning: league.winner === "my" },
            {
              name: matchup.opponent?.teamName ?? "Bye",
              points: matchup.opponent ? matchup.opponent.points : null,
              standing: opponent,
              winning: league.winner === "opponent",
            },
          ]}
        />
      ) : (
        <span className="text-xs text-ink-secondary">{matchup === null ? "No matchup this week" : "Loading…"}</span>
      )}
    </span>
  );
}

/**
 * On a phone, the league you're looking at along the top of the screen, right under the header, where the home page's
 * ticker runs: swiped sideways to the next league (or back), or tapped to drop down every league to pick from. It
 * publishes its height as --ticker-h, as the ticker does, so what's under it starts below it.
 */
export function LeagueSwitcher({
  leagues,
  selectedId,
  onSelect,
}: {
  leagues: TickerLeague[];
  selectedId: string;
  onSelect: (leagueId: string) => void;
}) {
  const bar = useRef<HTMLElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const index = Math.max(0, leagues.findIndex((l) => l.leagueId === selectedId));

  useEffect(() => {
    const el = bar.current;
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

  // The strip kept on the league that's picked: there at once at first, slid over to it when it's picked from the list.
  const placed = useRef(false);
  useLayoutEffect(() => {
    const el = strip.current;
    if (!el) return;
    const left = index * el.clientWidth;
    if (Math.abs(el.scrollLeft - left) > 1) el.scrollTo({ left, behavior: placed.current ? "smooth" : "instant" });
    placed.current = true;
  }, [index]);

  // Swiped to another league: it's picked once the strip comes to rest on it.
  const latest = useRef({ leagues, selectedId, onSelect });
  useEffect(() => {
    latest.current = { leagues, selectedId, onSelect };
  });
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    let settle = 0;
    const onScroll = () => {
      clearTimeout(settle);
      settle = window.setTimeout(() => {
        const { leagues, selectedId, onSelect } = latest.current;
        const at = leagues[Math.round(el.scrollLeft / Math.max(1, el.clientWidth))];
        if (at && at.leagueId !== selectedId) onSelect(at.leagueId);
      }, SETTLE_MS);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(settle);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  // A tap anywhere else puts the list away.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  if (leagues.length === 0) return null;
  return (
    <nav ref={bar} aria-label="Your leagues" className="fixed inset-x-0 top-[var(--header-h,0px)] z-40 border-b border-border bg-page/70 backdrop-blur-[3px]">
      <div
        ref={strip}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
      >
        {leagues.map((league, i) => (
          <button
            key={league.leagueId}
            type="button"
            aria-expanded={open}
            aria-label={`${league.name} — pick another league`}
            onClick={() => setOpen((o) => !o)}
            className="w-full shrink-0 snap-center px-4 py-1.5 text-left"
          >
            <LeagueLines
              league={league}
              position={i + 1}
              corner={<ChevronDownIcon width={12} height={12} className={`shrink-0 text-ink-primary transition-transform ${open ? "rotate-180" : ""}`} />}
            />
          </button>
        ))}
      </div>
      {/* Every league, to pick one from. */}
      {open ? (
        <ul className="absolute inset-x-0 top-full max-h-[50svh] overflow-y-auto border-b border-border bg-page">
          {leagues.map((league, i) => {
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
                  className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide transition-colors ${
                    on ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "text-ink-secondary active:text-ink-primary"
                  }`}
                >
                  <span className="w-4 shrink-0 tabular-nums">{i + 1}</span>
                  {league.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a remote Sleeper avatar on a static export
                    <img src={league.logo} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
                  ) : null}
                  <span className="min-w-0 truncate">{league.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </nav>
  );
}
