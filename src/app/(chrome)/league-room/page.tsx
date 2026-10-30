"use client";

import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { HORIZON_SHARE } from "@/lib/grid-room";
import { FloorGrid } from "@/components/FloorGrid";
import { FloorReflection } from "@/components/FloorReflection";
import { ScrollThumb } from "@/components/ScrollThumb";
import { useDragScroll } from "@/hooks/useDragScroll";
import { TickerLeague } from "@/components/LeagueTicker";
import { LeagueLines, LeagueSwitcher } from "@/components/LeagueSwitcher";
import { MatchupList, MatchupProviders, MatchupSlide, MatchupStack, useMatchupHeadToHead } from "@/components/LeagueMatchupCarousel";
import { useConfig } from "@/hooks/useConfig";
import { useDashboardMatchups } from "@/hooks/useDashboardMatchups";
import { useAsItStands, usePendingMatchups, useSummariesAsItStands } from "@/hooks/useAsItStands";
import { useLeagueMatchupCarousel } from "@/hooks/useLeagueMatchupCarousel";
import { useLineupDetails } from "@/hooks/useLineupDetails";
import { getLeagueSummary, lastFinishedWeek, LeagueSummary, teamStandings } from "@/lib/league-data";
import { avatarUrl, getCurrentWeek } from "@/lib/sleeper";
import { setHeaderWeek } from "@/lib/header-week";
import { visibleLeagues } from "@/lib/localStore";

/** The NFL regular season's weeks, all of which the header's week picker offers. */
const NFL_WEEKS = 18;

// From laptop width up (wide enough for a lineup between two columns), three columns stand in the room; narrower,
// the phone's scene.
const DESKTOP = "(min-width: 1280px)";
const onDesktopChange = (listener: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
// Where the columns' first rows sit: under the header (and on a phone the league switcher), and a gap.
const UNDER_HEADER = "var(--header-h, 0px) + 0.625rem";
const UNDER_SWITCHER = "var(--header-h, 0px) + var(--ticker-h, 0px) + 0.25rem";
// The line on the floor the columns stand on, up from the room's bottom: the home page's starters list's.
const FOOT = "3.25rem";

/**
 * The league page in the room (for now beside the old one, see /league): your leagues, the lineups and the league's
 * matchups standing on the floor. From laptop width up, three columns facing you square on, their feet on one line
 * across the floor, reflected in it — your leagues on the left, picking the one shown; its matchups on the right,
 * picking the one whose lineups are in the middle (yours, until another's picked). On a phone, the league along the
 * top, where the home page's ticker runs (swiped to another, or tapped for the list), and its matchups' lineups
 * under it at the back of the room, above the horizon, where the home page's starters list is.
 */
function LeagueRoomContent() {
  const { config, loaded } = useConfig();
  const desktop = useSyncExternalStore(onDesktopChange, () => window.matchMedia(DESKTOP).matches, () => false);
  // The room fits the screen: the page itself never scrolls (only its columns do).
  useEffect(() => {
    const [html, body] = [document.documentElement.style, document.body.style];
    const was = [html.overflow, html.overscrollBehavior, body.overflow, body.overscrollBehavior];
    html.overflow = body.overflow = "hidden";
    html.overscrollBehavior = body.overscrollBehavior = "none";
    window.scrollTo(0, 0);
    return () => {
      [html.overflow, html.overscrollBehavior, body.overflow, body.overscrollBehavior] = was;
    };
  }, []);

  const [summaries, setSummaries] = useState<LeagueSummary[] | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The week shown: the current one, unless another's been picked from the header's "Week N".
  const [viewWeek, setViewWeek] = useState<number | null>(null);
  const shownWeek = viewWeek ?? week;
  useEffect(() => {
    setHeaderWeek(
      week != null && shownWeek != null
        ? { week: shownWeek, currentWeek: week, lastWeek: NFL_WEEKS, regularSeasonWeeks: null, onChange: setViewWeek }
        : null
    );
  }, [week, shownWeek]);
  useEffect(() => () => setHeaderWeek(null), []);

  // Leagues hidden in Settings stay out, as on the home page.
  const ids = visibleLeagues(config.leagues)
    .map((l) => l.leagueId)
    .join(",");
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const currentWeek = await getCurrentWeek();
        const loadedSummaries = await Promise.all((ids ? ids.split(",") : []).map((id) => getLeagueSummary(id, currentWeek)));
        if (cancelled) return;
        setWeek(currentWeek);
        setSummaries(loadedSummaries.filter((s): s is LeagueSummary => s !== null));
      } catch {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, ids]);

  // Standings counting the week being played, when "as it stands" is on — as on the home page.
  const asItStands = useAsItStands();
  const shownSummaries = useSummariesAsItStands(summaries);
  const pendingByLeague = usePendingMatchups(summaries);
  const targets = useMemo(
    () =>
      (summaries ?? []).flatMap((s) => {
        const me = s.standings.find((r) => r.ownerId === config.sleeperUserId);
        return me ? [{ leagueId: s.league.league_id, myRosterId: me.rosterId }] : [];
      }),
    [summaries, config.sleeperUserId]
  );
  const matchups = useDashboardMatchups(targets, shownWeek);
  // Each league as the ticker shows it: your matchup this week and the standings around it.
  const leagues = useMemo<TickerLeague[]>(
    () =>
      (summaries ?? []).map((official, i) => {
        const summary = shownSummaries?.[i] ?? official;
        const leagueId = official.league.league_id;
        const myRow = summary.standings.find((r) => r.ownerId === config.sleeperUserId);
        const matchup = matchups[leagueId];
        const standings = teamStandings(summary);
        const standingOf = (rosterId: number) => standings.get(rosterId) ?? {};
        return {
          leagueId,
          name: official.league.name,
          logo: avatarUrl(official.league.avatar, "full"),
          matchup,
          my: myRow ? standingOf(myRow.rosterId) : null,
          opponent: matchup?.opponent ? standingOf(matchup.opponent.rosterId) : undefined,
          leagueSize: summary.standings.length,
          // The winner once the week's official — or, with "as it stands" on, whoever's ahead now.
          winner:
            matchup?.opponent && matchup.my.points !== matchup.opponent.points && (asItStands || (shownWeek != null && shownWeek <= lastFinishedWeek(official.league)))
              ? matchup.my.points > matchup.opponent.points
                ? "my"
                : "opponent"
              : null,
        };
      }),
    [summaries, shownSummaries, matchups, config.sleeperUserId, asItStands, shownWeek]
  );

  // The league shown: the one in the address (?id=), else your first.
  const asked = useSearchParams().get("id");
  const index = Math.max(0, (summaries ?? []).findIndex((s) => s.league.league_id === asked));
  const official = summaries?.[index] ?? null;
  const summary = shownSummaries?.[index] ?? official;
  const leagueId = official?.league.league_id ?? null;
  const pickLeague = (id: string) => window.history.replaceState(null, "", `?id=${id}`);

  const standings = useMemo(() => (summary ? teamStandings(summary) : new Map()), [summary]);
  // Who owns each roster, for the all-time head-to-head beside each matchup's PF/PA.
  const owners = useMemo(
    () => new Map((official?.rosters ?? []).filter((r) => r.owner_id).map((r) => [r.roster_id, r.owner_id as string])),
    [official]
  );
  const myRosterId = official?.standings.find((r) => r.ownerId === config.sleeperUserId)?.rosterId ?? null;
  const carousel = useLeagueMatchupCarousel(leagueId, shownWeek);
  const season = official?.league.season ?? null;
  const scoring = official?.league.scoring_settings;
  const { projected, lineTones, lineNotes } = useLineupDetails(carousel, season, shownWeek, scoring);
  const allTime = useMatchupHeadToHead(leagueId ?? "", leagueId ? pendingByLeague?.get(leagueId) : null, owners);
  // The matchup whose lineups are in the middle (from laptop width up): yours, until another's picked — in that league, that week.
  const [picked, setPicked] = useState<{ leagueId: string | null; week: number | null; id: number } | null>(null);
  const games = carousel?.games ?? [];
  const chosen = picked && picked.leagueId === leagueId && picked.week === shownWeek ? games.find((g) => g.matchupId === picked.id) : undefined;
  const shownGame = chosen ?? games.find((g) => g.teams.some((t) => t.rosterId === myRosterId)) ?? games[0];

  // The room's height as it's drawn (not 100vh, which a browser's toolbars can make taller than the screen).
  const [room, setRoom] = useState<HTMLDivElement | null>(null);
  const [roomHeight, setRoomHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!room) return;
    const measure = () => setRoomHeight(room.clientHeight || window.innerHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    return () => observer.disconnect();
  }, [room]);

  // The columns, scrolled by the page itself so their reflections keep up with them (see useDragScroll).
  const [leagueColumn, setLeagueColumn] = useState<HTMLDivElement | null>(null);
  const [lineupColumn, setLineupColumn] = useState<HTMLDivElement | null>(null);
  const [matchupColumn, setMatchupColumn] = useState<HTMLDivElement | null>(null);
  useDragScroll(leagueColumn);
  useDragScroll(lineupColumn);
  useDragScroll(matchupColumn);
  // Another league's (or week's) lineups start from their top.
  useEffect(() => {
    lineupColumn?.scrollTo({ top: 0 });
    matchupColumn?.scrollTo({ top: 0 });
  }, [leagueId, shownWeek, lineupColumn, matchupColumn]);

  if (!loaded || summaries === null) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">{error ?? "Loading your leagues…"}</Card>;
  }
  if (summaries.length === 0 || !official || !leagueId) {
    return (
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <h1 className="text-xl font-semibold text-ink-primary">No leagues tracked yet</h1>
        <p className="max-w-md text-sm text-ink-secondary">Connect your Sleeper username to pull in every league you play in this season.</p>
        <Link href="/settings" className="mt-2 bg-series-1 px-4 py-2 text-sm font-medium text-white transition-transform hover:opacity-90 active:scale-95">
          Go to Settings
        </Link>
      </Card>
    );
  }

  const horizon = HORIZON_SHARE;
  const roomView = (
    <div ref={setRoom} aria-hidden className="grid-room" style={{ ["--horizon" as string]: `${horizon * 100}%` }}>
      <FloorGrid share={horizon} />
    </div>
  );
  const roomVars = roomHeight ? { ["--room-h" as string]: `${roomHeight}px` } : undefined;
  const loading = <p className="text-sm text-ink-secondary">Loading lineups…</p>;
  const providers = (children: React.ReactNode) => (
    <MatchupProviders
      projected={projected}
      lineTones={lineTones}
      lineNotes={lineNotes}
      dynasty={carousel?.dynasty}
      positions={carousel?.positions}
      season={season}
      scoring={scoring}
    >
      {children}
    </MatchupProviders>
  );

  if (!desktop) {
    // A phone: one scene that doesn't scroll, standing in the room — the league along its top, and under it, at the
    // back of the room above the horizon, every matchup's lineups (yours open), scrolling as one list up under the
    // see-through switcher and header and coming up from behind the horizon, reflected in the floor there.
    const lineups = !carousel ? (
      loading
    ) : games.length === 0 ? (
      <p className="text-sm text-ink-secondary">No matchups this week.</p>
    ) : (
      providers(
        <MatchupStack
          // Fresh for each league and week, so it opens on your matchup.
          key={`${leagueId}-${shownWeek}`}
          leagueId={leagueId}
          games={games}
          myRosterId={myRosterId}
          standings={standings}
          owners={owners}
          allTime={allTime}
        />
      )
    );
    return (
      <div style={roomVars}>
        <h1 className="sr-only">{official.league.name}</h1>
        {roomView}
        <div className="fixed inset-0 touch-none">
          <div className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: `calc(var(--room-h, 100svh) * ${horizon})` }}>
            <div
              ref={setLineupColumn}
              data-drag-scroll
              className="h-full touch-none overflow-y-auto overscroll-none px-4 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ paddingTop: `calc(${UNDER_SWITCHER})` }}
            >
              {/* Moved down (or up) as far as it's pulled past an end. */}
              <div className="translate-y-[var(--overscroll,0px)] pt-2">{lineups}</div>
            </div>
            <ScrollThumb source={lineupColumn} />
          </div>
        </div>
        {/* Reflected in the floor from the horizon, as it scrolls. */}
        <FloorReflection source={lineupColumn} className="px-4 pb-8" style={{ paddingTop: `calc(${UNDER_SWITCHER})` }} />
        <LeagueSwitcher leagues={leagues} selectedId={leagueId} onSelect={pickLeague} />
      </div>
    );
  }

  // From laptop width up: three columns with no backgrounds of their own, standing upright on one line across the floor
  // and reflected in it — each scrolling on its own, up behind the see-through header.
  const column = "absolute inset-x-0 bottom-0 top-0 touch-none overflow-y-auto overscroll-none pb-16 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  const columnPad = { paddingTop: `calc(${UNDER_HEADER})` };
  return (
    <div style={roomVars}>
      <h1 className="sr-only">{official.league.name}</h1>
      {roomView}
      <div className="fixed inset-x-0 top-0 flex gap-4 px-4" style={{ height: `calc(var(--room-h, 100vh) - ${FOOT})` }}>
        {/* Your leagues, picking the one shown. */}
        <div className="relative w-64 shrink-0 2xl:w-72">
          <div ref={setLeagueColumn} data-drag-scroll className={column} style={columnPad}>
            <ul className="flex translate-y-[var(--overscroll,0px)] flex-col gap-2" aria-label="Your leagues">
              {leagues.map((league, i) => {
                const on = league.leagueId === leagueId;
                return (
                  <li key={league.leagueId}>
                    <button
                      type="button"
                      aria-current={on || undefined}
                      onClick={() => pickLeague(league.leagueId)}
                      className={`w-full border px-3 py-2 text-left transition-colors ${
                        on ? "border-ink-primary bg-[color-mix(in_srgb,var(--map-tag)_7%,transparent)]" : "border-border hover:border-ink-primary/40"
                      }`}
                    >
                      <LeagueLines league={league} position={i + 1} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <ScrollThumb source={leagueColumn} />
        </div>

        {/* The picked matchup's lineups, slot by slot. */}
        <div className="relative min-w-0 flex-1">
          <div ref={setLineupColumn} data-drag-scroll className={column} style={columnPad}>
            <div className="mx-auto max-w-3xl translate-y-[var(--overscroll,0px)]">
              {!carousel ? (
                loading
              ) : !shownGame ? (
                <p className="text-sm text-ink-secondary">No matchups this week.</p>
              ) : (
                providers(<MatchupSlide leagueId={leagueId} game={shownGame} myRosterId={myRosterId} standings={standings} owners={owners} allTime={allTime} />)
              )}
            </div>
          </div>
          <ScrollThumb source={lineupColumn} />
        </div>

        {/* The league's matchups, picking the one whose lineups are in the middle. */}
        <div className="relative w-64 shrink-0 2xl:w-72">
          <div ref={setMatchupColumn} data-drag-scroll className={column} style={columnPad}>
            <div className="translate-y-[var(--overscroll,0px)]">
              {shownGame ? (
                <MatchupList
                  games={games}
                  myRosterId={myRosterId}
                  standings={standings}
                  pickedId={shownGame.matchupId}
                  onPick={(id) => setPicked({ leagueId, week: shownWeek, id })}
                />
              ) : null}
            </div>
          </div>
          <ScrollThumb source={matchupColumn} />
        </div>
      </div>
      {/* Each column's reflection: what's at its foot, in the floor. */}
      <FloorReflection source={leagueColumn} className="pb-16" style={columnPad} />
      <FloorReflection source={lineupColumn} className="pb-16" style={columnPad} />
      <FloorReflection source={matchupColumn} className="pb-16" style={columnPad} />
    </div>
  );
}

export default function LeagueRoomPage() {
  return (
    <Suspense fallback={<Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>}>
      <LeagueRoomContent />
    </Suspense>
  );
}
