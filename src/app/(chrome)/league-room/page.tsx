"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { HORIZON_SHARE } from "@/lib/grid-room";
import { FloorGrid } from "@/components/FloorGrid";
import { FloorReflection } from "@/components/FloorReflection";
import { ScrollThumb } from "@/components/ScrollThumb";
import { useSwipePager } from "@/hooks/useSwipePager";
import { useListScroll } from "@/hooks/useListScroll";
import { LeagueSwitcher, LeagueTitle, RoomLeague } from "@/components/LeagueSwitcher";
import { Bench, MatchupList, MatchupProviders, MatchupSlide, MatchupStack, useMatchupHeadToHead } from "@/components/LeagueMatchupCarousel";
import { FLOOR_ACTIONS, FloorAction, FloorButtons, FrontPanel } from "@/components/LeagueRoomFloor";
import { MatchupGraph, MatchupSide } from "@/components/MatchupGraph";
import { MoneyBoard } from "@/components/MoneyBoard";
import type { ResolvedMatchupGame } from "@/hooks/useLeagueMatchupCarousel";
import { useAsItStands } from "@/hooks/useAsItStands";
import { finishedWeeksOnly, loadLeagueSeason, LeagueSeason, startingPlan } from "@/lib/league-money";
import { computePlanLedger, PayoutPlan } from "@/lib/payout-plan";
import { savePayoutPlan } from "@/lib/localStore";
import { weighProjection } from "@/lib/sleeper";
import { useConfig } from "@/hooks/useConfig";
import { PendingMatchups, usePendingMatchups, useSummariesAsItStands } from "@/hooks/useAsItStands";
import { useLeagueMatchupCarousel } from "@/hooks/useLeagueMatchupCarousel";
import { useLineupDetails } from "@/hooks/useLineupDetails";
import { getLeagueSummary, LeagueSummary, teamStandings } from "@/lib/league-data";
import { avatarUrl, getCurrentWeek } from "@/lib/sleeper";
import { setHeaderWeek } from "@/lib/header-week";
import { setHeaderBack, setHeaderBare, useHeaderSlot } from "@/lib/header-slot";
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
// Where the columns' first rows sit: under the header (the league switcher in it, on a phone), and a gap.
const UNDER_HEADER = "var(--header-h, 0px) + 0.625rem";
const UNDER_SWITCHER = "var(--header-h, 0px) + 0.5rem";
// The line on the floor the columns stand on, up from the room's bottom: the home page's starters list's.
const FOOT = "3.25rem";
const FOOT_PX = 52;

/** One league as the room shows it: its official summary, as it stands (see useSummariesAsItStands), and its unfinished weeks' matchups. */
interface RoomLeagueData {
  official: LeagueSummary;
  shown: LeagueSummary;
  pending: PendingMatchups | null;
}

/**
 * A league's lineups for a week, and all that's shown around them: its matchups, each
 * team's standing, owner and all-time head-to-head, each starter's tone and note, and each team's projected total.
 */
function useLeagueRoom(league: RoomLeagueData, week: number | null, userId: string | null | undefined) {
  const { official, shown, pending } = league;
  const leagueId = official.league.league_id;
  const standings = useMemo(() => teamStandings(shown), [shown]);
  // Who owns each roster, for the all-time head-to-head beside each matchup's PF/PA.
  const owners = useMemo(
    () => new Map((official.rosters ?? []).filter((r) => r.owner_id).map((r) => [r.roster_id, r.owner_id as string])),
    [official]
  );
  const myRosterId = official.standings.find((r) => r.ownerId === userId)?.rosterId ?? null;
  const carousel = useLeagueMatchupCarousel(leagueId, week);
  const season = official.league.season ?? null;
  const scoring = official.league.scoring_settings;
  const { weekGames, projectionStats, projected, lineTones, lineNotes } = useLineupDetails(carousel, season, week, scoring);
  const allTime = useMatchupHeadToHead(leagueId, pending, owners);
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
  return { leagueId, standings, owners, myRosterId, carousel, allTime, providers, weekGames, projectionStats, scoring };
}

const loadingLineups = <p className="text-sm text-ink-secondary">Loading lineups…</p>;
const noMatchups = <p className="text-sm text-ink-secondary">No matchups this week.</p>;

/**
 * The league page in the room (for now beside the old one, see /league): your leagues, the lineups and the league's
 * matchups standing on the floor. From laptop width up, three columns facing you square on, their feet on one line
 * across the floor, reflected in it — your leagues on the left, picking the one shown; its matchups on the right,
 * picking the one whose lineups are in the middle (yours, until another's picked). On a phone, the league's name in
 * the header, and its matchups' lineups right under it at the back of the room, above the horizon, where the home page's starters list is — swiped sideways together to the next league (or tapped for the list).
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
  const shownSummaries = useSummariesAsItStands(summaries);
  const pendingByLeague = usePendingMatchups(summaries);
  const rooms = useMemo<RoomLeagueData[]>(
    () =>
      (summaries ?? []).map((official, i) => ({
        official,
        shown: shownSummaries?.[i] ?? official,
        pending: pendingByLeague?.get(official.league.league_id) ?? null,
      })),
    [summaries, shownSummaries, pendingByLeague]
  );
  const leagues = useMemo<RoomLeague[]>(
    () => rooms.map(({ official }) => ({ leagueId: official.league.league_id, name: official.league.name, logo: avatarUrl(official.league.avatar, "full") })),
    [rooms]
  );

  // The league shown: the one in the address (?id=), else your first.
  const asked = useSearchParams().get("id");
  const index = Math.max(0, leagues.findIndex((l) => l.leagueId === asked));
  const pickLeague = (id: string) => window.history.replaceState(null, "", `?id=${id}`);

  // The room's height as it's drawn (not 100vh, which a browser's toolbars can make taller than the screen).
  const [room, setRoom] = useState<HTMLDivElement | null>(null);
  const [roomSize, setRoomSize] = useState<{ width: number; height: number } | null>(null);
  const roomHeight = roomSize?.height ?? null;
  useEffect(() => {
    if (!room) return;
    const measure = () => setRoomSize({ width: room.clientWidth || window.innerWidth, height: room.clientHeight || window.innerHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    return () => observer.disconnect();
  }, [room]);

  if (!loaded || summaries === null) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">{error ?? "Loading your leagues…"}</Card>;
  }
  if (rooms.length === 0) {
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

  const roomVars = roomHeight ? { ["--room-h" as string]: `${roomHeight}px` } : undefined;
  return (
    <div style={roomVars}>
      <h1 className="sr-only">{leagues[index].name}</h1>
      <div ref={setRoom} aria-hidden className="grid-room" style={{ ["--horizon" as string]: `${HORIZON_SHARE * 100}%` }}>
        <FloorGrid share={HORIZON_SHARE} />
      </div>
      {desktop ? (
        <DesktopRoom rooms={rooms} leagues={leagues} index={index} week={shownWeek} currentWeek={week} userId={config.sleeperUserId} onPick={pickLeague} room={roomSize} />
      ) : (
        <PhoneRoom rooms={rooms} leagues={leagues} index={index} week={shownWeek} currentWeek={week} userId={config.sleeperUserId} onPick={pickLeague} room={roomSize} />
      )}
    </div>
  );
}

interface RoomProps {
  rooms: RoomLeagueData[];
  leagues: RoomLeague[];
  index: number;
  week: number | null;
  /** The NFL's week now (the week shown may be another). */
  currentWeek: number | null;
  userId: string | null | undefined;
  onPick: (leagueId: string) => void;
  /** The room's size as it's drawn. */
  room: { width: number; height: number } | null;
}

/** The floor's button that's open (its panel up), closed again by Escape. */
function useFloorAction() {
  const [action, setAction] = useState<FloorAction | null>(null);
  const close = useCallback(() => setAction(null), []);
  useEffect(() => {
    if (!action) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action, close]);
  // Kept while it sinks, so its panel still says what it is.
  const [last, setLast] = useState<FloorAction>("bench");
  const pick = useCallback((next: FloorAction) => {
    setLast(next);
    setAction(next);
  }, []);
  return { action, last, pick, close };
}

/** How far the panels up out of the floor stand from the horizon (px). */
const PANEL_GAP_PX = 8;

/**
 * A phone: one scene that doesn't scroll, standing in the room — the header cleared down to a back button, the
 * league's name (see LeagueSwitcher) and the app's logo, and under it each league's lineups side by side, the one
 * picked on screen. A sideways swipe anywhere slides the
 * names and the lineups along together to the next league (see useSwipePager).
 */
function PhoneRoom({ rooms, leagues, index, week, currentWeek, userId, onPick, room }: RoomProps) {
  const { action, last, pick, close } = useFloorAction();
  // The header's back button closes the floor's panel while one's up.
  useEffect(() => {
    setHeaderBack(action ? close : null);
    return () => setHeaderBack(null);
  }, [action, close]);
  // The tab bar's top: the floor's buttons and panels stop above it.
  const [tabBar, setTabBar] = useState(0);
  useEffect(() => {
    const read = () => setTabBar(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tabbar-h")) || 0);
    read();
    window.addEventListener("resize", read);
    const late = window.setTimeout(read, 500);
    return () => {
      window.removeEventListener("resize", read);
      window.clearTimeout(late);
    };
  }, []);
  const [scene, setScene] = useState<HTMLDivElement | null>(null);
  const [panes, setPanes] = useState<HTMLDivElement | null>(null);
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const [names, setNames] = useState<HTMLDivElement | null>(null);
  // The lineups' reflections, slid along with them.
  const [reflections, setReflections] = useState<HTMLDivElement | null>(null);
  useSwipePager({
    surfaces: [scene, bar],
    tracks: [panes, names],
    follow: reflections,
    count: rooms.length,
    index,
    onPick: (page) => onPick(leagues[page].leagueId),
  });
  // The header taken over: the league's name in its middle.
  useEffect(() => {
    setHeaderBare(true);
    return () => setHeaderBare(false);
  }, []);
  const slot = useHeaderSlot();
  return (
    <>
      <div ref={setScene} className="fixed inset-0 touch-none">
        <div className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: `calc(var(--room-h, 100svh) * ${HORIZON_SHARE})` }}>
          <div ref={setPanes} className="flex h-full will-change-transform">
            {rooms.map((r, i) => (
              <div key={r.official.league.league_id} className="relative h-full w-full shrink-0">
                {/* Only the league on screen and those either side of it, ready to be swiped to. */}
                {Math.abs(i - index) <= 1 ? <LeaguePane league={r} week={week} userId={userId} reflections={reflections} /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div ref={setReflections} className="pointer-events-none fixed inset-0 will-change-transform" />
      {slot
        ? createPortal(<LeagueSwitcher leagues={leagues} selectedId={leagues[index].leagueId} onSelect={onPick} bar={setBar} track={setNames} />, slot)
        : null}
      {/* The floor's buttons at the front of the room, and the panel one brings up there. */}
      {room ? (
        <>
          <FloorButtons width={room.width} height={room.height} bottom={room.height - tabBar} hidden={action !== null} onPick={pick} />
          <FrontPanel
            open={action !== null}
            title={FLOOR_ACTIONS.find((a) => a.id === last)!.label}
            top={room.height * HORIZON_SHARE + PANEL_GAP_PX}
            bottom={room.height - tabBar - PANEL_GAP_PX}
            className="inset-x-2"
          >
            <ActionPanel action={last} league={rooms[index]} week={week} currentWeek={currentWeek} userId={userId} />
          </FrontPanel>
        </>
      ) : null}
    </>
  );
}

/**
 * A league's lineups on a phone: every matchup stacked, yours open (see MatchupStack), scrolling as one list at the
 * back of the room, above the horizon — up under the see-through header and coming up from behind the
 * horizon, reflected in the floor there (into `reflections`).
 */
function LeaguePane({ league, week, userId, reflections }: { league: RoomLeagueData; week: number | null; userId: string | null | undefined; reflections: HTMLElement | null }) {
  const { leagueId, standings, owners, myRosterId, carousel, allTime, providers } = useLeagueRoom(league, week, userId);
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  // Scrolled as an iPhone scrolls, by the page, so its reflection moves with it exactly (see useListScroll).
  useListScroll(column);
  // Another week's lineups start from their top.
  useEffect(() => {
    column?.scrollTo({ top: 0 });
  }, [week, column]);
  const games = carousel?.games ?? [];
  const pad = { paddingTop: `calc(${UNDER_SWITCHER})` };
  return (
    <>
      <div
        ref={setColumn}
        data-scroll-list
        className="h-full touch-none overflow-y-auto overscroll-none px-2 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={pad}
      >
        <div>
          {!carousel
            ? loadingLineups
            : games.length === 0
              ? noMatchups
              : providers(
                  <MatchupStack
                    // Fresh for each week, so it opens on your matchup.
                    key={week ?? 0}
                    leagueId={leagueId}
                    games={games}
                    myRosterId={myRosterId}
                    standings={standings}
                    owners={owners}
                    allTime={allTime}
                    outlined
                  />
                )}
        </div>
      </div>
      <ScrollThumb source={column} />
      {reflections ? createPortal(<FloorReflection source={column} className="px-2 pb-8" style={pad} />, reflections) : null}
    </>
  );
}

/**
 * From laptop width up: three columns with no backgrounds of their own, standing upright on one line across the floor
 * and reflected in it — each scrolling on its own, up behind the see-through header.
 */
function DesktopRoom({ rooms, leagues, index, week, currentWeek, userId, onPick, room }: RoomProps) {
  const { action, last, pick, close } = useFloorAction();
  const { leagueId, standings, owners, myRosterId, carousel, allTime, providers } = useLeagueRoom(rooms[index], week, userId);
  // The matchup whose lineups are in the middle: yours, until another's picked — in that league, that week.
  const [picked, setPicked] = useState<{ leagueId: string; week: number | null; id: number } | null>(null);
  const games = carousel?.games ?? [];
  const chosen = picked && picked.leagueId === leagueId && picked.week === week ? games.find((g) => g.matchupId === picked.id) : undefined;
  const shownGame = chosen ?? games.find((g) => g.teams.some((t) => t.rosterId === myRosterId)) ?? games[0];

  // The columns, each scrolling on its own.
  const [leagueColumn, setLeagueColumn] = useState<HTMLDivElement | null>(null);
  const [lineupColumn, setLineupColumn] = useState<HTMLDivElement | null>(null);
  const [matchupColumn, setMatchupColumn] = useState<HTMLDivElement | null>(null);
  // Each scrolled as an iPhone scrolls, by the page, so its reflection moves with it exactly (see useListScroll).
  useListScroll(leagueColumn);
  useListScroll(lineupColumn);
  useListScroll(matchupColumn);
  // Another league's (or week's) lineups start from their top.
  useEffect(() => {
    lineupColumn?.scrollTo({ top: 0 });
    matchupColumn?.scrollTo({ top: 0 });
  }, [leagueId, week, lineupColumn, matchupColumn]);

  const column = "absolute inset-x-0 bottom-0 top-0 touch-none overflow-y-auto overscroll-none pb-16 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  const columnPad = { paddingTop: `calc(${UNDER_HEADER})` };
  return (
    <>
      <div className="fixed inset-x-0 top-0 flex gap-4 px-4" style={{ height: `calc(var(--room-h, 100vh) - ${FOOT})` }}>
        {/* Your leagues by name, picking the one shown — lit like the header's page tabs. */}
        <div className="relative w-64 shrink-0 2xl:w-72">
          <div ref={setLeagueColumn} data-scroll-list className={column} style={columnPad}>
            <ul className="flex flex-col gap-1" aria-label="Your leagues">
              {leagues.map((league) => {
                const on = league.leagueId === leagueId;
                return (
                  <li key={league.leagueId}>
                    <button
                      type="button"
                      aria-current={on || undefined}
                      onClick={() => onPick(league.leagueId)}
                      className={`w-full px-3 py-2 transition-colors ${
                        on ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "text-ink-secondary hover:text-ink-primary"
                      }`}
                    >
                      <LeagueTitle league={league} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <ScrollThumb source={leagueColumn} />
        </div>

        {/* The picked matchup's lineups, slot by slot — down to the horizon, the floor in front of it left for its
            buttons. */}
        <div className="relative min-w-0 flex-1 self-start" style={{ height: `calc(var(--room-h, 100vh) * ${HORIZON_SHARE})` }}>
          <div ref={setLineupColumn} data-scroll-list className={column} style={columnPad}>
            <div className="mx-auto max-w-3xl">
              {!carousel
                ? loadingLineups
                : !shownGame
                  ? noMatchups
                  : providers(
                      <MatchupSlide leagueId={leagueId} game={shownGame} myRosterId={myRosterId} standings={standings} owners={owners} allTime={allTime} outlined />
                    )}
            </div>
          </div>
          <ScrollThumb source={lineupColumn} />
        </div>

        {/* The league's matchups, picking the one whose lineups are in the middle. */}
        <div className="relative w-64 shrink-0 2xl:w-72">
          <div ref={setMatchupColumn} data-scroll-list className={column} style={columnPad}>
            <div>
              {shownGame ? (
                <MatchupList
                  games={games}
                  myRosterId={myRosterId}
                  standings={standings}
                  pickedId={shownGame.matchupId}
                  onPick={(id) => setPicked({ leagueId, week, id })}
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
      {/* The floor's buttons at the front of the room between the columns, and the panel one brings up there. */}
      {room ? (
        <>
          <FloorButtons width={room.width} height={room.height} bottom={room.height - FOOT_PX} hidden={action !== null} onPick={pick} />
          <FrontPanel
            open={action !== null}
            title={FLOOR_ACTIONS.find((a) => a.id === last)!.label}
            top={room.height * HORIZON_SHARE + PANEL_GAP_PX}
            bottom={room.height - 12}
            className="left-[18rem] right-[18rem] 2xl:left-[19rem] 2xl:right-[19rem]"
            back={close}
          >
            <ActionPanel action={last} league={rooms[index]} week={week} currentWeek={currentWeek} userId={userId} matchupId={shownGame?.matchupId} />
          </FrontPanel>
        </>
      ) : null}
    </>
  );
}

/** A scrolling box in a floor panel, scrolled as the room's lists are (see useListScroll). */
function PanelScroll({ children }: { children: React.ReactNode }) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  useListScroll(box);
  return (
    <div className="relative h-full">
      <div ref={setBox} className="h-full touch-none overflow-y-auto overscroll-none pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div>{children}</div>
      </div>
      <ScrollThumb source={box} />
    </div>
  );
}

/** A matchup's two sides as its score graph draws them: each starter's points so far and projection. */
function graphSides(game: ResolvedMatchupGame, myRosterId: number | null, projectionStats: Record<string, Record<string, number>> | null, scoring: Record<string, number> | undefined) {
  const first = game.teams.find((t) => t.rosterId === myRosterId) ?? game.teams[0];
  const second = game.teams.find((t) => t.rosterId !== first.rosterId) ?? null;
  const side = (t: (typeof game.teams)[number]): MatchupSide => ({
    name: t.teamName,
    points: t.points,
    starters: t.slots.flatMap((slot) => {
      const p = slot.player;
      if (!p) return [];
      const projection = projectionStats?.[p.playerId];
      const projected = projection ? weighProjection(projection, scoring) : undefined;
      return [{ playerId: p.playerId, name: p.name, position: p.position, team: p.team, points: slot.livePoints, projected: typeof projected === "number" ? Math.round(projected * 100) / 100 : null }];
    }),
  });
  return { mine: side(first), theirs: second ? side(second) : null };
}

const panelNote = (text: string) => <p className="text-sm text-ink-secondary">{text}</p>;
const panelLink = (href: string, text: string) => (
  <Link href={href} className="inline-block bg-[var(--map-tag)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--map-tag-ink)] transition-opacity hover:opacity-90">
    {text}
  </Link>
);

/**
 * What a floor button's panel shows, for the league picked and the week shown: your bench; the score graph of your
 * matchup (from laptop width up, the one whose lineups are shown, `matchupId`); the season's payouts; the way to its
 * write-ups and its history; and a spot kept for something else.
 */
function ActionPanel({
  action,
  league,
  week,
  currentWeek,
  userId,
  matchupId,
}: {
  action: FloorAction;
  league: RoomLeagueData;
  week: number | null;
  currentWeek: number | null;
  userId: string | null | undefined;
  matchupId?: number;
}) {
  const leagueId = league.official.league.league_id;
  if (action === "payouts") return <PayoutsPanel leagueId={leagueId} currentWeek={currentWeek} />;
  if (action === "writeups") return panelLink(`/recap?id=${leagueId}`, "Open the write-ups");
  if (action === "history") return panelLink(`/league/history?id=${leagueId}`, "Open the league's history");
  if (action === "more") return panelNote("Something else is coming here.");
  return <MatchupPanel action={action} league={league} week={week} userId={userId} matchupId={matchupId} />;
}

/** Your bench, or a matchup's score graph. */
function MatchupPanel({
  action,
  league,
  week,
  userId,
  matchupId,
}: {
  action: "bench" | "graph";
  league: RoomLeagueData;
  week: number | null;
  userId: string | null | undefined;
  matchupId?: number;
}) {
  const { myRosterId, carousel, providers, weekGames, projectionStats, scoring } = useLeagueRoom(league, week, userId);
  const games = carousel?.games ?? [];
  const game =
    (matchupId !== undefined ? games.find((g) => g.matchupId === matchupId) : undefined) ?? games.find((g) => g.teams.some((t) => t.rosterId === myRosterId)) ?? games[0];
  if (!carousel) return loadingLineups;
  if (!game) return noMatchups;
  if (action === "bench") {
    const mine = game.teams.find((t) => t.rosterId === myRosterId);
    if (!mine) return panelNote("You've no team in this league.");
    if (mine.bench.length === 0) return panelNote("No one's on your bench.");
    return <PanelScroll>{providers(<Bench bench={mine.bench} />)}</PanelScroll>;
  }
  const { mine, theirs } = graphSides(game, myRosterId, projectionStats, scoring);
  return (
    <div className="h-full">
      <MatchupGraph key={`${week}-${game.matchupId}`} mine={mine} theirs={theirs} weekGames={weekGames} scoring={scoring} />
    </div>
  );
}

/** The season's payouts, played against the league's payout setup (as the league page shows them). */
function PayoutsPanel({ leagueId, currentWeek }: { leagueId: string; currentWeek: number | null }) {
  const [money, setMoney] = useState<{ leagueId: string; season: LeagueSeason } | null>(null);
  const [planned, setPlanned] = useState<{ leagueId: string; plan: PayoutPlan } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadLeagueSeason(leagueId)
      .then((m) => {
        if (cancelled || !m) return;
        setMoney({ leagueId, season: m });
        setPlanned({ leagueId, plan: startingPlan(leagueId, m) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leagueId]);
  const asItStands = useAsItStands();
  const season = money?.leagueId === leagueId ? money.season : null;
  const plan = planned?.leagueId === leagueId ? planned.plan : null;
  const shown = useMemo(() => (season && !asItStands ? finishedWeeksOnly(season) : season), [season, asItStands]);
  const ledger = useMemo(() => (shown && plan ? computePlanLedger(plan, shown.results) : null), [shown, plan]);
  if (!shown || !plan || !ledger) return panelNote("Loading payouts…");
  return (
    <PanelScroll>
      <MoneyBoard
        season={shown}
        plan={plan}
        ledger={ledger}
        currentWeek={currentWeek}
        onPlanChange={(next) => {
          setPlanned({ leagueId, plan: next });
          savePayoutPlan(leagueId, next);
        }}
      />
    </PanelScroll>
  );
}

export default function LeagueRoomPage() {
  return (
    <Suspense fallback={<Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>}>
      <LeagueRoomContent />
    </Suspense>
  );
}
