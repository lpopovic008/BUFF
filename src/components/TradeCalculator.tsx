"use client";

import { useState } from "react";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TradeMonitor } from "@/hooks/useTradeMonitor";
import { ordinal } from "@/lib/format";
import { shownGrade, valueGrade } from "@/lib/player-values";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { afterTrade, evenUps, FAIR_SHARE, MONITOR_POSITIONS, MonitorPlayer, positionalNeeds, weighTrade } from "@/lib/trade-monitor";

/** A piece a team could trade: a player, or a future draft pick. */
interface Piece {
  id: string;
  label: string;
  /** A player's position, or "PICK". */
  position: string;
  value: number | null;
  player?: MonitorPlayer;
}

const grade = (value: number) => shownGrade(valueGrade(value));

/** One side of the trade: what's in it, and a list to add more from that team's roster and picks. */
function Side({
  title,
  pieces,
  chosen,
  onAdd,
  onRemove,
  onOpen,
  added,
}: {
  title: string;
  pieces: Piece[];
  chosen: string[];
  /** KTC's added value this side's due on top of its pieces (see weighTrade), shown as a line of its own. */
  added: number;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen: (p: MonitorPlayer) => void;
}) {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const left = pieces.filter((p) => !chosen.includes(p.id));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="truncate border-b border-ink-primary pb-0.5 text-xs font-extrabold uppercase tracking-wide text-ink-primary">{title}</h3>
      <ul className="flex flex-col">
        {chosen.map((id) => {
          const p = byId.get(id);
          if (!p) return null;
          return (
            <li key={id} className="flex items-center gap-2 border-b border-border py-1.5 last:border-b-0">
              {p.player ? <PlayerHeadshot playerId={p.id} size={24} /> : <span className="h-6 w-6 shrink-0 rounded-full border-2 border-ink-muted" aria-hidden />}
              {p.player ? (
                <button type="button" onClick={() => onOpen(p.player!)} className="min-w-0 truncate text-left text-sm font-bold text-ink-primary hover:underline">
                  {p.label}
                </button>
              ) : (
                <span className="min-w-0 truncate text-sm font-bold text-ink-primary">{p.label}</span>
              )}
              {p.player ? <span className={`shrink-0 text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[p.position] ?? "text-ink-muted"}`}>{p.position}</span> : null}
              <span className="ml-auto shrink-0 text-sm font-extrabold tabular-nums text-ink-primary">{p.value != null ? grade(p.value) : "–"}</span>
              <button
                type="button"
                onClick={() => onRemove(id)}
                aria-label={`Take ${p.label} out`}
                className="flex h-6 w-6 shrink-0 items-center justify-center border border-border text-sm text-ink-secondary hover:border-ink-primary hover:text-ink-primary"
              >
                ×
              </button>
            </li>
          );
        })}
        {/* KTC's adjustment, as its calculator shows it: a line under the pieces, for fewer, better ones. */}
        {added > 0 ? (
          <li className="flex items-center gap-2 border-t border-dashed border-ink-muted py-1.5" title="KTC's value adjustment: fewer, better pieces are worth more than the plain sum">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-sm font-extrabold text-status-good" aria-hidden>
              +
            </span>
            <span className="min-w-0 truncate text-sm font-bold text-ink-secondary">Value adjustment</span>
            <span className="ml-auto shrink-0 text-sm font-extrabold tabular-nums text-status-good">+{grade(added)}</span>
            <span className="h-6 w-6 shrink-0" aria-hidden />
          </li>
        ) : null}
      </ul>
      <select
        value=""
        onChange={(e) => e.target.value && onAdd(e.target.value)}
        aria-label={`Add to ${title}`}
        className="min-w-0 border border-border bg-page px-2 py-1.5 text-xs text-ink-primary focus:border-ink-primary"
      >
        <option value="">+ Add a player or pick…</option>
        {left.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
            {p.player ? ` · ${p.position}` : ""}
            {p.value != null ? ` · ${grade(p.value)}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A trade with any other team in the league, weighed the way KTC's calculator weighs one: what you'd give and
 * get — players and future picks — each side's value with the added value fewer, better pieces are due, who comes
 * out ahead (or that it's fair), and what it does to both rosters' ranks at each position.
 */
export function TradeCalculator({ monitor, onOpen }: { monitor: TradeMonitor; onOpen: (p: MonitorPlayer) => void }) {
  const mine = monitor.teams.find((t) => t.mine);
  const others = monitor.teams.filter((t) => !t.mine);
  // The best trade partner to start with, else the first team.
  const [partnerId, setPartnerId] = useState(monitor.partners[0]?.rosterId ?? others[0]?.rosterId ?? null);
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const teamName = (rosterId: number) => monitor.teams.find((t) => t.rosterId === rosterId)?.name ?? `Team ${rosterId}`;

  // A team's pieces, most valuable first: its players and its picks.
  const piecesOf = (rosterId: number): Piece[] => {
    const team = monitor.teams.find((t) => t.rosterId === rosterId);
    const players = (team?.players ?? []).flatMap((id): Piece[] => {
      const p = monitor.players.get(id);
      return p ? [{ id, label: p.name, position: p.position, value: p.value, player: p }] : [];
    });
    const picks = monitor.picks
      .filter((p) => p.rosterId === rosterId)
      .map((p): Piece => ({
        id: p.id,
        label: `${p.season} ${ordinal(p.round)}${p.originalRosterId !== rosterId ? ` (${teamName(p.originalRosterId)})` : ""}`,
        position: "PICK",
        value: p.value,
      }));
    return [...players, ...picks].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  };

  if (!mine || partnerId == null) return <p className="py-4 text-center text-sm text-ink-secondary">You need a team in this league to trade.</p>;
  const ours = piecesOf(mine.rosterId);
  const theirs = piecesOf(partnerId);
  const value = (id: string) => [...ours, ...theirs].find((p) => p.id === id)?.value ?? 0;
  const verdict = weighTrade(give.map(value), get.map(value));
  const any = give.length + get.length > 0;
  const before = positionalNeeds(monitor.teams, monitor.players, monitor.starters);
  const after = positionalNeeds(afterTrade(monitor.teams, mine.rosterId, partnerId, give, get), monitor.players, monitor.starters);
  const rankIn = (needs: typeof before, rosterId: number) => needs.find((n) => n.rosterId === rosterId)!.positions;
  const total = verdict.give.total + verdict.get.total;
  // Ahead, pieces of yours would even it; behind, pieces of theirs.
  const ahead = verdict.margin > 0;
  const balancers = evenUps(
    give.map(value),
    get.map(value),
    (ahead ? ours.filter((p) => !give.includes(p.id)) : theirs.filter((p) => !get.includes(p.id))).map((p) => ({ id: p.id, value: p.value })),
    ahead ? "give" : "get"
  );

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
        Trade with
        <select
          value={partnerId}
          onChange={(e) => {
            setPartnerId(Number(e.target.value));
            setGet([]);
          }}
          className="border border-ink-primary bg-page px-1.5 py-1 text-xs font-bold uppercase text-ink-primary"
        >
          {others.map((t) => (
            <option key={t.rosterId} value={t.rosterId}>
              {t.name}
              {monitor.partners.some((p) => p.rosterId === t.rosterId) ? " · good fit" : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Side title="You give" pieces={ours} chosen={give} onAdd={(id) => setGive((g) => [...g, id])} onRemove={(id) => setGive((g) => g.filter((x) => x !== id))} onOpen={onOpen} added={verdict.give.added} />
        <Side title={`You get from ${teamName(partnerId)}`} pieces={theirs} chosen={get} onAdd={(id) => setGet((g) => [...g, id])} onRemove={(id) => setGet((g) => g.filter((x) => x !== id))} onOpen={onOpen} added={verdict.get.added} />
      </div>

      {any ? (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {/* Who comes out ahead: each side's total (added value and all), a bar split between them, and the verdict. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="flex flex-col">
              <span className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">You give</span>
              <span className="text-3xl font-extrabold leading-none tabular-nums text-ink-primary">{grade(verdict.give.total)}</span>
            </div>
            <span
              className={`border px-2 py-1 text-center text-xs font-extrabold uppercase tracking-wide ${
                verdict.fair ? "border-ink-primary text-ink-primary" : verdict.margin > 0 ? "border-status-good text-status-good" : "border-status-critical text-status-critical"
              }`}
            >
              {verdict.fair ? "Fair" : verdict.margin > 0 ? `You win by ${grade(verdict.margin)}` : `You lose by ${grade(-verdict.margin)}`}
            </span>
            <div className="flex flex-col items-end">
              <span className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">You get</span>
              <span className="text-3xl font-extrabold leading-none tabular-nums text-ink-primary">{grade(verdict.get.total)}</span>
            </div>
          </div>
          <div className="flex h-2.5 w-full gap-0.5" aria-hidden>
            <span className="h-full bg-ink-muted" style={{ width: `${total > 0 ? (verdict.give.total / total) * 100 : 50}%` }} />
            <span className="h-full bg-ink-primary" style={{ width: `${total > 0 ? (verdict.get.total / total) * 100 : 50}%` }} />
          </div>

          {/* What would even it out: ahead, pieces of yours to add; behind, pieces of theirs to ask for. */}
          {!verdict.fair && give.length > 0 && get.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-secondary">
                {ahead ? "Add one of yours to even it out" : `Ask for one of ${teamName(partnerId)}'s to even it out`}
              </span>
              {balancers.length > 0 ? (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {balancers.map((b) => {
                    const p = [...ours, ...theirs].find((x) => x.id === b.id)!;
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          onClick={() => (ahead ? setGive((g) => [...g, b.id]) : setGet((g) => [...g, b.id]))}
                          className="flex w-full items-center gap-2 border border-border px-2 py-1.5 text-left hover:border-ink-primary"
                        >
                          {p.player ? <PlayerHeadshot playerId={p.id} size={22} /> : <span className="h-[1.375rem] w-[1.375rem] shrink-0 rounded-full border-2 border-ink-muted" aria-hidden />}
                          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-primary">
                            {p.label}
                            {p.player ? <span className={`ml-1.5 text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[p.position] ?? "text-ink-muted"}`}>{p.position}</span> : null}
                          </span>
                          <span className="shrink-0 text-sm font-extrabold tabular-nums text-ink-primary">{p.value != null ? grade(p.value) : ""}</span>
                          <span
                            className={`shrink-0 text-[0.6875rem] font-bold uppercase ${b.verdict.fair ? "text-ink-primary" : b.verdict.margin > 0 ? "text-status-good" : "text-status-critical"}`}
                          >
                            {b.verdict.fair ? "→ Fair" : b.verdict.margin > 0 ? `→ Up ${grade(b.verdict.margin)}` : `→ Down ${grade(-b.verdict.margin)}`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-ink-muted">Nothing on its own brings it closer: a smaller piece only adds to the other side&rsquo;s value adjustment.</p>
              )}
            </div>
          ) : null}

          {/* What it does to both rosters: each team's rank at each position, before and after. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {[mine.rosterId, partnerId].map((rosterId) => {
              const [was, will] = [rankIn(before, rosterId), rankIn(after, rosterId)];
              return (
                <div key={rosterId} className="flex flex-col gap-1">
                  <span className="truncate text-[0.6875rem] font-bold uppercase tracking-wide text-ink-secondary">
                    {rosterId === mine.rosterId ? "Your roster" : `${teamName(rosterId)}'s roster`}
                  </span>
                  <div className="grid grid-cols-4 gap-1">
                    {MONITOR_POSITIONS.map((p) => {
                      const change = was[p].rank - will[p].rank;
                      return (
                        <span key={p} className="flex flex-col items-center border border-border py-1 leading-tight" title={`${p} rank among the league's ${monitor.teams.length} teams`}>
                          <span className={`text-[0.625rem] font-semibold ${POSITION_TEXT_COLOR[p] ?? ""}`}>{p}</span>
                          <span className={`text-xs font-extrabold tabular-nums ${change > 0 ? "text-status-good" : change < 0 ? "text-status-critical" : "text-ink-secondary"}`}>
                            {change === 0 ? `#${will[p].rank}` : `#${was[p].rank}→#${will[p].rank}`}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[0.6875rem] text-ink-muted">
            Values are KTC&rsquo;s, as this league plays; picks at the middle of their round. Fair is within {Math.round(FAIR_SHARE * 100)}% of each other.
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-secondary">Add what you&rsquo;d give and what you&rsquo;d want back to weigh the trade.</p>
      )}
    </div>
  );
}
