"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Card } from "@/components/ui/Card";
import { SearchIcon, CrownIcon, CalendarIcon, SuperflexIcon, OneQBIcon, PlusCircleIcon, DotIcon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { TradeAnalyzer } from "@/components/TradeAnalyzer";
import { PickButton } from "@/components/ui/PickButton";
import { useConfig } from "@/hooks/useConfig";
import { useMyLeagues } from "@/hooks/useMyLeagues";
import { visibleLeagues } from "@/lib/localStore";
import rawSnapshot from "@/data/player-values.json";
import { LeagueFormat, PlayerValue, PlayerValuesSnapshot, TEPremium, valueFor, valueGrade } from "@/lib/player-values";
import { PlayerCard } from "@/components/PlayerCard";
import { loadPlayerIdIndex } from "@/lib/players";
import { normalizeName } from "@/lib/name-match";
import { formatRecord } from "@/lib/format";
import { FloorGrid } from "@/components/FloorGrid";
import { FloorReflection } from "@/components/FloorReflection";
import { ScrollThumb } from "@/components/ScrollThumb";
import { useListScroll } from "@/hooks/useListScroll";

const snapshot = rawSnapshot as unknown as PlayerValuesSnapshot;

type ListType = "dynasty" | "fantasy";

// QB/RB/WR/TE first (KTC's own order), then whatever else shows up
// (rookie picks in dynasty; kickers/DST in fantasy) alphabetically.
const POSITION_PRIORITY = ["QB", "RB", "WR", "TE"];
function positionSort(a: string, b: string): number {
  const ai = POSITION_PRIORITY.indexOf(a);
  const bi = POSITION_PRIORITY.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  return a.localeCompare(b);
}

interface Row {
  player: PlayerValue;
  /** Its KTC value as a grade, decimals and all (see valueGrade). */
  grade: number;
  rank: number;
}

// KTC's positions as Sleeper names them, for finding a player's photo.
const SLEEPER_POSITION: Record<string, string> = { PK: "K", DST: "DEF" };

// The room (see .grid-room): its horizon low, the back wall most of the screen — the floor in front of it a strip
// for what stands on it to be reflected in.
const VALUES_SHARE = 0.8;
// From laptop width up, three columns stand in the room (as the League Room's do); narrower, one.
const DESKTOP = "(min-width: 1280px)";
const onDesktopChange = (listener: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
// Where the columns' first rows sit: under the header, and a gap; and how far above the horizon they end.
const UNDER_HEADER = "var(--header-h, 0px) + 0.625rem";
const OVER_HORIZON = "0.5rem";
/** How many cards are drawn at most. */
const MOST_CARDS = 300;

/** The players as Madden cards, as many to a row as their column fits. */
function ValueCards({ rows, idIndex }: { rows: Row[]; idIndex: Map<string, string> }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-secondary">No players match.</p>;
  }
  return (
    <div className="@container">
      <ul className="grid grid-cols-3 gap-x-2 gap-y-3 @lg:grid-cols-4 @2xl:grid-cols-5 @4xl:grid-cols-6">
        {rows.map(({ player, grade, rank }) => (
          <PlayerCard
            key={`${player.position}-${player.name}`}
            player={player}
            grade={grade}
            rank={rank}
            playerId={idIndex.get(`${SLEEPER_POSITION[player.position] ?? player.position}-${normalizeName(player.name)}`) ?? null}
          />
        ))}
      </ul>
    </div>
  );
}

const ALL_PLAYERS = "all";

/** A pair of toggles, named. */
function ToggleGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

/** A column standing in the room: on the back wall down to just over the horizon, scrolling on its own, reflected in the floor. */
function RoomColumn({
  label,
  className = "",
  style,
  children,
}: {
  label: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [list, setList] = useState<HTMLDivElement | null>(null);
  // Scrolled as an iPhone scrolls, by the page, so its reflection moves with it exactly (see useListScroll).
  useListScroll(list);
  const pad = { paddingTop: `calc(${UNDER_HEADER})` };
  return (
    <section aria-label={label} className={`relative min-w-0 ${className}`} style={style}>
      <div
        ref={setList}
        data-scroll-list
        className="absolute inset-0 touch-none overflow-y-auto overscroll-none pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={pad}
      >
        <div>{children}</div>
      </div>
      <ScrollThumb source={list} />
      {/* What's at its foot, in the floor. */}
      <FloorReflection source={list} className="pb-2" style={pad} />
    </section>
  );
}

/**
 * The values, in a room as the League Room is: the page itself never scrolls; its columns stand on the back wall,
 * each scrolling on its own and reflected in the floor in front of them. From laptop width up: all players and each
 * of your teams to pick from on the left; the players' cards (or, for one of your teams, its trades) in the middle;
 * and what the cards show — the search, the league, QB and TE scoring, the positions — on the right. Narrower, all of
 * it in one column, in that order.
 */
export default function ValuesPage() {
  const { config } = useConfig();
  const desktop = useSyncExternalStore(onDesktopChange, () => window.matchMedia(DESKTOP).matches, () => false);
  const [listType, setListType] = useState<ListType>("dynasty");
  const [leagueFormat, setLeagueFormat] = useState<LeagueFormat>("superflex");
  const [tep, setTep] = useState<TEPremium>("standard");
  const [deselectedPositions, setDeselectedPositions] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  // All players, or your team in a league (by league id) — All players to start.
  const [pickedId, setPickedId] = useState<string>(ALL_PLAYERS);

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

  const leagueIds = useMemo(() => visibleLeagues(config.leagues).map((l) => l.leagueId), [config.leagues]);
  const myLeagues = useMyLeagues(leagueIds, config.sleeperUserId);

  const fullList = listType === "dynasty" ? snapshot.dynasty : snapshot.fantasy;

  const availablePositions = useMemo(
    () => Array.from(new Set(fullList.map((p) => p.position))).sort(positionSort),
    [fullList]
  );

  // Sleeper's ids for KTC's names, for their photos.
  const [idIndex, setIdIndex] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    void loadPlayerIdIndex().then((idx) => {
      if (!cancelled) setIdIndex(idx);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fullList
      .filter((p) => !deselectedPositions.has(p.position))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      // Ranked by the grade's decimals too, so players tied on the whole grade keep KTC's order.
      .map((player) => ({ player, grade: valueGrade(valueFor(player, leagueFormat, tep)) }))
      .sort((a, b) => b.grade - a.grade)
      .map((row, i) => ({ ...row, rank: i + 1 }));
  }, [fullList, deselectedPositions, query, leagueFormat, tep]);

  const hasData = snapshot.updatedAt !== null;
  const valuesLabel = `${listType === "dynasty" ? "Dynasty" : "Redraft"} · ${leagueFormat === "superflex" ? "Superflex" : "1QB"}${tep === "tep" ? " · TE+" : ""}`;
  const picked = myLeagues?.find((l) => l.leagueId === pickedId) ?? null;
  const togglePosition = (pos: string) =>
    setDeselectedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });

  // All players and each of your teams, to pick from.
  const picks = (
    <ul className="grid grid-cols-2 gap-2 xl:grid-cols-1" aria-label="All players and each of your teams">
      <li>
        <PickButton active={picked === null} onClick={() => setPickedId(ALL_PLAYERS)} title="All players" note={valuesLabel} />
      </li>
      {(myLeagues ?? []).map((l) => (
        <li key={l.leagueId}>
          <PickButton
            active={picked?.leagueId === l.leagueId}
            onClick={() => setPickedId(l.leagueId)}
            title={l.leagueName}
            note={formatRecord(l.wins, l.losses, l.ties)}
          />
        </li>
      ))}
    </ul>
  );

  // What the cards show: the search, each pair of toggles under the name of what it sets, and the positions.
  const filters = (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a player…"
          aria-label="Search a player"
          className="w-full border border-border bg-page/70 py-1.5 pl-8 pr-3 text-sm text-ink-primary outline-none transition-colors focus:border-ink-primary"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ToggleGroup label="League">
          <IconButton icon={<CrownIcon />} label="Dynasty" size="sm" variant={listType === "dynasty" ? "primary" : "default"} onClick={() => setListType("dynasty")} />
          <IconButton icon={<CalendarIcon />} label="Fantasy (redraft)" size="sm" variant={listType === "fantasy" ? "primary" : "default"} onClick={() => setListType("fantasy")} />
        </ToggleGroup>
        <ToggleGroup label="QB">
          <IconButton icon={<SuperflexIcon />} label="Superflex" size="sm" variant={leagueFormat === "superflex" ? "primary" : "default"} onClick={() => setLeagueFormat("superflex")} />
          <IconButton icon={<OneQBIcon />} label="1QB" size="sm" variant={leagueFormat === "oneQB" ? "primary" : "default"} onClick={() => setLeagueFormat("oneQB")} />
        </ToggleGroup>
        <ToggleGroup label="TE">
          <IconButton icon={<DotIcon />} label="Standard scoring" size="sm" variant={tep === "standard" ? "primary" : "default"} onClick={() => setTep("standard")} />
          <IconButton icon={<PlusCircleIcon />} label="TE Premium" size="sm" variant={tep === "tep" ? "primary" : "default"} onClick={() => setTep("tep")} />
        </ToggleGroup>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {availablePositions.map((pos) => {
          const active = !deselectedPositions.has(pos);
          return (
            <button
              key={pos}
              type="button"
              onClick={() => togglePosition(pos)}
              aria-pressed={active}
              className={`border px-3 py-1 text-xs font-medium transition-colors ${
                active ? "border-[var(--map-tag)] bg-[var(--map-tag)] font-bold text-[var(--map-tag-ink)]" : "border-border text-ink-muted line-through hover:bg-page"
              }`}
            >
              {pos}
            </button>
          );
        })}
        {deselectedPositions.size > 0 ? (
          <button
            type="button"
            onClick={() => setDeselectedPositions(new Set())}
            className="px-3 py-1 text-xs font-medium text-ink-muted underline-offset-2 hover:underline"
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );

  // The players' cards (under what they're valued as, and how many), or your team's trades.
  const main = picked ? (
    <TradeAnalyzer key={picked.leagueId} leagueId={picked.leagueId} leagueName={picked.leagueName} sleeperUserId={config.sleeperUserId} />
  ) : !hasData ? (
    <Card className="p-8 text-center text-sm text-ink-secondary">Values haven&rsquo;t been fetched yet.</Card>
  ) : (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between border-b border-ink-primary/60 pb-1 text-xs font-bold uppercase tracking-wide text-ink-primary">
        <span>{valuesLabel}</span>
        <span className="tabular-nums text-ink-muted">{rows.length}</span>
      </div>
      <ValueCards rows={rows.slice(0, MOST_CARDS)} idIndex={idIndex} />
      {rows.length > MOST_CARDS ? <p className="mt-1 text-xs text-ink-muted">Top {MOST_CARDS} of {rows.length}</p> : null}
    </div>
  );

  // Every column down to just over the horizon.
  const columnHeight = { height: `calc(var(--room-h, 100vh) * ${VALUES_SHARE} - ${OVER_HORIZON})` };
  return (
    <div style={roomHeight ? { ["--room-h" as string]: `${roomHeight}px` } : undefined}>
      <h1 className="sr-only">Values</h1>
      <div ref={setRoom} aria-hidden className="grid-room" style={{ ["--horizon" as string]: `${VALUES_SHARE * 100}%` }}>
        <FloorGrid share={VALUES_SHARE} />
      </div>
      {desktop ? (
        // Three columns, the middle one wider (as the League Room's); a team's trades taking the right one too.
        <div className="fixed inset-x-0 top-0 flex gap-4 px-4" style={columnHeight}>
          <RoomColumn label="All players and your teams" style={{ flex: "1 1 0%" }}>
            {picks}
          </RoomColumn>
          <RoomColumn label={picked ? `${picked.leagueName}: trades` : "Players"} style={{ flex: picked ? "2.6 1 0%" : "1.6 1 0%" }}>
            {main}
          </RoomColumn>
          {picked ? null : (
            <RoomColumn label="What the cards show" style={{ flex: "1 1 0%" }}>
              {filters}
            </RoomColumn>
          )}
        </div>
      ) : (
        <div className="fixed inset-x-0 top-0 flex px-4" style={columnHeight}>
          <RoomColumn label="Values" className="flex-1">
            <div className="flex flex-col gap-4">
              {picks}
              {picked ? null : filters}
              {main}
            </div>
          </RoomColumn>
        </div>
      )}
    </div>
  );
}
