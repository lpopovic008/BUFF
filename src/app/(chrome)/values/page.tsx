"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SearchIcon, CrownIcon, CalendarIcon, SuperflexIcon, OneQBIcon, PlusCircleIcon, DotIcon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { HeaderLeagueSwitcher, RoomLeagueList } from "@/components/LeagueSwitcher";
import { AssetRow } from "@/components/AssetRow";
import { useConfig } from "@/hooks/useConfig";
import { useMyLeagues } from "@/hooks/useMyLeagues";
import { usePlayerMarks } from "@/hooks/usePlayerMarks";
import { useTradeMonitor } from "@/hooks/useTradeMonitor";
import { PlayerMark, visibleLeagues } from "@/lib/localStore";
import rawSnapshot from "@/data/player-values.json";
import { LeagueFormat, PlayerValue, PlayerValuesSnapshot, TEPremium, valueFor, valueGrade } from "@/lib/player-values";
import { PlayerCard, teamOf } from "@/components/PlayerCard";
import { loadPlayerIdIndex } from "@/lib/players";
import { normalizeName } from "@/lib/name-match";
import { RoomCard, RoomColumn, WallRoom, useWideRoom } from "@/components/WallRoom";
import { getNFLState } from "@/lib/sleeper";
import { formatStat, loadSeasonStats, offeredMetrics, passesStatFilter, SeasonStats, StatFilter, StatMetric } from "@/lib/season-stats";
import { MonitorPlayer, Reason } from "@/lib/trade-monitor";

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

/** How many cards are drawn at most. */
const MOST_CARDS = 300;

/** The players as Madden cards, as many to a row as their column fits. */
function ValueCards({
  rows,
  idOf,
  onOpen,
  statOf,
  marks,
}: {
  rows: Row[];
  idOf: (player: PlayerValue) => string | null;
  onOpen: (row: Row, playerId: string) => void;
  /** The stat being looked at, for each — shown on his card. */
  statOf: (playerId: string | null) => string | null;
  marks: Record<string, PlayerMark>;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-secondary">No players match.</p>;
  }
  return (
    <div className="@container">
      <ul className="grid grid-cols-3 gap-x-2 gap-y-3 @lg:grid-cols-4 @2xl:grid-cols-5 @4xl:grid-cols-6">
        {rows.map((row) => {
          const { player, grade, rank } = row;
          const playerId = idOf(player);
          return (
            <PlayerCard
              key={`${player.position}-${player.name}`}
              player={player}
              grade={grade}
              rank={rank}
              playerId={playerId}
              onOpen={playerId ? () => onOpen(row, playerId) : undefined}
              stat={statOf(playerId)}
              mark={playerId ? (marks[playerId] ?? null) : null}
            />
          );
        })}
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


const FIELD = "min-w-0 border-b border-border bg-transparent py-1 text-xs text-ink-primary outline-none focus:border-ink-primary";

/**
 * Finding players by their season so far: what to sort them by (their value, or any stat), and any number of filters
 * on stats — each a stat, at least or at most, and a number — offered grouped (fantasy, usage, rushing, receiving,
 * passing). Only the stats there's anything for are offered.
 */
function StatFilters({
  metrics,
  stats,
  sortBy,
  onSort,
  filters,
  onFilters,
}: {
  metrics: StatMetric[];
  stats: SeasonStats | null | undefined;
  sortBy: string | null;
  onSort: (id: string | null) => void;
  filters: StatFilter[];
  onFilters: (next: StatFilter[]) => void;
}) {
  const groups = [...new Set(metrics.map((m) => m.group))];
  const options = groups.map((g) => (
    <optgroup key={g} label={g}>
      {metrics
        .filter((m) => m.group === g)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
    </optgroup>
  ));
  const change = (i: number, next: Partial<StatFilter>) => onFilters(filters.map((f, k) => (k === i ? { ...f, ...next } : f)));
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Stats" aside={stats?.throughWeek ? `${stats.season} · through week ${stats.throughWeek}` : null} />
      {stats === undefined ? (
        <p className="text-xs text-ink-muted">Loading stats…</p>
      ) : stats === null || metrics.length === 0 ? (
        <p className="text-xs text-ink-muted">This season&rsquo;s stats come in with the next stats update.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
            Sort by
            <select value={sortBy ?? ""} onChange={(e) => onSort(e.target.value || null)} className={`${FIELD} flex-1 font-bold text-ink-primary`}>
              <option value="">Value</option>
              {options}
            </select>
          </label>
          {filters.map((f, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_3.5rem_auto] items-center gap-1.5">
              <select value={f.metric} onChange={(e) => change(i, { metric: e.target.value })} aria-label="Stat" className={`${FIELD} font-bold`}>
                {options}
              </select>
              <button
                type="button"
                onClick={() => change(i, { at: f.at === "least" ? "most" : "least" })}
                aria-label={f.at === "least" ? "At least" : "At most"}
                title={f.at === "least" ? "At least — tap for at most" : "At most — tap for at least"}
                className="w-6 text-center text-sm font-bold text-ink-primary"
              >
                {f.at === "least" ? "≥" : "≤"}
              </button>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={f.value ?? ""}
                onChange={(e) => change(i, { value: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="Any"
                aria-label="Value"
                className={`${FIELD} text-right tabular-nums`}
              />
              <button type="button" onClick={() => onFilters(filters.filter((_, k) => k !== i))} aria-label="Take this filter off" className="w-4 text-sm text-ink-muted hover:text-ink-primary">
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onFilters([...filters, { metric: sortBy ?? metrics[0].id, at: "least", value: null }])}
              className="text-xs font-bold uppercase tracking-wide text-ink-secondary hover:text-ink-primary"
            >
              + Add a stat filter
            </button>
            {filters.length > 0 || sortBy ? (
              <button
                type="button"
                onClick={() => {
                  onFilters([]);
                  onSort(null);
                }}
                className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted hover:text-ink-primary"
              >
                Clear
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

/** How many players each of a league's lists shows at most. */
const MOST_ASSETS = 15;

/**
 * Who to think about buying and selling in one of your leagues: to buy, the players you've marked to (on other teams
 * there), then its young stars and breakout candidates; to sell, the players on your team you've marked to, then
 * those aging out, falling in value or losing their role (see trade-monitor.ts) — each list through the filters
 * (`passes`), in order of the stat being looked at, where there's one.
 */
function LeagueAssets({
  leagueId,
  userId,
  passes,
  sortOf,
  statOf,
  onOpen,
}: {
  leagueId: string;
  userId: string | null;
  passes: (p: MonitorPlayer) => boolean;
  /** The stat being sorted by, for each — null with none. */
  sortOf: ((playerId: string) => number | null) | null;
  statOf: (playerId: string) => string | null;
  onOpen: (p: MonitorPlayer, numbers: { valueRank: number | null; dynasty: boolean }, season: number, scoring?: Record<string, number>) => void;
}) {
  const monitor = useTradeMonitor(leagueId, userId);
  const marks = usePlayerMarks();
  if (monitor === undefined) return <p className="py-6 text-center text-sm text-ink-secondary">Reading the league…</p>;
  if (monitor === null) return <p className="py-6 text-center text-sm text-ink-secondary">Couldn&rsquo;t load this league from Sleeper.</p>;
  const mine = monitor.teams.find((t) => t.mine);
  const ownerOf = new Map(monitor.teams.flatMap((t) => t.players.map((id) => [id, t] as const)));
  const standingOf = new Map(monitor.picture.map((s) => [s.rosterId, s]));
  const marked: Reason = { text: "You marked him", weight: 0 };
  type Listed = { player: MonitorPlayer; reasons: Reason[]; rosterId: number | null };
  const list = (entries: Listed[]) => {
    const seen = new Set<string>();
    const out = entries.filter((e) => (seen.has(e.player.id) ? false : (seen.add(e.player.id), passes(e.player))));
    if (sortOf) out.sort((a, b) => (sortOf(b.player.id) ?? -Infinity) - (sortOf(a.player.id) ?? -Infinity));
    return out.slice(0, MOST_ASSETS);
  };
  const markedFor = (mark: PlayerMark, onMine: boolean): Listed[] =>
    Object.entries(marks).flatMap(([id, m]) => {
      const player = monitor.players.get(id);
      const owner = ownerOf.get(id);
      if (m !== mark || !player || !owner || owner.mine !== onMine) return [];
      return [{ player, reasons: [marked], rosterId: owner.rosterId }];
    });
  const buy = list([
    ...markedFor("buy", false),
    ...monitor.stars.map((t) => ({ player: t.player, reasons: t.reasons, rosterId: t.rosterId })),
    ...monitor.breakouts.map((t) => ({ player: t.player, reasons: t.reasons, rosterId: t.rosterId })),
  ]);
  const sell = list([...markedFor("sell", true), ...monitor.sell.map((c) => ({ player: c.player, reasons: c.reasons, rosterId: mine?.rosterId ?? null }))]);
  const open = (p: MonitorPlayer) => onOpen(p, { valueRank: p.valueRank, dynasty: monitor.dynasty }, Number(monitor.season), monitor.scoring);
  const rows = (entries: Listed[], owners: boolean) => (
    <ul>
      {entries.map((e) => {
        const team = e.rosterId != null ? monitor.teams.find((t) => t.rosterId === e.rosterId) : undefined;
        return (
          <AssetRow
            key={e.player.id}
            player={e.player}
            reasons={e.reasons}
            onOpen={open}
            owner={owners && team ? { name: team.name, standing: standingOf.get(team.rosterId) } : undefined}
            stat={statOf(e.player.id)}
          />
        );
      })}
    </ul>
  );
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col">
        <SectionTitle title="Buy" aside={`On other teams in ${monitor.leagueName}`} />
        {buy.length > 0 ? rows(buy, true) : <p className="py-4 text-center text-sm text-ink-secondary">Nobody to go after here right now — mark players you&rsquo;re interested in from their cards.</p>}
      </section>
      <section className="flex flex-col">
        <SectionTitle title="Sell" aside={monitor.dynasty ? "Your team" : "Your team · redraft"} />
        {sell.length > 0 ? rows(sell, false) : <p className="py-4 text-center text-sm text-ink-secondary">Nobody on your team to move right now — mark players you&rsquo;re looking to get rid of from their cards.</p>}
      </section>
    </div>
  );
}

/**
 * The values, in a room as the League Room is: the page itself never scrolls; its columns stand on the back wall,
 * each scrolling on its own and reflected in the floor in front of them. From laptop width up: All players and each
 * of your leagues on the left, as the League Room lists its leagues; in the middle, every player's card — or, for one
 * of your leagues, who to think about buying and selling there (see LeagueAssets); and on the right, what they're
 * filtered by — the search, the scoring, the positions, and any stats. On a phone, one column: the filters (folded
 * away till they're wanted) over the cards; All players and the leagues in the page header.
 */
export default function ValuesPage() {
  const { config } = useConfig();
  const desktop = useWideRoom();
  const [listType, setListType] = useState<ListType>("dynasty");
  const [leagueFormat, setLeagueFormat] = useState<LeagueFormat>("superflex");
  const [tep, setTep] = useState<TEPremium>("standard");
  const [deselectedPositions, setDeselectedPositions] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [statFilters, setStatFilters] = useState<StatFilter[]>([]);
  // On a phone, the filters folded away till they're wanted.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // All players, or one of your leagues (by league id) — All players to start.
  const [pickedId, setPickedId] = useState<string>(ALL_PLAYERS);
  const marks = usePlayerMarks();

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
  const idOf = (player: PlayerValue) => idIndex.get(`${SLEEPER_POSITION[player.position] ?? player.position}-${normalizeName(player.name)}`) ?? null;

  // Every player's season so far, for the stat filters — fetched once they're on the page.
  const [stats, setStats] = useState<SeasonStats | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void loadSeasonStats().then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const metrics = useMemo(() => (stats ? offeredMetrics(stats) : []), [stats]);
  const metricOf = (id: string) => metrics.find((m) => m.id === id);
  const sortMetric = sortBy ? (metricOf(sortBy) ?? null) : null;
  // The stat each card shows: the one sorted by, else the first one filtered on.
  const shownMetric = sortMetric ?? (statFilters[0] ? (metricOf(statFilters[0].metric) ?? null) : null);
  const totalsOf = (playerId: string | null) => (playerId ? stats?.byPlayer.get(playerId) : undefined);
  const statValue = (metric: StatMetric | null, playerId: string | null) => {
    const t = totalsOf(playerId);
    return metric && t ? metric.of(t) : null;
  };
  const statOf = (playerId: string | null) => {
    const v = statValue(shownMetric, playerId);
    return shownMetric && v !== null ? `${formatStat(shownMetric, v)} ${shownMetric.short}` : null;
  };
  const passesStats = (playerId: string | null) =>
    statFilters.every((f) => {
      const metric = metricOf(f.metric);
      return !metric || passesStatFilter(f, metric, totalsOf(playerId));
    });
  const statsOn = statFilters.length > 0 || sortMetric !== null;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const listed = fullList
      .filter((p) => !deselectedPositions.has(p.position))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .filter((p) => passesStats(idOf(p)))
      // Ranked by the grade's decimals too, so players tied on the whole grade keep KTC's order.
      .map((player) => ({ player, grade: valueGrade(valueFor(player, leagueFormat, tep)) }))
      .sort((a, b) => b.grade - a.grade)
      .map((row, i) => ({ ...row, rank: i + 1 }));
    // Sorted by a stat: most first, those without any of it last.
    if (sortMetric) listed.sort((a, b) => (statValue(sortMetric, idOf(b.player)) ?? -Infinity) - (statValue(sortMetric, idOf(a.player)) ?? -Infinity));
    return listed;
    // (The stat helpers are the filters' and stats': listed below.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullList, deselectedPositions, query, leagueFormat, tep, idIndex, stats, statFilters, sortBy]);

  // Each player's rank at his position by value, as the cards are valued (for his player card).
  const positionRanks = useMemo(() => {
    const ranks = new Map<PlayerValue, number>();
    const counts = new Map<string, number>();
    [...fullList]
      .sort((a, b) => valueFor(b, leagueFormat, tep) - valueFor(a, leagueFormat, tep))
      .forEach((p) => {
        const n = (counts.get(p.position) ?? 0) + 1;
        counts.set(p.position, n);
        ranks.set(p, n);
      });
    return ranks;
  }, [fullList, leagueFormat, tep]);

  // The NFL's season now, which a player's card counts his career through.
  const [season, setSeason] = useState(() => new Date().getFullYear());
  useEffect(() => {
    let cancelled = false;
    void getNFLState().then((state) => {
      const year = Number(state?.season);
      if (!cancelled && year) setSeason(year);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // The player whose card is up (see WallRoom's card), as the League Room's.
  const [card, setCard] = useState<RoomCard | null>(null);
  const openCard = (row: Row, playerId: string) => {
    const p = row.player;
    const position = SLEEPER_POSITION[p.position] ?? p.position;
    setCard({
      player: { playerId, name: p.name, position, team: teamOf(p) },
      numbers: { valueRank: positionRanks.get(p) ?? null, dynasty: listType === "dynasty", seasonRank: null, ppg: null, opponent: null, bye: false, defenseRank: null },
      season,
      // Opened on his value over time, in the values shown.
      startOn: "value",
      valueFormat: leagueFormat === "oneQB" ? "oneQB" : "superflex",
    });
  };
  const openAsset = (p: MonitorPlayer, numbers: { valueRank: number | null; dynasty: boolean }, leagueSeason: number, scoring?: Record<string, number>) =>
    setCard({
      player: { playerId: p.id, name: p.name, position: p.position, team: p.team },
      numbers: { ...numbers, seasonRank: null, ppg: null, opponent: null, bye: false, defenseRank: null },
      season: leagueSeason || season,
      scoring,
    });

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

  // All players and each of your leagues, to pick from.
  const roomLeagues = [{ leagueId: ALL_PLAYERS, name: "All players", logo: null }, ...(myLeagues ?? []).map((l) => ({ leagueId: l.leagueId, name: l.leagueName, logo: l.logo }))];
  const leagues = <RoomLeagueList leagues={roomLeagues} selectedId={picked?.leagueId ?? ALL_PLAYERS} onSelect={setPickedId} label="All players and each of your leagues" />;

  // What the players are filtered by: the search, each pair of toggles under the name of what it sets (for every
  // player's card: a league's lists are in its own values), the positions, and the stats.
  const filters = (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a player…"
          aria-label="Search a player"
          className="w-full border-b border-border bg-transparent py-1.5 pl-6 pr-1 text-sm text-ink-primary outline-none transition-colors focus:border-ink-primary"
        />
      </div>
      {picked ? null : (
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
      )}
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
      <StatFilters metrics={metrics} stats={stats} sortBy={sortBy} onSort={setSortBy} filters={statFilters} onFilters={setStatFilters} />
    </div>
  );

  // A league's players through the same filters: the positions, the search and the stats.
  const passesAsset = (p: MonitorPlayer) => {
    const q = query.trim().toLowerCase();
    return !deselectedPositions.has(p.position) && (!q || p.name.toLowerCase().includes(q)) && passesStats(p.id);
  };
  // Every player's card (under what they're valued as, and how many), or who to buy and sell in a league.
  const main = picked ? (
    <LeagueAssets
      key={picked.leagueId}
      leagueId={picked.leagueId}
      userId={config.sleeperUserId}
      passes={passesAsset}
      sortOf={sortMetric ? (id) => statValue(sortMetric, id) : null}
      statOf={statOf}
      onOpen={openAsset}
    />
  ) : !hasData ? (
    <Card className="p-8 text-center text-sm text-ink-secondary">Values haven&rsquo;t been fetched yet.</Card>
  ) : (
    <div className="flex flex-col gap-2">
      <SectionTitle title={sortMetric ? `${valuesLabel} · by ${sortMetric.label.toLowerCase()}` : valuesLabel} aside={<span className="tabular-nums">{rows.length}</span>} />
      <ValueCards rows={rows.slice(0, MOST_CARDS)} idOf={idOf} onOpen={openCard} statOf={statsOn ? statOf : () => null} marks={marks} />
      {rows.length > MOST_CARDS ? <p className="mt-1 text-xs text-ink-muted">Top {MOST_CARDS} of {rows.length}</p> : null}
    </div>
  );
  const filtering = deselectedPositions.size + statFilters.length + (query.trim() ? 1 : 0) + (sortMetric ? 1 : 0);

  return (
    <>
      <WallRoom title="Values" card={card} onCloseCard={() => setCard(null)}>
        {desktop ? (
          // Three columns, as the League Room's: the leagues, the players, and what they're filtered by.
          <>
            <RoomColumn label="All players and your leagues" style={{ flex: "1 1 0%" }}>
              {leagues}
            </RoomColumn>
            <RoomColumn label={picked ? `${picked.leagueName}: who to buy and sell` : "Players"} style={{ flex: "1.6 1 0%" }} stage>
              {main}
            </RoomColumn>
            <RoomColumn label="What the players are filtered by" style={{ flex: "1 1 0%" }}>
              {filters}
            </RoomColumn>
          </>
        ) : (
          <RoomColumn label="Values" className="flex-1" stage>
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
                className="flex items-baseline justify-between border-b border-ink-primary/60 pb-1 text-xs font-bold uppercase tracking-wide text-ink-primary"
              >
                <span>Filters{filtering > 0 ? ` · ${filtering} on` : ""}</span>
                <span className="text-ink-muted">{filtersOpen ? "Hide" : "Show"}</span>
              </button>
              {filtersOpen ? filters : null}
              {main}
            </div>
          </RoomColumn>
        )}
      </WallRoom>
      {/* On a phone, All players and each of your leagues switched in the page header, as the League Room's leagues are. */}
      {desktop ? null : <HeaderLeagueSwitcher leagues={roomLeagues} selectedId={picked?.leagueId ?? ALL_PLAYERS} onSelect={setPickedId} />}
    </>
  );
}
