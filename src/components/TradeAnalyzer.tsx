"use client";

import { ReactNode, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { PlayerPathFloorContext } from "@/components/FloorPlayerPath";
import { useLeagueTrades } from "@/hooks/useLeagueTrades";
import { AnalyzedTrade, filterTrades, playerRoute, TRADE_SIDE_COLORS, TRADE_SORTS, TradeFilter, tradedPlayers, tradeGap, TradeSide, TradeSort } from "@/lib/trades";
import { TradeViewer } from "@/components/TradeViewer";
import { shownGrade, valueGrade } from "@/lib/player-values";
import { canvasFile, drawTradeGraphic } from "@/lib/trade-graphic";
import { getHomeView } from "@/lib/localStore";
import { ImageIcon } from "@/components/ui/Icon";

// Each side's color (see TRADE_SIDE_COLORS).
const SIDE_COLORS = TRADE_SIDE_COLORS;

const ADDED =
  "KTC's trade calculator's value adjustment: fewer, better pieces are worth more than the plain sum. Each piece counts for more the closer it is to the trade's best, the side ahead that way is ahead by a player worth the difference, and this evens the plain totals out to match. It's held at its value when traded, so the totals since show how lopsided the trade has become";

/** A value as the values page shows it: its whole grade (9,999 reads 99). */
function grade(value: number): number {
  return shownGrade(valueGrade(value));
}

/** "+6" green, "−4" red, "0" grey — a change in whole grades. */
function Change({ from, to }: { from: number; to: number }) {
  const delta = grade(to) - grade(from);
  return (
    <span className={`tabular-nums ${delta > 0 ? "text-status-good" : delta < 0 ? "text-status-critical" : "text-ink-muted"}`}>
      {delta > 0 ? "+" : delta < 0 ? "−" : ""}
      {Math.abs(delta)}
    </span>
  );
}

/** A value as its grade, "–" with none. */
function Shown({ value }: { value: number | null }) {
  return <>{value !== null ? grade(value) : "–"}</>;
}

/** The least room between two labels beside the chart (px): they're moved apart no closer than this. */
const LABEL_PX = 13;

/** Labels' heights (percent down the chart) moved apart just enough not to overlap (`gap` percent), kept within it, in their order. */
function spread(ys: number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
  const over = order.length > 0 ? order[order.length - 1].y - 100 : 0;
  if (over > 0) for (const o of order) o.y -= over;
  for (let k = order.length - 2; k >= 0; k--) order[k].y = Math.min(order[k].y, order[k + 1].y - gap);
  const out = Array<number>(ys.length);
  for (const o of order) out[o.i] = o.y;
  return out;
}

/** How far into the chart (percent of its width) its lines run in from their names, where the names had to be moved
 * apart to fit, to their first values. */
const LEAD_IN = 7;

/** The day the sides were closest together, any week since the trade (see tradeGap). */
function closestDay(trade: AnalyzedTrade): number | null {
  const days = trade.sides[0]?.path.map((p) => p.day) ?? [];
  let best: { day: number; gap: number } | null = null;
  days.forEach((day, i) => {
    const gap = tradeGap(trade.sides, i).gap;
    if (!best || gap < best.gap) best = { day, gap };
  });
  return (best as { day: number; gap: number } | null)?.day ?? null;
}

/**
 * Where a value's label goes inside the chart beside a point on a line at `at` (percent down): just above it or just
 * below — never past another line (`others`, percent down) where the other side isn't, so it's read with its own;
 * else whichever leaves more room from the other lines and the labels already put beside them (`placed`) — kept
 * inside the chart. `h`: a label's height, and `pad` the room between it and its line (percent).
 */
function roomFor(at: number, others: number[], placed: number[], h: number, pad: number): number {
  const keep = (c: number) => Math.min(100 - h / 2, Math.max(h / 2, c));
  const [above, below] = [keep(at - pad - h / 2), keep(at + pad + h / 2)];
  const crosses = (c: number) => others.some((o) => (o - at) * (o - c) < 0);
  if (crosses(above) !== crosses(below)) return crosses(above) ? below : above;
  const clearance = (c: number) => Math.min(Infinity, ...others.map((o) => Math.abs(o - c)), ...placed.map((p) => Math.abs(p - c) - h / 2));
  return clearance(below) > clearance(above) + 0.5 ? below : above;
}

/**
 * A trade's every piece on one chart, week by week from the trade to now: each a line in the color of the team that
 * got it (a pick's running on into whoever it became, a dot where it did), its name outside the chart on the left by
 * where it started, and on the right by where it ends its value now — or, for a pick that's become a player, his name,
 * its value now then inside the chart over or under its line's end, wherever there's room. Every line's value when
 * traded inside the chart by its start the same way. Inside it too, two faint wires: the week the sides were farthest
 * apart, and the week they were closest.
 */
function TradeChart({ trade, colorOf }: { trade: AnalyzedTrade; colorOf: (side: TradeSide) => string }) {
  const box = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(176);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setTall(el.clientHeight || 176);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const days = trade.sides[0]?.path.map((p) => p.day) ?? [];
  const [first, last] = [days[0] ?? 0, days[days.length - 1] ?? 0];
  const lines = trade.sides.flatMap((side) =>
    side.got.map((asset) => ({ asset, color: colorOf(side), points: asset.path.map((p) => ({ day: p.day, value: p.value ?? 0 })) }))
  );
  if (lines.length === 0) return null;
  // One scale for every piece, the trade's lowest value to its highest (a piece with no value sits at 0).
  const values = lines.flatMap((l) => [...l.points.map((p) => p.value), l.asset.then ?? 0, l.asset.now ?? 0]);
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const span = hi - lo || 1;
  // Percent down the chart, a little room kept at the top and bottom; and across it.
  const y = (value: number) => 4 + (1 - (value - lo) / span) * 92;
  // A trade made today has its values only for today: each line drawn flat across the chart at its value.
  const today = last <= first;
  const gap = (LABEL_PX / Math.max(1, tall)) * 100;
  const firstValue = (l: (typeof lines)[number]) => l.points[0]?.value ?? l.asset.then ?? 0;
  const lastValue = (l: (typeof lines)[number]) => l.points[l.points.length - 1]?.value ?? l.asset.now ?? 0;
  // Where each line starts and ends on the chart — its name by its start, and its value now (or who it became) by its
  // end, moved apart only as far as they'd otherwise overlap (a tick then joining a value to its line's end).
  const starts = lines.map((l) => y(firstValue(l)));
  const ends = lines.map((l) => y(lastValue(l)));
  const lefts = spread(starts, gap);
  const rights = spread(ends, gap);
  // Where names had to be moved apart, each line starts at its name, level with it, and runs in to its first value
  // over the chart's first stretch (LEAD_IN) — the weeks drawn across the rest.
  const lead = lefts.some((at, i) => Math.abs(at - starts[i]) > 0.5) ? LEAD_IN : 0;
  const x = (day: number) => lead + (last > first ? ((day - first) / (last - first)) * (100 - lead) : 0);
  const named = lines.some((l) => l.asset.became);
  // The values inside the chart: every line's when traded by its start, and a drafted pick's now by its end.
  const h = (11 / Math.max(1, tall)) * 100;
  const pad = (3 / Math.max(1, tall)) * 100;
  const startAt: number[] = [];
  lefts.forEach((s, i) => startAt.push(roomFor(s, lefts.filter((_, j) => j !== i), startAt, h, pad)));
  const endAt = new Map<number, number>();
  lines.forEach((l, i) => {
    if (l.asset.became) endAt.set(i, roomFor(ends[i], ends.filter((_, j) => j !== i), [...endAt.values()], h, pad));
  });
  // Where each pick became a player: its line's point that day.
  const dots = lines.flatMap((l, i) => {
    const at = l.asset.became?.at;
    if (at === undefined || at < first || at > last) return [];
    const point = l.points.find((p) => p.day >= at) ?? l.points[l.points.length - 1];
    return point ? [{ i, left: x(at), top: y(point.value), color: l.color, name: l.asset.became!.name }] : [];
  });
  const widest = x(trade.widest.day);
  const closestOn = closestDay(trade);
  const closest = closestOn !== null ? x(closestOn) : null;
  const label = "absolute -translate-y-1/2 whitespace-nowrap text-xs leading-none";
  const inside = "absolute -translate-y-1/2 whitespace-nowrap text-[0.625rem] font-bold leading-none tabular-nums";
  return (
    <div
      ref={box}
      className={`grid min-h-[5rem] flex-1 ${named ? "grid-cols-[minmax(0,8rem)_minmax(0,1fr)_minmax(0,8rem)]" : "grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2rem]"} gap-x-0 gap-y-1.5`}
      role="img"
      aria-label="Each piece's value from the trade to now"
    >
      {/* Each piece's name, right beside where its line starts. */}
      <div className="relative">
        {lines.map((l, i) => (
          <span
            key={i}
            className={`${label} right-1.5 max-w-[calc(100%-0.375rem)] truncate font-semibold`}
            style={{ top: `${lefts[i]}%`, color: l.color }}
            title={[l.asset.label, l.asset.became ? `became ${l.asset.became.name}` : null, l.asset.pickOf ? `(${l.asset.pickOf})` : null].filter(Boolean).join(" ")}
          >
            {l.asset.label}
          </span>
        ))}
      </div>
      <div className="relative border-x border-border">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          {/* The week the sides were farthest apart, and the week they were closest. */}
          {(today ? [] : [widest, closest]).map((at, i) =>
            at === null ? null : (
              // As thin and faint as the chart's ends (its border): one pixel, kept crisp rather than blurred over two.
              <line key={i} x1={at} x2={at} y1={0} y2={100} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />
            )
          )}
          {lines.map((l, i) =>
            l.points.length > 1 || today ? (
              <polyline
                key={i}
                points={[
                  // From its name, level with it, in to its first value…
                  `0,${lefts[i]}`,
                  ...(lead > 0 ? [`${lead},${starts[i]}`] : []),
                  // …then week by week (or, a trade made today, flat across).
                  ...(today || l.points.length < 2 ? [`100,${y(lastValue(l))}`] : l.points.map((p) => `${x(p.day)},${y(p.value)}`)),
                ].join(" ")}
                fill="none"
                stroke={l.color}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ) : null
          )}
        </svg>
        {/* Where each pick became a player. */}
        {dots.map((d) => (
          <span
            key={`dot-${d.i}`}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--page)]"
            style={{ left: `${d.left}%`, top: `${d.top}%`, background: d.color }}
            title={`Drafted: ${d.name}`}
          />
        ))}
        {/* Each line's value when traded, by its start; a drafted pick's value now, by its end. */}
        {lines.map((l, i) => (
          <span key={`then-${i}`} className={`${inside} left-1`} style={{ top: `${startAt[i]}%`, color: l.color }} title="When traded">
            {grade(firstValue(l))}
          </span>
        ))}
        {[...endAt].map(([i, at]) => (
          <span key={`now-${i}`} className={`${inside} right-1`} style={{ top: `${at}%`, color: lines[i].color }} title={`${lines[i].asset.became!.name} now`}>
            <Shown value={lines[i].asset.now} />
          </span>
        ))}
      </div>
      {/* By where each line ends: its value now — or, a pick that's become a player, who he is. */}
      <div className="relative">
        {lines.map((l, i) =>
          l.asset.became ? (
            <span key={i} className={`${label} left-1.5 max-w-[calc(100%-0.375rem)] truncate font-semibold`} style={{ top: `${rights[i]}%`, color: l.color }} title={`${l.asset.label} became ${l.asset.became.name}`}>
              {l.asset.became.name}
            </span>
          ) : (
            <span key={i} className={`${label} left-1.5 font-bold tabular-nums text-ink-primary`} style={{ top: `${rights[i]}%` }} title="Now">
              <Shown value={l.asset.now} />
            </span>
          )
        )}
      </div>
    </div>
  );
}

/**
 * The trade as a picture to send to the league (see trade-graphic.ts), in the export theme picked in Settings: handed
 * to the share sheet where there is one (a phone's — Messages, the group chat) as the picture alone, no text with it, else
 * copied to paste, else saved.
 */
function TradeExport({ trade, leagueName }: { trade: AnalyzedTrade; leagueName: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "saved" | "error">("idle");
  const settle = (next: typeof status) => {
    setStatus(next);
    window.setTimeout(() => setStatus("idle"), 2200);
  };
  const exportIt = async () => {
    let file: File;
    try {
      const canvas = document.createElement("canvas");
      drawTradeGraphic(canvas, trade, leagueName, getHomeView().exportTheme);
      const day = new Date(trade.at).toISOString().slice(0, 10);
      file = canvasFile(canvas, `trade-${day}.png`);
    } catch {
      settle("error");
      return;
    }
    // Straight to the share sheet, in this same tap.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
      settle("copied");
      return;
    } catch {
      // On to saving it.
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    settle("saved");
  };
  const label = status === "copied" ? "Copied" : status === "saved" ? "Saved" : status === "error" ? "Couldn't export" : "Export";
  return (
    <button
      type="button"
      onClick={exportIt}
      title="Export this trade as a picture to send to your league"
      aria-live="polite"
      className="ml-auto flex shrink-0 items-center gap-1 border border-border px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-ink-primary transition-colors hover:border-ink-primary"
    >
      <ImageIcon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/**
 * A trade: its date at the top left and its teams beside it, each in its color (yours underlined; whoever's haul is
 * worth the most now on the plate), and at the right a way to export it as a picture; its pieces on one chart (see TradeChart); and under it, each side's FAAB, added
 * value and totals, then and now. `height`: as tall as that (px), the chart taking what's left — else as tall as it
 * needs.
 */
function TradeCard({ trade, leagueName, height }: { trade: AnalyzedTrade; leagueName: string; height?: number | null }) {
  const worth = (s: TradeSide) => s.now + s.added;
  const leader = trade.sides.reduce((best, s) => (worth(s) > worth(best) ? s : best), trade.sides[0]);
  const madeOn = new Date(trade.at);
  const colorOf = (side: TradeSide) => SIDE_COLORS[Math.max(0, trade.sides.indexOf(side)) % SIDE_COLORS.length];
  return (
    <li data-trade-id={trade.id} className="flex flex-col gap-2 py-2 sm:py-3" style={height ? { height } : undefined}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-secondary tabular-nums" title="When the trade was made">
          {madeOn.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        {trade.sides.map((side) => {
          const ahead = side === leader && side.now > 0;
          return (
            <span key={side.rosterId} className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="h-2 w-2 shrink-0" style={{ background: colorOf(side) }} aria-hidden />
              <span
                className={`min-w-0 truncate font-bold ${ahead ? "bg-[var(--map-tag)] px-1 text-[var(--map-tag-ink)]" : ""} ${side.mine ? "underline decoration-2 underline-offset-2" : ""}`}
                style={ahead ? undefined : { color: colorOf(side) }}
                title={ahead ? `${side.team} — worth the most now` : side.team}
              >
                {side.team}
              </span>
            </span>
          );
        })}
        <TradeExport trade={trade} leagueName={leagueName} />
      </div>
      <TradeChart trade={trade} colorOf={colorOf} />
      {/* Each side's totals, in its color: what it got at its whole grades, added up — and any FAAB and added value. */}
      <div className="grid gap-x-4 gap-y-1 border-t border-border pt-1" style={{ gridTemplateColumns: `repeat(${trade.sides.length}, minmax(0, 1fr))` }}>
        {trade.sides.map((side) => (
          <div key={side.rosterId} className="flex min-w-0 flex-wrap items-end justify-between gap-x-3">
            <div className="flex min-w-0 flex-col pb-1 text-xs">
              {side.faab > 0 ? <span className="text-ink-muted">${side.faab} FAAB</span> : null}
              {side.got.length === 0 && side.faab === 0 ? <span className="text-ink-muted">Nothing</span> : null}
              {side.added > 0 ? (
                <span className="italic text-ink-secondary" title={ADDED}>
                  Added value <span className="not-italic tabular-nums">{grade(side.added)}</span>
                </span>
              ) : null}
            </div>
            <div className="ml-auto flex shrink-0 items-baseline gap-2">
              <span className="text-xs" style={{ color: colorOf(side) }}>
                Total
              </span>
              <span className="text-lg tabular-nums text-ink-muted">{grade(side.then + side.added)}</span>
              <span className="text-ink-muted">→</span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: colorOf(side) }}>
                {grade(side.now + side.added)}
              </span>
              <span className="text-lg">
                <Change from={side.then + side.added} to={side.now + side.added} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </li>
  );
}

const FIELD = "min-w-0 border-b border-border bg-transparent py-1 text-xs text-ink-primary outline-none focus:border-ink-primary";

/** Finding a player: typed and picked from everyone the trades moved — cleared, anyone's. */
function PlayerSearch({ players, player, onChange }: { players: string[]; player: string | null; onChange: (player: string | null) => void }) {
  const listId = useId();
  const [text, setText] = useState(player ?? "");
  // Typed out in full (any case), they're picked.
  const pickFrom = (value: string) => {
    setText(value);
    const typed = value.trim().toLowerCase();
    if (typed === "") return onChange(null);
    const match = players.find((p) => p.toLowerCase() === typed);
    if (match) onChange(match);
  };
  return (
    <>
      <input
        type="search"
        aria-label="Player"
        placeholder="Any player"
        list={listId}
        value={text}
        onChange={(e) => pickFrom(e.target.value)}
        className={`${FIELD} w-32 ${player ? "border-ink-primary" : ""}`}
      />
      <datalist id={listId}>
        {players.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  );
}

/**
 * Finding trades: a season, a team slot (by its latest name), a player (his way round the league on the room's floor,
 * see FloorPlayerPath), and the order they're in — on one line where they fit.
 */
function TradeFilters({
  trades,
  teams,
  filter,
  onChange,
}: {
  trades: AnalyzedTrade[];
  teams: { rosterId: number; name: string }[];
  filter: TradeFilter;
  onChange: (next: TradeFilter) => void;
}) {
  const seasons = useMemo(() => [...new Set(trades.map((t) => t.season))].sort().reverse(), [trades]);
  const players = useMemo(() => tradedPlayers(trades), [trades]);
  return (
      <div className="flex flex-wrap gap-x-2.5 gap-y-1">
        <select aria-label="Season" value={filter.season ?? ""} onChange={(e) => onChange({ ...filter, season: e.target.value || null })} className={FIELD}>
          <option value="">All seasons</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select aria-label="Team" value={filter.team ?? ""} onChange={(e) => onChange({ ...filter, team: e.target.value === "" ? null : Number(e.target.value) })} className={`${FIELD} max-w-[9rem]`}>
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.rosterId} value={t.rosterId}>
              {t.name}
            </option>
          ))}
        </select>
        <PlayerSearch players={players} player={filter.player} onChange={(player) => onChange({ ...filter, player })} />
        <select aria-label="Sort" value={filter.sort} onChange={(e) => onChange({ ...filter, sort: e.target.value as TradeSort })} className={FIELD}>
          {TRADE_SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
  );
}

const NO_FILTER: TradeFilter = { season: null, team: null, player: null, sort: "newest" };

/**
 * How far down its column the line a trade card's read at is, scrolled to its top: the card across it is the trade
 * shown. Scrolled further, the line goes on down with it, so it's at the column's foot at its end (and the last card's
 * read, however short).
 */
const READ_AT = 0.3;

/** How close to filling its column a card has to come to rest (a share of its height) to be eased the rest of the way. */
const SNAP_WITHIN = 0.25;
/** How long a column's scroll has to have stopped to have come to rest (ms). */
const SETTLE_MS = 160;

/** How far `card` is from filling its column `column` — its top at the column's, past its padding (px, + below). */
function offFill(column: HTMLElement, card: HTMLElement): number {
  const pad = parseFloat(getComputedStyle(column).paddingTop) || 0;
  return card.getBoundingClientRect().top - (column.getBoundingClientRect().top + pad);
}

/**
 * Every trade in a league, all its seasons, newest first: what each side got, what it was worth when traded
 * and now — in KTC dynasty values (superflex or 1QB, as the league plays), shown as the values page's grades —
 * and each side's haul from the trade to now on a little chart. Filters find a season's, a team's or a player's,
 * and reorder them.
 *
 * Laid out by `children` (handed the filters, the count and the cards): the cards scrolled through in a column of
 * their own, each as tall as the column shows — the card a little way down it the trade shown on the room's floor
 * (see TradeViewer), a trade picked there scrolled to. With a player searched for, his way round the league on the
 * floor instead (see FloorPlayerPath).
 */
export function TradeAnalyzer({
  leagueId,
  leagueName,
  sleeperUserId,
  children,
}: {
  leagueId: string;
  leagueName: string;
  sleeperUserId: string | null;
  children: (parts: { filters: ReactNode; count: ReactNode; cards: ReactNode }) => ReactNode;
}) {
  const data = useLeagueTrades(leagueId, sleeperUserId);
  const [filter, setFilter] = useState<TradeFilter>(NO_FILTER);
  const shown = useMemo(() => (data ? filterTrades(data.trades, filter) : []), [data, filter]);
  const filtered = filter.season !== null || filter.team !== null || filter.player !== null;
  // The trade shown: the card read, or the trade picked on the floor.
  const [shownId, setShownId] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  // A trade picked on the floor scrolled to — not then taken for the cards being scrolled through, for a moment.
  const pickedAt = useRef(0);
  const showPicked = (id: string) => {
    setShownId(id);
    const card = list.current?.querySelector<HTMLElement>(`[data-trade-id="${CSS.escape(id)}"]`);
    const column = list.current?.closest<HTMLElement>("[data-scroll-list]");
    if (!card || !column) return;
    pickedAt.current = performance.now();
    // Its card filling the column (as tall as it shows, see cardHeight).
    column.scrollTo({ top: Math.max(0, column.scrollTop + offFill(column, card)) });
  };
  // The card across the line it's read at, as its column's scrolled.
  useEffect(() => {
    const el = list.current;
    const column = el?.closest<HTMLElement>("[data-scroll-list]");
    if (!el || !column) return;
    const read = () => {
      if (performance.now() - pickedAt.current < 400) return;
      const most = column.scrollHeight - column.clientHeight;
      const through = most > 0 ? Math.min(1, Math.max(0, column.scrollTop / most)) : 0;
      const line = column.getBoundingClientRect().top + column.clientHeight * (READ_AT + (1 - READ_AT) * through);
      const cards = [...el.querySelectorAll<HTMLElement>("[data-trade-id]")];
      const across = cards.find((c) => c.getBoundingClientRect().bottom > line) ?? cards.at(-1);
      const id = across?.dataset.tradeId;
      if (id) setShownId((was) => (was === id ? was : id));
    };
    read();
    // Scrolled as it is — but come to rest close to a card's filling the column (within a quarter of it), eased the
    // rest of the way there.
    let settle = 0;
    const settled = () => {
      const cards = [...el.querySelectorAll<HTMLElement>("[data-trade-id]")];
      const nearest = cards.map((c) => ({ c, off: offFill(column, c) })).sort((a, b) => Math.abs(a.off) - Math.abs(b.off))[0];
      if (!nearest || Math.abs(nearest.off) < 1 || Math.abs(nearest.off) > nearest.c.offsetHeight * SNAP_WITHIN) return;
      const top = Math.max(0, Math.min(column.scrollHeight - column.clientHeight, column.scrollTop + nearest.off));
      column.scrollTo({ top, behavior: "smooth" });
    };
    const scrolled = () => {
      read();
      window.clearTimeout(settle);
      settle = window.setTimeout(settled, SETTLE_MS);
    };
    column.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      window.clearTimeout(settle);
      column.removeEventListener("scroll", scrolled);
    };
  }, [shown]);

  // Each card as tall as its column shows: one trade fills it.
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  useEffect(() => {
    const column = list.current?.closest<HTMLElement>("[data-scroll-list]");
    if (!column) return;
    const measure = () => {
      const style = getComputedStyle(column);
      const room = column.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
      setCardHeight((was) => (room > 0 && was !== room ? room : was));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [shown]);

  // A player searched for: his way round the league, on the room's floor where there's one.
  const toPathFloor = useContext(PlayerPathFloorContext);
  const route = useMemo(() => (data && filter.player ? playerRoute(data.trades, filter.player) : null), [data, filter.player]);
  useEffect(() => {
    if (!toPathFloor) return;
    if (!data || !route || route.stops.length === 0 || !filter.player) return toPathFloor(null);
    const playerId = [...data.people].find(([, p]) => p.name === filter.player)?.[0] ?? null;
    toPathFloor({
      player: filter.player,
      playerId,
      stops: [...(route.from ? [{ rosterId: route.from.rosterId, at: null }] : []), ...route.stops.map((s) => ({ rosterId: s.rosterId, at: s.at, asPick: s.asPick }))],
      teams: data.teams,
      now: Date.now(),
    });
  }, [toPathFloor, data, route, filter.player]);
  useEffect(() => (toPathFloor ? () => toPathFloor(null) : undefined), [toPathFloor]);

  const filters = data && data.trades.length > 0 ? <TradeFilters trades={data.trades} teams={data.teams} filter={filter} onChange={setFilter} /> : null;
  const count = data ? <span className="tabular-nums">{filtered ? `${shown.length} of ${data.trades.length}` : data.trades.length} trades</span> : null;
  const cardList = !data ? (
    <p className="py-4 text-center text-sm text-ink-secondary">Loading trades…</p>
  ) : data.trades.length === 0 ? (
    <p className="py-4 text-center text-sm text-ink-secondary">No trades yet.</p>
  ) : shown.length === 0 ? (
    <p className="py-4 text-center text-sm text-ink-secondary">No trades match.</p>
  ) : (
    <ol ref={list} className="flex flex-col gap-3">
      {shown.map((trade) => (
        <TradeCard key={trade.id} trade={trade} leagueName={leagueName} height={cardHeight} />
      ))}
    </ol>
  );

  return (
    <>
      {children({ filters, count, cards: cardList })}
      {/* The trade shown, on the room's floor (and nothing of it here: its card's in the column). */}
      {data && data.timeline.some((c) => c.kind === "trade") ? (
        <TradeViewer
          timeline={data.timeline}
          people={data.people}
          teams={data.teams}
          trades={data.trades}
          valueAt={data.valueAt}
          season={filter.season}
          shownId={shownId}
          onShow={showPicked}
        />
      ) : null}
    </>
  );
}
