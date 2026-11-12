"use client";

import { useMemo, useState } from "react";
import { PlateCard } from "@/components/ui/PlateCard";
import { PickButton } from "@/components/ui/PickButton";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { PlayerCareer } from "@/components/PlayerCareer";
import { TradeCalculator } from "@/components/TradeCalculator";
import { RoomColumn, WallRoom, useWideRoom } from "@/components/WallRoom";
import { useConfig } from "@/hooks/useConfig";
import { useMyLeagues } from "@/hooks/useMyLeagues";
import { TradeMonitor, useTradeMonitor } from "@/hooks/useTradeMonitor";
import { visibleLeagues } from "@/lib/localStore";
import { formatRecord } from "@/lib/format";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { shownGrade, valueGrade } from "@/lib/player-values";
import { ResolvedPlayer } from "@/lib/players";
import { Candidate, MONITOR_POSITIONS, MonitorPlayer, PlayoffStanding, Target } from "@/lib/trade-monitor";

// How each place against the playoff line reads: its label, and its colors.
const STATUS: Record<PlayoffStanding["status"], { label: string; className: string }> = {
  clinched: { label: "Clinched", className: "border-ink-primary bg-ink-primary text-page" },
  in: { label: "In", className: "border-status-good text-status-good" },
  bubble: { label: "Bubble", className: "border-status-warning text-status-warning" },
  out: { label: "Out", className: "border-border text-ink-muted" },
  eliminated: { label: "Eliminated", className: "border-status-critical text-status-critical" },
};
const MODE: Record<PlayoffStanding["mode"], string> = { buying: "Buying", selling: "Selling", either: "Either way" };
// A position's strength: well over the league's middle, well under it, or about there.
const STRONG = 0.15;

function StatusChip({ standing }: { standing: PlayoffStanding }) {
  const s = STATUS[standing.status];
  return <span className={`border px-1.5 py-px text-[0.625rem] font-bold uppercase tracking-wide ${s.className}`}>{s.label}</span>;
}

const games = (n: number) => `${n % 1 ? n.toFixed(1) : n} game${n === 1 ? "" : "s"}`;

/** Every team against the playoff line, the line drawn where it falls. */
function PlayoffPicture({ monitor }: { monitor: TradeMonitor }) {
  const byId = new Map(monitor.teams.map((t) => [t.rosterId, t]));
  return (
    <ol className="@container flex flex-col">
      {monitor.picture.map((s, i) => {
        const t = byId.get(s.rosterId)!;
        const inside = i < monitor.playoffTeams;
        const line =
          s.status === "clinched" || s.status === "eliminated" ? MODE[s.mode] : `${inside ? `${games(s.games)} up` : `${games(s.games)} back`} · ${MODE[s.mode]}`;
        return (
          <li
            key={s.rosterId}
            className={`grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 py-1.5 @lg:grid-cols-[1.5rem_minmax(0,1fr)_5rem_6.5rem_6rem] ${
              i === monitor.playoffTeams - 1 ? "border-b-2 border-ink-primary" : "border-b border-border last:border-b-0"
            } ${t.mine ? "bg-[color-mix(in_srgb,var(--map-tag)_7%,transparent)]" : ""}`}
          >
            <span className="text-right text-xs font-bold tabular-nums text-ink-muted">{t.rank}</span>
            <span className="min-w-0 truncate text-sm font-bold text-ink-primary">
              {t.name}
              {t.mine ? <span className="ml-1.5 text-[0.625rem] font-bold uppercase text-ink-muted">You</span> : null}
            </span>
            <span className="justify-self-end">
              <StatusChip standing={s} />
            </span>
            {/* In a narrow column, the record and where it stands on one line under the name; wider, each its own column. */}
            <span className="col-span-2 col-start-2 truncate text-xs tabular-nums text-ink-secondary @lg:hidden">
              {formatRecord(t.wins, t.losses, t.ties)} · {Math.round(t.pointsFor)} PF · {line}
            </span>
            <span className="text-right text-xs tabular-nums text-ink-secondary @max-lg:hidden">
              {formatRecord(t.wins, t.losses, t.ties)} · {Math.round(t.pointsFor)} PF
            </span>
            <span className="text-right text-[0.6875rem] text-ink-muted @max-lg:hidden">{line}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Each team's strength at each position — its place in the league, and against the middle — then your best trade partners. */
function Positions({ monitor }: { monitor: TradeMonitor }) {
  const byId = new Map(monitor.teams.map((t) => [t.rosterId, t]));
  const sorted = [...monitor.needs].sort((a, b) => (byId.get(a.rosterId)!.mine ? -1 : byId.get(b.rosterId)!.mine ? 1 : byId.get(a.rosterId)!.rank - byId.get(b.rosterId)!.rank));
  const n = monitor.teams.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-ink-primary text-[0.625rem] font-bold uppercase tracking-wide text-ink-secondary">
              <th className="py-1 pr-2 text-left">Team</th>
              {MONITOR_POSITIONS.map((p) => (
                <th key={p} className={`px-1 py-1 text-center ${POSITION_TEXT_COLOR[p] ?? ""}`}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const t = byId.get(row.rosterId)!;
              return (
                <tr key={row.rosterId} className={`border-b border-border last:border-b-0 ${t.mine ? "bg-[color-mix(in_srgb,var(--map-tag)_7%,transparent)]" : ""}`}>
                  <td className="max-w-[9rem] truncate py-1.5 pr-2 font-bold text-ink-primary">{t.mine ? `${t.name} (you)` : t.name}</td>
                  {MONITOR_POSITIONS.map((p) => {
                    const s = row.positions[p];
                    const tone = s.vsMedian >= STRONG ? "text-status-good" : s.vsMedian <= -STRONG ? "text-status-critical" : "text-ink-secondary";
                    const need = row.needs.includes(p);
                    return (
                      <td key={p} className="px-1 py-1.5 text-center tabular-nums" title={`${p}: ${s.rank} of ${n}, ${Math.round(s.vsMedian * 100)}% against the league's middle`}>
                        <span className={`inline-flex min-w-[3.25rem] flex-col items-center border px-1 py-px leading-tight ${need ? "border-status-critical" : row.surplus.includes(p) ? "border-status-good" : "border-transparent"}`}>
                          <span className={`font-extrabold ${tone}`}>#{s.rank}</span>
                          <span className="text-[0.625rem] text-ink-muted">
                            {s.vsMedian >= 0 ? "+" : "−"}
                            {Math.abs(Math.round(s.vsMedian * 100))}%
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[0.6875rem] text-ink-muted">
        Ranks each team&rsquo;s starters (and one for depth) by value. Outlined red: among the league&rsquo;s weakest third, a need. Green: its strongest third, a surplus.
      </p>
      {monitor.partners.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-secondary">Your best trade partners</h3>
          <ul className="flex flex-col gap-1">
            {monitor.partners.map((p) => (
              <li key={p.rosterId} className="flex flex-wrap items-baseline gap-x-2 border-l-2 border-ink-primary pl-2 text-sm">
                <span className="font-bold text-ink-primary">{byId.get(p.rosterId)!.name}</span>
                <span className="text-xs text-ink-secondary">
                  has the {p.gives.join(", ")} you need · needs the {p.takes.join(", ")} you have
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** One player on a list: photo, name (opening his career), position and age, NFL team, value, and why he's there. */
function PlayerRow({ c, onOpen, owner }: { c: Candidate; onOpen: (p: MonitorPlayer) => void; owner?: { name: string; standing?: PlayoffStanding } }) {
  const p = c.player;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-border py-2 last:border-b-0">
      <PlayerHeadshot playerId={p.id} size={34} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <button type="button" onClick={() => onOpen(p)} className="min-w-0 truncate text-left text-sm font-bold text-ink-primary hover:underline">
            {p.name}
          </button>
          <span className={`text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[p.position] ?? "text-ink-muted"}`}>{p.position}</span>
          <span className="text-[0.6875rem] tabular-nums text-ink-muted">
            {p.age != null ? `${Math.floor(p.age)} yrs` : ""}
            {p.team ? ` · ${p.team}` : ""}
          </span>
        </div>
        {owner ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[0.6875rem] text-ink-secondary">
            <span className="truncate">{owner.name}</span>
            {owner.standing ? <StatusChip standing={owner.standing} /> : null}
          </span>
        ) : null}
        <ul className="flex flex-wrap gap-1">
          {c.reasons.map((r) => (
            <li key={r.text} className="border border-border px-1.5 py-px text-[0.6875rem] leading-snug text-ink-secondary">
              {r.text}
            </li>
          ))}
        </ul>
      </div>
      <span className="flex flex-col items-end leading-tight" title="KTC value">
        <span className="text-lg font-extrabold tabular-nums text-ink-primary">{p.value != null ? shownGrade(valueGrade(p.value)) : "–"}</span>
        <span className="text-[0.625rem] uppercase text-ink-muted">{p.valueRank != null ? `${p.position}${p.valueRank}` : ""}</span>
      </span>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-ink-secondary">{children}</p>;
}

/**
 * The Trade Monitor, in a room as the League Room is: the page itself never scrolls; its columns stand on the back
 * wall, each scrolling on its own and reflected in the floor in front of them. From laptop width up: where the league
 * stands — its playoff picture and each team's positions — on the left; the trade calculator, who to sell and who to
 * target in the middle; and your leagues to pick from on the right. Narrower, all of it in one column: your leagues,
 * then the rest.
 */
export default function MonitorPage() {
  const { config } = useConfig();
  const wide = useWideRoom();
  const leagueIds = useMemo(() => visibleLeagues(config.leagues).map((l) => l.leagueId), [config.leagues]);
  const myLeagues = useMyLeagues(leagueIds, config.sleeperUserId);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = myLeagues?.find((l) => l.leagueId === pickedId) ?? myLeagues?.[0] ?? null;

  const leagues =
    myLeagues && myLeagues.length > 0 ? (
      <ul className="grid grid-cols-2 gap-2 xl:grid-cols-1" aria-label="Your leagues">
        {myLeagues.map((l) => (
          <li key={l.leagueId}>
            <PickButton active={picked?.leagueId === l.leagueId} onClick={() => setPickedId(l.leagueId)} title={l.leagueName} note={formatRecord(l.wins, l.losses, l.ties)} />
          </li>
        ))}
      </ul>
    ) : null;
  const waiting = myLeagues ? <Empty>Add a Sleeper league in Settings to watch its trade market.</Empty> : <Empty>Loading your leagues…</Empty>;

  return (
    <WallRoom title="Trade Monitor">
      {picked ? (
        <LeagueMonitor key={picked.leagueId} leagueId={picked.leagueId} myUserId={config.sleeperUserId} wide={wide} leagues={leagues} />
      ) : (
        <MonitorColumns wide={wide} leagues={leagues} middle={waiting} />
      )}
    </WallRoom>
  );
}

/**
 * The room's columns: from laptop width up, the league's standing (`left`) on the left, the middle one wider (as the
 * League Room's), your leagues on the right; narrower, one column — your leagues, then the middle's, then the left's.
 */
function MonitorColumns({ wide, leagues, left, middle }: { wide: boolean; leagues: React.ReactNode; left?: React.ReactNode; middle: React.ReactNode }) {
  if (!wide) {
    return (
      <RoomColumn label="Trade Monitor" className="flex-1">
        <div className="flex flex-col gap-4">
          {leagues}
          {middle}
          {left}
        </div>
      </RoomColumn>
    );
  }
  return (
    <>
      <RoomColumn label="Where the league stands" style={{ flex: "1 1 0%" }}>
        {left}
      </RoomColumn>
      <RoomColumn label="Trades" style={{ flex: "1.6 1 0%" }}>
        {middle}
      </RoomColumn>
      <RoomColumn label="Your leagues" style={{ flex: "1 1 0%" }}>
        {leagues}
      </RoomColumn>
    </>
  );
}

function LeagueMonitor({ leagueId, myUserId, wide, leagues }: { leagueId: string; myUserId: string | null; wide: boolean; leagues: React.ReactNode }) {
  const monitor = useTradeMonitor(leagueId, myUserId);
  const [card, setCard] = useState<ResolvedPlayer | null>(null);
  if (monitor === undefined) return <MonitorColumns wide={wide} leagues={leagues} middle={<Empty>Reading the league…</Empty>} />;
  if (monitor === null) return <MonitorColumns wide={wide} leagues={leagues} middle={<Empty>Couldn&rsquo;t load this league from Sleeper.</Empty>} />;
  const byId = new Map(monitor.teams.map((t) => [t.rosterId, t]));
  const standingOf = new Map(monitor.picture.map((s) => [s.rosterId, s]));
  const open = (p: MonitorPlayer) => setCard({ playerId: p.id, name: p.name, position: p.position, team: p.team });
  const owner = (t: Target) => ({ name: byId.get(t.rosterId)?.name ?? "", standing: standingOf.get(t.rosterId) });

  // Where the league stands: every team against the playoff line, then each team's positions.
  const left = (
    <div className="flex flex-col gap-4">
      <PlateCard title="Playoff picture" aside={<span>Top {monitor.playoffTeams} make it</span>} bodyClassName="px-3 py-1 sm:px-4">
        <PlayoffPicture monitor={monitor} />
      </PlateCard>
      <PlateCard title="Positional needs" bodyClassName="p-3 sm:p-4">
        <Positions monitor={monitor} />
      </PlateCard>
    </div>
  );
  // The trade calculator, then who to sell and who to target.
  const middle = (
    <div className="flex flex-col gap-4">
      <PlateCard title="Trade calculator" bodyClassName="p-3 sm:p-4">
        <TradeCalculator monitor={monitor} onOpen={open} />
      </PlateCard>
      <PlateCard title="Think about selling" aside={<span>{monitor.dynasty ? "Your team" : "Your team · redraft"}</span>} bodyClassName="px-3 py-1 sm:px-4">
        {monitor.sell.length > 0 ? (
          <ul>
            {monitor.sell.slice(0, 8).map((c) => (
              <PlayerRow key={c.player.id} c={c} onOpen={open} />
            ))}
          </ul>
        ) : (
          <Empty>Nobody on your team is aging out, falling in value or losing his role.</Empty>
        )}
      </PlateCard>
      <PlateCard title="Targets" aside={<span>On other teams</span>} bodyClassName="px-3 py-2 sm:px-4">
        <div className="flex flex-col gap-3">
          <section>
            <h3 className="pt-1 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-secondary">Young stars</h3>
            {monitor.stars.length > 0 ? (
              <ul>
                {monitor.stars.slice(0, 8).map((t) => (
                  <PlayerRow key={t.player.id} c={t} onOpen={open} owner={owner(t)} />
                ))}
              </ul>
            ) : (
              <Empty>No young stars on other rosters.</Empty>
            )}
          </section>
          <section>
            <h3 className="pt-1 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-secondary">Breakout candidates</h3>
            {monitor.breakouts.length > 0 ? (
              <ul>
                {monitor.breakouts.slice(0, 8).map((t) => (
                  <PlayerRow key={t.player.id} c={t} onOpen={open} owner={owner(t)} />
                ))}
              </ul>
            ) : (
              <Empty>No young players rising or outscoring their value right now.</Empty>
            )}
          </section>
        </div>
      </PlateCard>
    </div>
  );

  return (
    <>
      <MonitorColumns wide={wide} leagues={leagues} left={left} middle={middle} />
      {/* Over the room, not in a column (whose contents move as it scrolls). */}
      {card ? <PlayerCareer player={card} season={Number(monitor.season)} scoring={monitor.scoring} onClose={() => setCard(null)} /> : null}
    </>
  );
}
