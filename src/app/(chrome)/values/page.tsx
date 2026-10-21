"use client";

import { useEffect, useMemo, useState } from "react";
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
import { TitleWithHistory } from "@/components/HistoryButtons";
import { PlateCard } from "@/components/ui/PlateCard";
import { PlayerCard } from "@/components/PlayerCard";
import { loadPlayerIdIndex } from "@/lib/players";
import { normalizeName } from "@/lib/name-match";
import { formatRecord } from "@/lib/format";

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

/** The players as Madden cards, a few to a row. */
function ValueCards({ rows, idIndex }: { rows: Row[]; idIndex: Map<string, string> }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-secondary">No players match.</p>;
  }
  return (
    <ul className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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

export default function ValuesPage() {
  const { config } = useConfig();
  const [listType, setListType] = useState<ListType>("dynasty");
  const [leagueFormat, setLeagueFormat] = useState<LeagueFormat>("superflex");
  const [tep, setTep] = useState<TEPremium>("standard");
  const [deselectedPositions, setDeselectedPositions] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  // All players, or your team in a league (by league id) — All players to start.
  const [pickedId, setPickedId] = useState<string>(ALL_PLAYERS);

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

  return (
    <div className="flex flex-col gap-6 animate-[rise_0.5s_ease-out_backwards]">
      <TitleWithHistory>
        <h1 className="text-2xl font-semibold text-ink-primary">Values</h1>
      </TitleWithHistory>

      {/* The pick on the left (70%), All players and each of your teams listed on the right (30%,
          never narrower than 16rem). On a phone the list comes first, the pick under it. */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,7fr)_minmax(16rem,3fr)]">
        <div className="order-2 min-w-0 md:order-1">
          {picked ? (
            <TradeAnalyzer
              key={picked.leagueId}
              leagueId={picked.leagueId}
              leagueName={picked.leagueName}
              sleeperUserId={config.sleeperUserId}
            />
          ) : !hasData ? (
            <Card className="p-8 text-center text-sm text-ink-secondary">
              Values haven&rsquo;t been fetched yet.
            </Card>
          ) : (
            <PlateCard
              title={valuesLabel}
              aside={<span className="tabular-nums">{rows.length}</span>}
              bodyClassName="p-3 sm:p-5"
            >
              <div className="relative mb-4">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a player…"
                  aria-label="Search a player"
                  className="w-full border border-border bg-page py-1.5 pl-8 pr-3 text-sm text-ink-primary outline-none transition-colors focus:border-ink-primary"
                />
              </div>

              {/* Each pair of toggles under the name of what it sets. */}
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <ToggleGroup label="League">
                  <IconButton
                    icon={<CrownIcon />}
                    label="Dynasty"
                    size="sm"
                    variant={listType === "dynasty" ? "primary" : "default"}
                    onClick={() => setListType("dynasty")}
                  />
                  <IconButton
                    icon={<CalendarIcon />}
                    label="Fantasy (redraft)"
                    size="sm"
                    variant={listType === "fantasy" ? "primary" : "default"}
                    onClick={() => setListType("fantasy")}
                  />
                </ToggleGroup>
                <ToggleGroup label="QB">
                  <IconButton
                    icon={<SuperflexIcon />}
                    label="Superflex"
                    size="sm"
                    variant={leagueFormat === "superflex" ? "primary" : "default"}
                    onClick={() => setLeagueFormat("superflex")}
                  />
                  <IconButton
                    icon={<OneQBIcon />}
                    label="1QB"
                    size="sm"
                    variant={leagueFormat === "oneQB" ? "primary" : "default"}
                    onClick={() => setLeagueFormat("oneQB")}
                  />
                </ToggleGroup>
                <ToggleGroup label="TE">
                  <IconButton
                    icon={<DotIcon />}
                    label="Standard scoring"
                    size="sm"
                    variant={tep === "standard" ? "primary" : "default"}
                    onClick={() => setTep("standard")}
                  />
                  <IconButton
                    icon={<PlusCircleIcon />}
                    label="TE Premium"
                    size="sm"
                    variant={tep === "tep" ? "primary" : "default"}
                    onClick={() => setTep("tep")}
                  />
                </ToggleGroup>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                {availablePositions.map((pos) => {
                  const active = !deselectedPositions.has(pos);
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => togglePosition(pos)}
                      aria-pressed={active}
                      className={`border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-[var(--map-tag)] bg-[var(--map-tag)] font-bold text-[var(--map-tag-ink)]"
                          : "border-border text-ink-muted line-through hover:bg-page"
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

              <ValueCards rows={rows.slice(0, 300)} idIndex={idIndex} />
              {rows.length > 300 ? (
                <p className="mt-3 text-xs text-ink-muted">Top 300 of {rows.length}</p>
              ) : null}
            </PlateCard>
          )}
        </div>
        <ul className="order-1 flex flex-col gap-2 md:order-2" aria-label="All players and each of your teams">
          <li>
            <PickButton
              active={picked === null}
              onClick={() => setPickedId(ALL_PLAYERS)}
              title="All players"
              note={valuesLabel}
            />
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
      </div>
    </div>
  );
}
