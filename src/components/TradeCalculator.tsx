"use client";

import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { TradeCalcFloorContext } from "@/components/FloorTradeCalc";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TradeMonitor } from "@/hooks/useTradeMonitor";
import { ordinal } from "@/lib/format";
import { shownGrade, valueGrade } from "@/lib/player-values";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { afterTrade, evenUps, MONITOR_POSITIONS, MonitorPlayer, positionalNeeds, weighTrade } from "@/lib/trade-monitor";

/** A piece a team could trade: a player, or a future draft pick — and whose it is. */
interface Piece {
  id: string;
  label: string;
  /** A player's position, or "PICK". */
  position: string;
  value: number | null;
  owner: number;
  player?: MonitorPlayer;
}

const grade = (value: number) => shownGrade(valueGrade(value));
/** How many names a search offers at once. */
const MOST_OFFERED = 6;
const SELECT = "w-full min-w-0 truncate border-b border-border bg-transparent py-1 text-xs font-bold uppercase tracking-wide text-ink-primary outline-none focus:border-ink-primary";

/**
 * Finding a piece to add by its name: typed, the closest matches offered under it as it's typed (names starting with
 * it first, then any with it in them), the first taken with Enter. Focused before anything's typed, the most
 * valuable there are to add.
 */
function PieceSearch({ pool, label, onAdd }: { pool: Piece[]; label: string; onAdd: (id: string) => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [lit, setLit] = useState(0);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const offered = useMemo(() => {
    const typed = text.trim().toLowerCase();
    if (!typed) return pool.slice(0, MOST_OFFERED);
    const words = (p: Piece) => p.label.toLowerCase();
    const starts = pool.filter((p) => words(p).startsWith(typed) || words(p).split(" ").some((w) => w.startsWith(typed)));
    const within = pool.filter((p) => !starts.includes(p) && words(p).includes(typed));
    return [...starts, ...within].slice(0, MOST_OFFERED);
  }, [pool, text]);
  // A tap anywhere else puts the list away.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const add = (piece: Piece | undefined) => {
    if (!piece) return;
    onAdd(piece.id);
    setText("");
    setLit(0);
  };
  return (
    <div ref={box} className="relative">
      <input
        type="search"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setLit(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") return setOpen(false);
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
          e.preventDefault();
          if (e.key === "ArrowDown") setLit((i) => Math.min(offered.length - 1, i + 1));
          else if (e.key === "ArrowUp") setLit((i) => Math.max(0, i - 1));
          else add(offered[lit]);
        }}
        placeholder="+ Add a player or pick"
        aria-label={label}
        aria-controls={listId}
        aria-expanded={open}
        role="combobox"
        aria-autocomplete="list"
        className="w-full min-w-0 border-b border-border bg-transparent py-1 text-xs text-ink-primary outline-none placeholder:text-ink-muted focus:border-ink-primary"
      />
      {open && offered.length > 0 ? (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-0.5 border border-border bg-page shadow-lg">
          {offered.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === lit}>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => add(p)}
                onPointerEnter={() => setLit(i)}
                className={`flex w-full items-center gap-1.5 px-1.5 py-1 text-left text-xs ${i === lit ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "text-ink-primary"}`}
              >
                <span className="min-w-0 flex-1 truncate font-bold">{p.label}</span>
                {p.player ? <span className={`shrink-0 text-[0.625rem] font-semibold uppercase ${i === lit ? "" : (POSITION_TEXT_COLOR[p.position] ?? "text-ink-muted")}`}>{p.position}</span> : null}
                <span className="shrink-0 tabular-nums">{p.value != null ? grade(p.value) : "–"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** One side of the trade: what it gives, a way out for each piece, KTC's added value it's due, and a search to add more. */
function Side({
  team,
  pieces,
  pool,
  label,
  added,
  ownerName,
  showOwner,
  onAdd,
  onRemove,
  onOpen,
}: {
  /** The side's team to pick, over the rest. */
  team: React.ReactNode;
  pieces: Piece[];
  pool: Piece[];
  label: string;
  /** KTC's added value this side's due on top of its pieces (see weighTrade), shown as a line of its own. */
  added: number;
  ownerName: (rosterId: number) => string;
  /** Whose each piece is, under it — with no team picked for the side. */
  showOwner: boolean;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen: (p: MonitorPlayer) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/* Its team, and the search beside it where there's room (else under it). */}
      <div className="flex min-w-0 flex-col gap-1 @md:flex-row @md:items-end @md:gap-2">
        <div className="min-w-0 @md:w-[44%] @md:shrink-0">{team}</div>
        <div className="min-w-0 flex-1">
          <PieceSearch pool={pool} label={label} onAdd={onAdd} />
        </div>
      </div>
      <ul className="flex flex-col">
        {pieces.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5 py-1">
            {p.player ? <PlayerHeadshot playerId={p.id} size={22} /> : <span className="h-[1.375rem] w-[1.375rem] shrink-0 rounded-full border-2 border-ink-muted" aria-hidden />}
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              {p.player ? (
                <button type="button" onClick={() => onOpen(p.player!)} className="min-w-0 truncate text-left text-xs font-bold text-ink-primary hover:underline">
                  {p.label}
                </button>
              ) : (
                <span className="min-w-0 truncate text-xs font-bold text-ink-primary">{p.label}</span>
              )}
              {showOwner ? <span className="truncate text-[0.625rem] uppercase text-ink-muted">{ownerName(p.owner)}</span> : null}
            </span>
            {p.player ? <span className={`shrink-0 text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[p.position] ?? "text-ink-muted"}`}>{p.position}</span> : null}
            <span className="w-6 shrink-0 text-right text-xs font-extrabold tabular-nums text-ink-primary">{p.value != null ? grade(p.value) : "–"}</span>
            <button type="button" onClick={() => onRemove(p.id)} aria-label={`Take ${p.label} out`} className="flex h-5 w-4 shrink-0 items-center justify-center text-sm text-ink-muted hover:text-ink-primary">
              ×
            </button>
          </li>
        ))}
        {/* KTC's adjustment, as its calculator shows it: a line under the pieces, for fewer, better ones. */}
        {added > 0 ? (
          <li className="flex items-center gap-1.5 py-1" title="KTC's value adjustment: fewer, better pieces are worth more than the plain sum">
            <span className="w-[1.375rem] shrink-0 text-center text-xs font-extrabold text-status-good" aria-hidden>
              +
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-secondary">Value adjustment</span>
            <span className="w-6 shrink-0 text-right text-xs font-extrabold tabular-nums text-status-good">{grade(added)}</span>
            <span className="w-4 shrink-0" aria-hidden />
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * A trade between any two sides in the league, weighed the way KTC's calculator weighs one: what each gives —
 * players and future picks — each side's value with the added value fewer, better pieces are due, and who comes out
 * ahead (or that it's fair). A team picked for each side narrows what it can give to that team's own; with only the
 * right side's picked, the left's is yours. With no teams picked, anyone in the league can go on either side, found
 * by name. With both sides' teams known, what it'd do to both rosters' ranks at each position, and what would even it
 * out. Cleared at the top right. In a room with a floor for it (see TradeCalcFloorContext), what's in it stands on
 * the floor too.
 */
export function TradeCalculator({ monitor, onOpen }: { monitor: TradeMonitor; onOpen: (p: MonitorPlayer) => void }) {
  const mine = monitor.teams.find((t) => t.mine);
  const [leftTeam, setLeftTeam] = useState<number | null>(null);
  const [rightTeam, setRightTeam] = useState<number | null>(null);
  const [left, setLeft] = useState<string[]>([]);
  const [right, setRight] = useState<string[]>([]);
  const teamName = (rosterId: number) => monitor.teams.find((t) => t.rosterId === rosterId)?.name ?? `Team ${rosterId}`;
  // With only the right side's team picked, the left's is yours.
  const leftOwner = leftTeam ?? (rightTeam !== null ? (mine?.rosterId ?? null) : null);
  const rightOwner = rightTeam;

  // Every team's pieces, most valuable first: its players and its picks.
  const all = useMemo(() => {
    const out: Piece[] = [];
    for (const team of monitor.teams) {
      for (const id of team.players) {
        const p = monitor.players.get(id);
        if (p) out.push({ id, label: p.name, position: p.position, value: p.value, owner: team.rosterId, player: p });
      }
    }
    for (const p of monitor.picks) {
      const name = monitor.teams.find((t) => t.rosterId === p.originalRosterId)?.name;
      out.push({
        id: p.id,
        label: `${p.season} ${ordinal(p.round)}${p.originalRosterId !== p.rosterId ? ` (${name ?? `Team ${p.originalRosterId}`})` : ""}`,
        position: "PICK",
        value: p.value,
        owner: p.rosterId,
      });
    }
    return out.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  }, [monitor]);
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const piecesIn = (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const [leftPieces, rightPieces] = [piecesIn(left), piecesIn(right)];
  // What a side can still add: its team's, where it's known; else anyone's not the other side's team — and nothing
  // already in the trade.
  const chosen = new Set([...left, ...right]);
  const poolFor = (owner: number | null, other: number | null) => all.filter((p) => !chosen.has(p.id) && (owner !== null ? p.owner === owner : p.owner !== other));

  // A side's team picked: anything of another team's taken off it.
  const pickTeam = (side: "left" | "right", rosterId: number | null) => {
    const nextLeft = side === "left" ? rosterId : leftTeam;
    const nextRight = side === "right" ? rosterId : rightTeam;
    const nextLeftOwner = nextLeft ?? (nextRight !== null ? (mine?.rosterId ?? null) : null);
    if (side === "left") setLeftTeam(rosterId);
    else setRightTeam(rosterId);
    setLeft((ids) => (nextLeftOwner === null ? ids : ids.filter((id) => byId.get(id)?.owner === nextLeftOwner)));
    setRight((ids) => (nextRight === null ? ids : ids.filter((id) => byId.get(id)?.owner === nextRight)));
  };
  const clear = () => {
    setLeftTeam(null);
    setRightTeam(null);
    setLeft([]);
    setRight([]);
  };

  const sideName = (owner: number | null, fallback: string) => (owner === null ? fallback : owner === mine?.rosterId ? "You" : teamName(owner));
  const [leftName, rightName] = [sideName(leftOwner, "Side A"), sideName(rightOwner, "Side B")];

  // What's in it, on the room's floor where there's one.
  const toFloor = useContext(TradeCalcFloorContext);
  const floorKey = `${leftName}|${rightName}|${left.join(",")}|${right.join(",")}`;
  useEffect(() => {
    if (!toFloor) return;
    const of = (pieces: Piece[]) => pieces.map((p) => ({ id: p.id, label: p.label, position: p.position, value: p.value }));
    toFloor(left.length + right.length > 0 ? { give: of(leftPieces), get: of(rightPieces), titles: [`${leftName} ${leftName === "You" ? "give" : "gives"}`, `${rightName} ${rightName === "You" ? "give" : "gives"}`] } : null);
    // (What's in it is the key's: it says when that changes.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toFloor, floorKey]);
  useEffect(() => (toFloor ? () => toFloor(null) : undefined), [toFloor]);

  const value = (id: string) => byId.get(id)?.value ?? 0;
  // Weighed from the left side's: what it gives, and what it gets (the right's).
  const verdict = weighTrade(left.map(value), right.map(value));
  const any = left.length + right.length > 0;
  const total = verdict.give.total + verdict.get.total;
  const known = leftOwner !== null && rightOwner !== null;
  const ranks = useMemo(() => {
    if (!known || !any) return null;
    const before = positionalNeeds(monitor.teams, monitor.players, monitor.starters);
    const after = positionalNeeds(afterTrade(monitor.teams, leftOwner!, rightOwner!, left, right), monitor.players, monitor.starters);
    const at = (needs: typeof before, rosterId: number) => needs.find((n) => n.rosterId === rosterId)!.positions;
    return [leftOwner!, rightOwner!].map((rosterId) => ({ rosterId, was: at(before, rosterId), will: at(after, rosterId) }));
  }, [known, any, monitor, leftOwner, rightOwner, left, right]);
  // Ahead, pieces of the left side's would even it; behind, pieces of the right's — with both teams known.
  const ahead = verdict.margin > 0;
  const balancers =
    known && !verdict.fair && left.length > 0 && right.length > 0
      ? evenUps(
          left.map(value),
          right.map(value),
          poolFor(ahead ? leftOwner : rightOwner, null).map((p) => ({ id: p.id, value: p.value })),
          ahead ? "give" : "get"
        )
      : [];
  const winner = verdict.margin > 0 ? leftName : rightName;
  const teamOptions = (
    <>
      {monitor.teams.map((t) => (
        <option key={t.rosterId} value={t.rosterId}>
          {t.mine ? `${t.name} (you)` : t.name}
        </option>
      ))}
    </>
  );

  return (
    <div className="@container flex flex-col gap-2">
      <div className="flex items-baseline justify-between border-b border-ink-primary/60 pb-1 text-xs font-bold uppercase tracking-wide text-ink-primary">
        <span>Trade calculator</span>
        <button type="button" onClick={clear} disabled={!any && leftTeam === null && rightTeam === null} className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted hover:text-ink-primary disabled:opacity-40">
          Clear
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Side
          team={
            <select aria-label="Left side's team" value={leftTeam ?? ""} onChange={(e) => pickTeam("left", e.target.value === "" ? null : Number(e.target.value))} className={SELECT}>
              <option value="">{rightTeam !== null && mine ? `${mine.name} (you)` : "Any team"}</option>
              {teamOptions}
            </select>
          }
          pieces={leftPieces}
          pool={poolFor(leftOwner, rightOwner)}
          label={`Add to what ${leftName} ${leftName === "You" ? "give" : "gives"}`}
          added={verdict.give.added}
          ownerName={teamName}
          showOwner={leftOwner === null}
          onAdd={(id) => setLeft((ids) => [...ids, id])}
          onRemove={(id) => setLeft((ids) => ids.filter((x) => x !== id))}
          onOpen={onOpen}
        />
        <Side
          team={
            <select aria-label="Right side's team" value={rightTeam ?? ""} onChange={(e) => pickTeam("right", e.target.value === "" ? null : Number(e.target.value))} className={SELECT}>
              <option value="">Any team</option>
              {teamOptions}
            </select>
          }
          pieces={rightPieces}
          pool={poolFor(rightOwner, leftOwner)}
          label={`Add to what ${rightName} ${rightName === "You" ? "give" : "gives"}`}
          added={verdict.get.added}
          ownerName={teamName}
          showOwner={rightOwner === null}
          onAdd={(id) => setRight((ids) => [...ids, id])}
          onRemove={(id) => setRight((ids) => ids.filter((x) => x !== id))}
          onOpen={onOpen}
        />
      </div>

      {any ? (
        <div className="flex flex-col gap-2 pt-1">
          {/* Who comes out ahead: each side's total (added value and all), a bar split between them, and the verdict. */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            <span className="text-xl font-extrabold leading-none tabular-nums text-ink-primary">{grade(verdict.give.total)}</span>
            <div className="flex h-1.5 w-full gap-0.5" aria-hidden>
              <span className="h-full bg-ink-muted" style={{ width: `${total > 0 ? (verdict.give.total / total) * 100 : 50}%` }} />
              <span className="h-full bg-ink-primary" style={{ width: `${total > 0 ? (verdict.get.total / total) * 100 : 50}%` }} />
            </div>
            <span className="text-xl font-extrabold leading-none tabular-nums text-ink-primary">{grade(verdict.get.total)}</span>
          </div>
          <span
            className={`text-center text-xs font-extrabold uppercase tracking-wide ${
              verdict.fair ? "text-ink-primary" : winner === "You" ? "text-status-good" : leftName === "You" || rightName === "You" ? "text-status-critical" : "text-ink-primary"
            }`}
          >
            {verdict.fair ? "Fair" : `${winner} ${winner === "You" ? "win" : "wins"} by ${grade(Math.abs(verdict.margin))}`}
          </span>

          {/* What would even it out: ahead, pieces of the left side's to add; behind, pieces of the right's to ask for. */}
          {balancers.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">{`Add from ${ahead ? leftName : rightName} to even it out`}</span>
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                {balancers.map((b) => {
                  const p = byId.get(b.id)!;
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => (ahead ? setLeft((ids) => [...ids, b.id]) : setRight((ids) => [...ids, b.id]))}
                        className="flex items-baseline gap-1 text-xs hover:underline"
                      >
                        <span className="font-bold text-ink-primary">{p.label}</span>
                        <span className="tabular-nums text-ink-muted">{p.value != null ? grade(p.value) : ""}</span>
                        <span className={`text-[0.625rem] font-bold uppercase ${b.verdict.fair ? "text-ink-primary" : "text-ink-muted"}`}>{b.verdict.fair ? "→ fair" : ""}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* What it does to both rosters: each team's rank at each position, where it'd change. */}
          {ranks ? (
            <div className="grid grid-cols-2 gap-3">
              {ranks.map(({ rosterId, was, will }) => (
                <div key={rosterId} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[0.6875rem]">
                  {MONITOR_POSITIONS.map((p) => {
                    const change = was[p].rank - will[p].rank;
                    return (
                      <span key={p} className="whitespace-nowrap tabular-nums" title={`${p} rank among the league's ${monitor.teams.length} teams`}>
                        <span className={`font-semibold ${POSITION_TEXT_COLOR[p] ?? ""}`}>{p}</span>{" "}
                        <span className={`font-extrabold ${change > 0 ? "text-status-good" : change < 0 ? "text-status-critical" : "text-ink-secondary"}`}>
                          {change === 0 ? `#${will[p].rank}` : `#${was[p].rank}→${will[p].rank}`}
                        </span>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
