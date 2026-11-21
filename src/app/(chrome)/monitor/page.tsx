"use client";

import { useEffect, useMemo, useState } from "react";
import { HeaderLeagueSwitcher, RoomLeagueList } from "@/components/LeagueSwitcher";
import { TradeAnalyzer } from "@/components/TradeAnalyzer";
import { StatusChip } from "@/components/AssetRow";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TradeCalculator } from "@/components/TradeCalculator";
import { CalcFloor, FloorTradeCalc, TradeCalcFloorContext } from "@/components/FloorTradeCalc";
import { FloorMove, FloorTradeMove, TradeFloorContext } from "@/components/FloorTradeMove";
import { FloorPlayerPath, PlayerPath, PlayerPathFloorContext } from "@/components/FloorPlayerPath";
import { RoomCard, RoomColumn, WallRoom, useWideRoom } from "@/components/WallRoom";
import { useConfig } from "@/hooks/useConfig";
import { useMyLeagues } from "@/hooks/useMyLeagues";
import { TradeMonitor, useTradeMonitor } from "@/hooks/useTradeMonitor";
import { visibleLeagues } from "@/lib/localStore";
import { formatRecord } from "@/lib/format";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { MONITOR_POSITIONS, MonitorPlayer, PlayoffStanding } from "@/lib/trade-monitor";

const MODE: Record<PlayoffStanding["mode"], string> = { buying: "Buying", selling: "Selling", either: "Either way" };

const games = (n: number) => `${n % 1 ? n.toFixed(1) : n} game${n === 1 ? "" : "s"}`;

/** Every team against the playoff line, a line each — its name, record and points — and where it stands at the right; the line drawn where it falls. */
function PlayoffPicture({ monitor, row }: { monitor: TradeMonitor; row: number }) {
  const byId = new Map(monitor.teams.map((t) => [t.rosterId, t]));
  return (
    <ol className="flex flex-col">
      {monitor.picture.map((s, i) => {
        const t = byId.get(s.rosterId)!;
        const inside = i < monitor.playoffTeams;
        const line =
          s.status === "clinched" || s.status === "eliminated" ? MODE[s.mode] : `${inside ? `${games(s.games)} up` : `${games(s.games)} back`} · ${MODE[s.mode]}`;
        return (
          <li
            key={s.rosterId}
            title={line}
            className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto_auto_4.75rem] items-center gap-x-2 text-xs ${i === monitor.playoffTeams - 1 ? "border-b border-ink-primary" : ""}`}
            style={{ height: row }}
          >
            <span className="text-right font-bold tabular-nums text-ink-muted">{t.rank}</span>
            <span className="min-w-0 truncate font-bold text-ink-primary">
              {t.name}
              {t.mine ? <span className="ml-1.5 text-[0.625rem] font-bold uppercase text-ink-muted">You</span> : null}
            </span>
            <span className="text-right tabular-nums text-ink-secondary">{formatRecord(t.wins, t.losses, t.ties)}</span>
            <span className="w-14 text-right tabular-nums text-ink-secondary">{Math.round(t.pointsFor)} PF</span>
            <span className="justify-self-end">
              <StatusChip standing={s} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Each team's rank at each position, colored: red among the league's weakest third (a need), green its strongest (a surplus). */
function Positions({ monitor, row }: { monitor: TradeMonitor; row: number }) {
  const byId = new Map(monitor.teams.map((t) => [t.rosterId, t]));
  const sorted = [...monitor.needs].sort((a, b) => (byId.get(a.rosterId)!.mine ? -1 : byId.get(b.rosterId)!.mine ? 1 : byId.get(a.rosterId)!.rank - byId.get(b.rosterId)!.rank));
  const n = monitor.teams.length;
  const cols = "grid grid-cols-[minmax(0,1fr)_repeat(4,2.75rem)] items-center gap-x-1 text-xs";
  return (
    <div className="flex flex-col">
      {/* Its name, and each position over its column, on the one ruled line. */}
      <div className={`${cols} border-b border-ink-primary/60 pb-1 font-bold uppercase tracking-wide`}>
        <span className="text-ink-primary">Positional needs</span>
        {MONITOR_POSITIONS.map((p) => (
          <span key={p} className={`text-center text-[0.6875rem] ${POSITION_TEXT_COLOR[p] ?? ""}`}>
            {p}
          </span>
        ))}
      </div>
      {sorted.map((r) => {
        const t = byId.get(r.rosterId)!;
        return (
          <div key={r.rosterId} className={cols} style={{ height: row }}>
            <span className="min-w-0 truncate font-bold text-ink-primary">
              {t.name}
              {t.mine ? <span className="ml-1.5 text-[0.625rem] font-bold uppercase text-ink-muted">You</span> : null}
            </span>
            {MONITOR_POSITIONS.map((p) => {
              const s = r.positions[p];
              const tone = r.needs.includes(p) ? "text-status-critical" : r.surplus.includes(p) ? "text-status-good" : "text-ink-secondary";
              return (
                <span key={p} className={`text-center font-extrabold tabular-nums ${tone}`} title={`${p}: ${s.rank} of ${n}, ${Math.round(s.vsMedian * 100)}% against the league's middle`}>
                  #{s.rank}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// A team's line in the playoff picture and the positions, at its least and most (px): as tall as fits them all in
// their column, in between.
const ROW_MIN_PX = 16;
const ROW_MOST_PX = 26;
// What's around the lines: the two titles, and the gap between the sections (px).
const STANDING_EXTRA_PX = 2 * 22 + 12;
// From laptop width up, the horizon a little lower than the League Room's, so the standings' column fits a league's
// every team (twelve, or near it) without scrolling.
const WIDE_FLOOR_SHARE = 0.6;

/**
 * Where the league stands: the playoff picture, then each team's rank at each position — each team a line, the lines
 * as tall as lets both fit in their column (`fit`, from laptop width up), every team in sight, else as tall as they're
 * read best.
 */
function Standings({ monitor, fit }: { monitor: TradeMonitor; fit: boolean }) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [row, setRow] = useState(ROW_MOST_PX);
  useEffect(() => {
    const column = box?.closest<HTMLElement>("[data-scroll-list]");
    if (!fit || !column) return;
    const lines = monitor.teams.length * 2;
    const measure = () => {
      const style = getComputedStyle(column);
      const room = column.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0) - STANDING_EXTRA_PX;
      setRow(Math.max(ROW_MIN_PX, Math.min(ROW_MOST_PX, Math.floor(room / lines))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [box, fit, monitor.teams.length]);
  return (
    <div ref={setBox} className="flex flex-col gap-3">
      <section className="flex flex-col">
        <SectionTitle title="Playoff picture" aside={`Top ${monitor.playoffTeams} make it`} />
        <PlayoffPicture monitor={monitor} row={fit ? row : ROW_MOST_PX} />
      </section>
      <section>
        <Positions monitor={monitor} row={fit ? row : ROW_MOST_PX} />
      </section>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-ink-secondary">{children}</p>;
}

/** On a phone, what the one column shows: the league's trades, the calculator, or where the league stands. */
type PhoneView = "trades" | "calc" | "standings";
const PHONE_VIEWS: { id: PhoneView; label: string }[] = [
  { id: "trades", label: "Trades" },
  { id: "calc", label: "Calculator" },
  { id: "standings", label: "Standings" },
];

/**
 * The Trade Monitor, in a room as the League Room is: the page itself never scrolls; its columns stand on the back
 * wall, each scrolling on its own and reflected in the floor in front of them. From laptop width up: your leagues on
 * the left, as the League Room lists them; the trade calculator in the middle, staying put over the league's trades
 * scrolled through under it; and where the league stands — its playoff picture and each team's positions — on the
 * right. On the floor, what's in the calculator — with nothing in it, the trade read in the middle (or, with a player
 * searched for, his way round the league). On a phone, one column, switched between the trades, the calculator and
 * the standings; the leagues in the page header.
 */
export default function MonitorPage() {
  const { config } = useConfig();
  const wide = useWideRoom();
  const leagueIds = useMemo(() => visibleLeagues(config.leagues).map((l) => l.leagueId), [config.leagues]);
  const myLeagues = useMyLeagues(leagueIds, config.sleeperUserId);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = myLeagues?.find((l) => l.leagueId === pickedId) ?? myLeagues?.[0] ?? null;
  // What's on the floor: the calculator's, else the player searched for's way round the league, else the trade read.
  const [calcFloor, setCalcFloor] = useState<CalcFloor | null>(null);
  const [floorMove, setFloorMove] = useState<FloorMove | null>(null);
  const [path, setPath] = useState<PlayerPath | null>(null);
  const [card, setCard] = useState<RoomCard | null>(null);
  const floor = !picked
    ? null
    : calcFloor
      ? (room: Parameters<typeof FloorTradeCalc>[0]["room"]) => <FloorTradeCalc calc={calcFloor} room={room} />
      : path
        ? (room: Parameters<typeof FloorTradeCalc>[0]["room"]) => <FloorPlayerPath key={path.player} path={path} room={room} />
        : floorMove
          ? (room: Parameters<typeof FloorTradeCalc>[0]["room"]) => <FloorTradeMove key={floorMove.key} move={floorMove} room={room} />
          : null;

  // Your leagues to pick from: from laptop width up, a column of their own as the League Room's; on a phone, switched
  // in the page header (see HeaderLeagueSwitcher), as the League Room's are.
  const roomLeagues = (myLeagues ?? []).map((l) => ({ leagueId: l.leagueId, name: l.leagueName, logo: l.logo }));
  const leagues =
    myLeagues && myLeagues.length > 0 ? (
      <RoomLeagueList leagues={roomLeagues} selectedId={picked?.leagueId ?? null} onSelect={setPickedId} label="Your leagues" />
    ) : null;
  const waiting = myLeagues ? <Empty>Add a Sleeper league in Settings to watch its trade market.</Empty> : <Empty>Loading your leagues…</Empty>;

  return (
    <TradeCalcFloorContext.Provider value={setCalcFloor}>
      <TradeFloorContext.Provider value={setFloorMove}>
        <PlayerPathFloorContext.Provider value={setPath}>
          <WallRoom title="Trade Monitor" card={card} onCloseCard={() => setCard(null)} floor={floor} floorShare={wide ? WIDE_FLOOR_SHARE : undefined}>
            {picked ? (
              <LeagueMonitor
                key={picked.leagueId}
                leagueId={picked.leagueId}
                leagueName={picked.leagueName}
                myUserId={config.sleeperUserId}
                wide={wide}
                leagues={leagues}
                onOpen={setCard}
              />
            ) : wide ? (
              <>
                <RoomColumn label="Your leagues" style={{ flex: "1 1 0%" }}>
                  {leagues}
                </RoomColumn>
                <RoomColumn label="Trades" style={{ flex: "1.6 1 0%" }}>
                  {waiting}
                </RoomColumn>
                <RoomColumn label="Where the league stands" style={{ flex: "1 1 0%" }}>
                  {null}
                </RoomColumn>
              </>
            ) : (
              <RoomColumn label="Trade Monitor" className="flex-1">
                {waiting}
              </RoomColumn>
            )}
          </WallRoom>
          {!wide && picked && myLeagues ? <HeaderLeagueSwitcher leagues={roomLeagues} selectedId={picked.leagueId} onSelect={setPickedId} /> : null}
        </PlayerPathFloorContext.Provider>
      </TradeFloorContext.Provider>
    </TradeCalcFloorContext.Provider>
  );
}

function LeagueMonitor({
  leagueId,
  leagueName,
  myUserId,
  wide,
  leagues,
  onOpen,
}: {
  leagueId: string;
  leagueName: string;
  myUserId: string | null;
  wide: boolean;
  leagues: React.ReactNode;
  onOpen: (card: RoomCard) => void;
}) {
  const monitor = useTradeMonitor(leagueId, myUserId);
  const [view, setView] = useState<PhoneView>("trades");
  const open = (p: MonitorPlayer) =>
    monitor &&
    onOpen({
      player: { playerId: p.id, name: p.name, position: p.position, team: p.team },
      season: Number(monitor.season),
      scoring: monitor.scoring,
      numbers: { valueRank: p.valueRank ?? null, dynasty: monitor.dynasty, seasonRank: null, ppg: null, opponent: null, bye: false, defenseRank: null },
    });
  const calc = monitor ? <TradeCalculator monitor={monitor} onOpen={open} /> : null;
  const standings =
    monitor === undefined ? <Empty>Reading the league…</Empty> : monitor === null ? <Empty>Couldn&rsquo;t load this league from Sleeper.</Empty> : <Standings monitor={monitor} fit={wide} />;

  return (
    <TradeAnalyzer leagueId={leagueId} leagueName={leagueName} sleeperUserId={myUserId}>
      {({ filters, count, cards }) => {
        // The league's trades: their name and count, and the filters on the same line where they fit; the cards under them.
        const tradesHead = (
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 border-b border-ink-primary/60 pb-1">
            <span className="flex items-baseline gap-2 py-1 text-xs font-bold uppercase tracking-wide text-ink-primary">
              Trades <span className="text-[0.6875rem] text-ink-muted">{count}</span>
            </span>
            {filters}
          </div>
        );
        if (wide) {
          return (
            <>
              <RoomColumn label="Your leagues" style={{ flex: "1 1 0%" }}>
                {leagues}
              </RoomColumn>
              {/* The calculator staying put over the trades, scrolled through under it. */}
              <RoomColumn
                label="Trades"
                style={{ flex: "1.6 1 0%" }}
                stage
                head={
                  <div className="flex flex-col gap-3">
                    <div className="max-h-[45vh] overflow-y-auto overscroll-contain [scrollbar-width:none]">{calc}</div>
                    {tradesHead}
                  </div>
                }
              >
                {cards}
              </RoomColumn>
              <RoomColumn label="Where the league stands" style={{ flex: "1 1 0%" }}>
                {standings}
              </RoomColumn>
            </>
          );
        }
        // On a phone, one column: the trades, the calculator or the standings, picked over it.
        const tabs = (
          <div role="tablist" aria-label="Show" className="flex gap-1">
            {PHONE_VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setView(v.id)}
                className={`flex-1 px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-wide transition-colors ${
                  view === v.id ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "text-ink-secondary"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        );
        return (
          <RoomColumn
            label="Trade Monitor"
            className="flex-1"
            stage
            head={
              <div className="flex flex-col gap-2">
                {tabs}
                {view === "trades" ? tradesHead : null}
              </div>
            }
          >
            {view === "trades" ? cards : view === "calc" ? (calc ?? standings) : standings}
          </RoomColumn>
        );
      }}
    </TradeAnalyzer>
  );
}
