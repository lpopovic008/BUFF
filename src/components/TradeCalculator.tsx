"use client";

import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { TradeCalcFloorContext } from "@/components/FloorTradeCalc";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TradeMonitor } from "@/hooks/useTradeMonitor";
import { ordinal } from "@/lib/format";
import { shownGrade, valueGrade } from "@/lib/player-values";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { afterMoves, evenUps, MONITOR_POSITIONS, MonitorPlayer, positionalNeeds, weighTrade, weighTrades } from "@/lib/trade-monitor";

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
    // Put away once one's added (typing brings it back), so it isn't left over what's under it.
    setOpen(false);
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

/** Where a side's piece goes, among the trade's other sides (by their keys), shown with three sides or more. */
interface Destination {
  to: number;
  options: { key: number; name: string }[];
  onMove: (to: number) => void;
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
  destination,
  onAdd,
  onRemove,
  onOpen,
}: {
  /** The side's team to pick, over the rest. */
  team: React.ReactNode;
  pieces: Piece[];
  pool: Piece[];
  label: string;
  /** KTC's added value this side's due on top of its pieces (see weighTrades), shown as a line of its own. */
  added: number;
  ownerName: (rosterId: number) => string;
  /** Whose each piece is, under it — with no team picked for the side. */
  showOwner: boolean;
  /** Where each piece goes, picked under it — in a trade among three or more. */
  destination: ((p: Piece) => Destination) | null;
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
        {pieces.map((p) => {
          const dest = destination?.(p);
          return (
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
                {dest ? (
                  <label className="flex min-w-0 items-baseline gap-1 text-[0.625rem] uppercase text-ink-muted">
                    <span aria-hidden>→</span>
                    <select
                      value={dest.to}
                      onChange={(e) => dest.onMove(Number(e.target.value))}
                      aria-label={`Where ${p.label} goes`}
                      className="min-w-0 truncate bg-transparent font-bold uppercase text-ink-secondary outline-none hover:text-ink-primary"
                    >
                      {dest.options.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </span>
              {p.player ? <span className={`shrink-0 text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[p.position] ?? "text-ink-muted"}`}>{p.position}</span> : null}
              <span className="w-6 shrink-0 text-right text-xs font-extrabold tabular-nums text-ink-primary">{p.value != null ? grade(p.value) : "–"}</span>
              <button type="button" onClick={() => onRemove(p.id)} aria-label={`Take ${p.label} out`} className="flex h-5 w-4 shrink-0 items-center justify-center text-sm text-ink-muted hover:text-ink-primary">
                ×
              </button>
            </li>
          );
        })}
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

/** A side of the trade: its team (none picked, anyone's), and what it gives — each piece and where it goes (a side's key). */
interface SideState {
  key: number;
  team: number | null;
  gives: { id: string; to: number }[];
}

/** The most sides a trade can have. */
const MOST_SIDES = 4;

/**
 * A trade among two or more sides in the league, weighed the way KTC's calculator weighs one: what each gives —
 * players and future picks — each side's value with the added value fewer, better pieces are due, and who comes out
 * ahead (or that it's fair). With three or more, each piece goes to the side picked under it, and the trade's weighed
 * one pair of sides at a time, as two-team swaps (see weighTrades). A team picked for a side narrows what it can give
 * to that team's own; with only the others' picked, the first side's is yours. With no teams picked, anyone in the
 * league can go on any side, found by name. With every side's team known, what it'd do to their rosters' ranks at
 * each position, and, between two, what would even it out. Cleared at the top right. In a room with a floor for it
 * (see TradeCalcFloorContext), what's in it stands on the floor too.
 */
export function TradeCalculator({
  monitor,
  onOpen,
  stacked = false,
}: {
  monitor: TradeMonitor;
  onOpen: (p: MonitorPlayer) => void;
  /** The sides one over the other (a column of its own), not side by side: the first team's over the next's. */
  stacked?: boolean;
}) {
  const mine = monitor.teams.find((t) => t.mine);
  const nextKey = useRef(2);
  const [sides, setSides] = useState<SideState[]>([
    { key: 0, team: null, gives: [] },
    { key: 1, team: null, gives: [] },
  ]);
  const teamName = (rosterId: number) => monitor.teams.find((t) => t.rosterId === rosterId)?.name ?? `Team ${rosterId}`;
  // Each side's team: its own, or for the first, with only the others' picked, yours (where you're on none of them).
  const ownersOf = (list: SideState[]) => {
    const others = list.slice(1).map((s) => s.team);
    const yoursFirst = list[0].team === null && others.some((t) => t !== null) && mine && !others.includes(mine.rosterId) ? mine.rosterId : null;
    return list.map((s, i) => (i === 0 ? (s.team ?? yoursFirst) : s.team));
  };
  const owners = ownersOf(sides);
  const many = sides.length > 2;
  // Where a piece goes: where it was sent, if that side's still in it; else the next side round.
  const toOf = (list: SideState[], i: number, to: number) => (list.some((s, j) => j !== i && s.key === to) ? to : list[(i + 1) % list.length].key);

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
  const piecesOf = (side: SideState) => side.gives.flatMap((g) => (byId.has(g.id) ? [byId.get(g.id)!] : []));
  // What a side can still add: its team's, where it's known; else anyone's not another side's team — and nothing
  // already in the trade.
  const chosen = new Set(sides.flatMap((s) => s.gives.map((g) => g.id)));
  const poolFor = (i: number) => {
    const owner = owners[i];
    const taken = owners.filter((o, j) => j !== i && o !== null);
    return all.filter((p) => !chosen.has(p.id) && (owner !== null ? p.owner === owner : !taken.includes(p.owner)));
  };

  const update = (change: (list: SideState[]) => SideState[]) =>
    setSides((list) => {
      const next = change(list);
      // Whatever's not its side's team's any more taken off it, and each piece sent somewhere that's still in it.
      const known = ownersOf(next);
      return next.map((s, i) => ({
        ...s,
        gives: s.gives.filter((g) => known[i] === null || byId.get(g.id)?.owner === known[i]).map((g) => ({ ...g, to: toOf(next, i, g.to) })),
      }));
    });
  const pickTeam = (i: number, rosterId: number | null) => update((list) => list.map((s, j) => (j === i ? { ...s, team: rosterId } : s)));
  const addPiece = (i: number, id: string) => update((list) => list.map((s, j) => (j === i ? { ...s, gives: [...s.gives, { id, to: list[(i + 1) % list.length].key }] } : s)));
  const removePiece = (i: number, id: string) => update((list) => list.map((s, j) => (j === i ? { ...s, gives: s.gives.filter((g) => g.id !== id) } : s)));
  const movePiece = (i: number, id: string, to: number) => update((list) => list.map((s, j) => (j === i ? { ...s, gives: s.gives.map((g) => (g.id === id ? { ...g, to } : g)) } : s)));
  const addSide = () => update((list) => [...list, { key: nextKey.current++, team: null, gives: [] }]);
  const removeSide = (i: number) => update((list) => list.filter((_, j) => j !== i));
  const clear = () => {
    nextKey.current = 2;
    setSides([
      { key: 0, team: null, gives: [] },
      { key: 1, team: null, gives: [] },
    ]);
  };

  const sideName = (i: number) => (owners[i] === null ? `Side ${"ABCD"[i]}` : owners[i] === mine?.rosterId ? "You" : teamName(owners[i]!));
  const names = sides.map((_, i) => sideName(i));
  const nameOfKey = (key: number) => names[sides.findIndex((s) => s.key === key)];
  const gives = (name: string) => `${name} ${name === "You" ? "give" : "gives"}`;
  const any = chosen.size > 0;
  const fresh = !any && sides.length === 2 && sides.every((s) => s.team === null);

  // What's in it, on the room's floor where there's one.
  const toFloor = useContext(TradeCalcFloorContext);
  const floorKey = JSON.stringify([names, sides.map((s) => s.gives)]);
  useEffect(() => {
    if (!toFloor) return;
    toFloor(
      any
        ? {
            sides: sides.map((s, i) => ({
              title: gives(names[i]),
              pieces: piecesOf(s).map((p, k) => ({ id: p.id, label: p.label, position: p.position, value: p.value, to: many ? nameOfKey(s.gives[k].to) : undefined })),
            })),
          }
        : null
    );
    // (What's in it is the key's: it says when that changes.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toFloor, floorKey]);
  useEffect(() => (toFloor ? () => toFloor(null) : undefined), [toFloor]);

  const value = (id: string) => byId.get(id)?.value ?? 0;
  const indexOfKey = (key: number) => sides.findIndex((s) => s.key === key);
  // Every side weighed, one pair of sides at a time (see weighTrades).
  const tallies = weighTrades(
    sides.length,
    sides.flatMap((s, i) => s.gives.map((g) => ({ value: value(g.id), from: i, to: indexOfKey(g.to) })))
  );
  // Between two, as before: the first side's view of it.
  const [left, right] = [sides[0].gives.map((g) => g.id), sides[1].gives.map((g) => g.id)];
  const verdict = weighTrade(left.map(value), right.map(value));
  const total = verdict.give.total + verdict.get.total;
  const known = owners.every((o) => o !== null);
  const ownersKey = owners.join(",");
  const ranks = useMemo(() => {
    if (!known || !any) return null;
    const moves = sides.flatMap((s, i) => s.gives.map((g) => ({ id: g.id, from: owners[i]!, to: owners[indexOfKey(g.to)]! })));
    const before = positionalNeeds(monitor.teams, monitor.players, monitor.starters);
    const after = positionalNeeds(afterMoves(monitor.teams, moves), monitor.players, monitor.starters);
    const at = (needs: typeof before, rosterId: number) => needs.find((n) => n.rosterId === rosterId)!.positions;
    return owners.map((rosterId) => ({ rosterId: rosterId!, was: at(before, rosterId!), will: at(after, rosterId!) }));
    // (The sides and their owners are the key's.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, any, monitor, floorKey, ownersKey]);
  // Between two: ahead, pieces of the first side's would even it; behind, pieces of the second's — with both teams known.
  const ahead = verdict.margin > 0;
  const balancers =
    !many && known && !verdict.fair && left.length > 0 && right.length > 0
      ? evenUps(
          left.map(value),
          right.map(value),
          poolFor(ahead ? 0 : 1).map((p) => ({ id: p.id, value: p.value })),
          ahead ? "give" : "get"
        )
      : [];
  const [leftName, rightName] = names;
  const winner = verdict.margin > 0 ? leftName : rightName;
  const pickedElsewhere = (i: number) => new Set(sides.filter((_, j) => j !== i).map((s) => s.team));
  const teamOptions = (i: number) =>
    monitor.teams.map((t) => (
      <option key={t.rosterId} value={t.rosterId} disabled={pickedElsewhere(i).has(t.rosterId)}>
        {t.mine ? `${t.name} (you)` : t.name}
      </option>
    ));
  const youWord = (name: string, verb: string) => (name === "You" ? verb : `${verb}s`);

  return (
    <div className="@container flex flex-col gap-2">
      <div className="flex items-baseline justify-between border-b border-ink-primary/60 pb-1 text-xs font-bold uppercase tracking-wide text-ink-primary">
        <span>Trade calculator</span>
        <button type="button" onClick={clear} disabled={fresh} className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted hover:text-ink-primary disabled:opacity-40">
          Clear
        </button>
      </div>
      {/* Three or more: two to a row where there's room, else one over the other. */}
      <div className={stacked ? "flex flex-col gap-4" : many ? "grid grid-cols-1 gap-4 @md:grid-cols-2 @md:gap-3" : "grid grid-cols-2 gap-3"}>
        {sides.map((side, i) => (
          <Side
            key={side.key}
            team={
              <div className="flex min-w-0 items-end gap-1">
                <select
                  aria-label={`Side ${"ABCD"[i]}'s team`}
                  value={side.team ?? ""}
                  onChange={(e) => pickTeam(i, e.target.value === "" ? null : Number(e.target.value))}
                  className={SELECT}
                >
                  <option value="">{i === 0 && owners[0] !== null && side.team === null && mine ? `${mine.name} (you)` : "Any team"}</option>
                  {teamOptions(i)}
                </select>
                {many ? (
                  <button
                    type="button"
                    onClick={() => removeSide(i)}
                    aria-label={`Take ${names[i]} out of the trade`}
                    className="flex h-6 w-4 shrink-0 items-center justify-center text-sm text-ink-muted hover:text-ink-primary"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            }
            pieces={piecesOf(side)}
            pool={poolFor(i)}
            label={`Add to what ${gives(names[i])}`}
            added={tallies[i].added}
            ownerName={teamName}
            showOwner={owners[i] === null}
            destination={
              many
                ? (p) => ({
                    to: side.gives.find((g) => g.id === p.id)!.to,
                    options: sides.flatMap((s, j) => (j === i ? [] : [{ key: s.key, name: names[j] }])),
                    onMove: (to) => movePiece(i, p.id, to),
                  })
                : null
            }
            onAdd={(id) => addPiece(i, id)}
            onRemove={(id) => removePiece(i, id)}
            onOpen={onOpen}
          />
        ))}
      </div>
      {sides.length < Math.min(MOST_SIDES, monitor.teams.length) ? (
        <button type="button" onClick={addSide} className="self-start text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted hover:text-ink-primary">
          + Add a team
        </button>
      ) : null}

      {any && !many ? (
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
            {verdict.fair ? "Fair" : `${winner} ${youWord(winner, "win")} by ${Math.abs(verdict.shownMargin)}`}
          </span>

          {/* What would even it out: ahead, pieces of the first side's to add; behind, pieces of the second's to ask for. */}
          {balancers.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">{`Add from ${ahead ? leftName : rightName} to even it out`}</span>
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                {balancers.map((b) => {
                  const p = byId.get(b.id)!;
                  return (
                    <li key={b.id}>
                      <button type="button" onClick={() => addPiece(ahead ? 0 : 1, b.id)} className="flex items-baseline gap-1 text-xs hover:underline">
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
        </div>
      ) : null}

      {/* Among three or more: each side's take — what it gets for what it gives, over all its swaps, and how it comes out. */}
      {any && many ? (
        <ul className="flex flex-col gap-1 pt-1">
          {sides.map((side, i) => {
            const t = tallies[i];
            const name = names[i];
            const you = name === "You";
            return (
              <li key={side.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 text-xs">
                <span className="truncate font-bold uppercase text-ink-primary">{name}</span>
                <span className="tabular-nums text-ink-muted">
                  {youWord(name, "give")} <span className="font-extrabold text-ink-primary">{grade(t.gives)}</span> · {youWord(name, "get")}{" "}
                  <span className="font-extrabold text-ink-primary">{grade(t.gets)}</span>
                </span>
                <span
                  className={`w-16 text-right font-extrabold uppercase tabular-nums ${
                    t.fair ? "text-ink-primary" : t.net > 0 ? (you ? "text-status-good" : "text-ink-primary") : you ? "text-status-critical" : "text-ink-secondary"
                  }`}
                >
                  {t.fair ? "Fair" : t.shownNet > 0 ? `+${t.shownNet}` : `−${Math.abs(t.shownNet)}`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* What it does to every roster: each team's rank at each position, where it'd change. */}
      {ranks ? (
        <div className={stacked || many ? "flex flex-col gap-1" : "grid grid-cols-2 gap-3"}>
          {ranks.map(({ rosterId, was, will }) => (
            <div key={rosterId} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[0.6875rem]">
              {/* One over the other, each named. */}
              {stacked || many ? <span className="w-full truncate text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">{teamName(rosterId)}</span> : null}
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
  );
}
