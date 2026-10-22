"use client";

import { ReactNode, useMemo, useState } from "react";
import { PlateCard } from "@/components/ui/PlateCard";
import { useLeagueTrades } from "@/hooks/useLeagueTrades";
import { AnalyzedTrade, filterTrades, MY_TRADES, TRADE_SORTS, TradeAsset, TradeFilter, TradeGap, TradeSide, TradeSort } from "@/lib/trades";
import { DAY_MS } from "@/lib/value-history";
import { shownGrade, valueGrade } from "@/lib/player-values";

// Each side's color — its swatch by the team's name, and its big numbers when it's ahead.
const SIDE_COLORS = ["var(--ink-primary)", "var(--series-1)", "var(--series-2)", "var(--series-5)"];
// Each piece's color in its side's list and chart, in order.
const ASSET_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-7)", "var(--series-6)", "var(--series-8)"];
// Outlines the number a total counts, where a drafted pick shows more than one.
const COUNTED = "outline outline-1 outline-offset-1 outline-current";

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

/** The days a trade's charts run over and the values they span — the trade's lowest to its highest — shared by its sides, so they compare. */
interface ChartScale {
  first: number;
  last: number;
  lo: number;
  hi: number;
}

// A chart label's height, as a share of the chart's (11rem tall, labels about 0.75rem) — the least they're kept apart.
const LABEL_GAP = 7;

/** Labels' heights (percent down the chart) moved apart just enough not to overlap, kept within it, in their order. */
function spread(ys: number[], gap = LABEL_GAP): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
  const over = order.length > 0 ? order[order.length - 1].y - 100 : 0;
  if (over > 0) for (const o of order) o.y -= over;
  for (let k = order.length - 2; k >= 0; k--) order[k].y = Math.min(order[k].y, order[k + 1].y - gap);
  const out = Array<number>(ys.length);
  for (const o of order) out[o.i] = o.y;
  return out;
}

// Each label's text kept legible over the lines it crosses.
const HALO = { textShadow: "0 0 3px var(--surface-raised), 0 0 3px var(--surface-raised), 0 0 2px var(--surface-raised)" };

/**
 * A side's pieces' values week by week from the trade to now, filling its box: a line each in its own color (a
 * pick's running on into whoever it became), on the trade's scale (see
 * ChartScale). Each line's value when traded sits at its left end, its value now at its right, and its
 * name inside the chart by its start — a drafted pick's player by its end. A drafted pick's two numbers are what
 * the totals count, outlined.
 */
function SideChart({ assets, scale }: { assets: TradeAsset[]; scale: ChartScale }) {
  const { first, last, lo, hi } = scale;
  const span = hi - lo || 1;
  // Percent down the chart, a little room kept at the top and bottom.
  const y = (value: number) => 6 + (1 - (value - lo) / span) * 88;
  const x = (day: number) => (last > first ? ((day - first) / (last - first)) * 100 : 0);
  const lines = assets.map((asset, i) => {
    const color = ASSET_COLORS[i % ASSET_COLORS.length];
    const known = asset.path.filter((p) => p.value !== null);
    const start = asset.then ?? known[0]?.value ?? null;
    const end = asset.now ?? known[known.length - 1]?.value ?? null;
    // Its line, broken where there's no value.
    const runs: { points: { day: number; value: number }[] }[] = [];
    for (let k = 1; k < asset.path.length; k++) {
      const [a, b] = [asset.path[k - 1], asset.path[k]];
      if (a.value === null || b.value === null) continue;
      const run = runs[runs.length - 1];
      if (run && run.points[run.points.length - 1].day === a.day) run.points.push({ day: b.day, value: b.value });
      else runs.push({ points: [{ day: a.day, value: a.value }, { day: b.day, value: b.value }] });
    }
    return { asset, color, start, end, runs };
  });
  const lefts = spread(lines.map((l) => (l.start === null ? 50 : y(l.start))));
  const rights = spread(lines.map((l) => (l.end === null ? 50 : y(l.end))));
  if (!lines.some((l) => l.runs.length > 0 || l.start !== null)) return null;
  const label = "absolute -translate-y-1/2 whitespace-nowrap text-xs leading-none tabular-nums";
  return (
    <div className="grid h-44 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] gap-1" role="img" aria-label="Each piece's value from the trade to now">
      {/* Then, at each line's left end. */}
      <div className="relative">
        {lines.map((l, i) =>
          l.start === null ? null : (
            <span
              key={i}
              className={`${label} right-0 text-ink-muted ${l.asset.became ? COUNTED : ""}`}
              style={{ top: `${lefts[i]}%` }}
              title="When traded"
            >
              <Shown value={l.start} />
            </span>
          )
        )}
      </div>
      <div className="relative border-x border-border">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          {lines.flatMap((l, i) =>
            l.runs.map((run, k) => (
              <polyline
                key={`${i}-${k}`}
                points={run.points.map((p) => `${x(p.day)},${y(p.value)}`).join(" ")}
                fill="none"
                stroke={l.color}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))
          )}
        </svg>
        {/* Each piece's name by its line's start; a drafted pick's player's by its end. */}
        {lines.map((l, i) => {
          const position = l.asset.position === "PICK" ? null : l.asset.position;
          return (
            <span
              key={i}
              className={`${label} left-1 max-w-[70%] truncate font-semibold`}
              style={{ top: `${lefts[i]}%`, color: l.color, ...HALO }}
              title={[l.asset.label, position, l.asset.pickOf ? `(${l.asset.pickOf})` : null].filter(Boolean).join(" ")}
            >
              {l.asset.label}
            </span>
          );
        })}
        {lines.map((l, i) =>
          l.asset.became ? (
            <span
              key={i}
              className={`${label} right-1 max-w-[70%] truncate font-semibold`}
              style={{ top: `${rights[i]}%`, color: l.color, ...HALO }}
              title={`${l.asset.label} became ${l.asset.became.name}`}
            >
              {l.asset.became.name}
            </span>
          ) : null
        )}
      </div>
      {/* Now, at each line's right end. */}
      <div className="relative">
        {lines.map((l, i) =>
          l.end === null ? null : (
            <span
              key={i}
              className={`${label} left-0 font-bold text-ink-primary ${l.asset.became ? COUNTED : ""}`}
              style={{ top: `${rights[i]}%` }}
              title="Now"
            >
              <Shown value={l.end} />
            </span>
          )
        )}
      </div>
    </div>
  );
}

/** A side of a trade: its team (yours underlined; whoever's haul is worth the most now on the plate), its pieces' chart, and its totals under it, big. */
function SideColumn({ side, color, ahead, scale }: { side: TradeSide; color: string; ahead: boolean; scale: ChartScale }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="h-2 w-2 shrink-0" style={{ background: color }} aria-hidden />
        <span
          className={`min-w-0 truncate font-bold ${ahead ? "bg-[var(--map-tag)] px-1 text-[var(--map-tag-ink)]" : "text-ink-primary"} ${
            side.mine ? "underline decoration-2 underline-offset-2" : ""
          }`}
          title={ahead ? `${side.team} — worth the most now` : side.team}
        >
          {side.team}
        </span>
      </div>
      {side.got.length > 0 ? <SideChart assets={side.got} scale={scale} /> : null}
      <div className="flex flex-wrap justify-between gap-x-3 text-xs">
        {side.faab > 0 ? <span className="text-ink-muted">${side.faab} FAAB</span> : null}
        {side.got.length === 0 && side.faab === 0 ? <span className="text-ink-muted">Nothing</span> : null}
        {side.added > 0 ? (
          <span className="ml-auto italic text-ink-secondary" title={ADDED}>
            Added value <span className="not-italic tabular-nums">{grade(side.added)}</span>
          </span>
        ) : null}
      </div>
      {/* Each piece at its whole grade, added up — just what's on screen. */}
      <div className="mt-auto flex items-baseline justify-end gap-2 border-t border-border pt-1">
        <span className="text-xs text-ink-muted">Total</span>
        <span className="text-lg tabular-nums text-ink-muted">{grade(side.then + side.added)}</span>
        <span className="text-ink-muted">→</span>
        <span className="text-2xl font-bold tabular-nums text-ink-primary">{grade(side.now + side.added)}</span>
        <span className="text-lg">
          <Change from={side.then + side.added} to={side.now + side.added} />
        </span>
      </div>
    </div>
  );
}

/** One of a trade's two big numbers: how far apart its sides are, in grades, in the color of the side ahead. */
function GapNumber({ label, title, value, color, children }: { label: string; title: string; value: TradeGap; color: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center" title={title}>
      <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="text-3xl font-bold leading-none tabular-nums" style={{ color: value.ahead === null ? "var(--ink-muted)" : color }}>
        {grade(value.gap)}
      </span>
      {children}
    </div>
  );
}

function TradeCard({ trade }: { trade: AnalyzedTrade }) {
  const worth = (s: TradeSide) => s.now + s.added;
  const leader = trade.sides.reduce((best, s) => (worth(s) > worth(best) ? s : best), trade.sides[0]);
  const madeOn = new Date(trade.at);
  const colorOf = (rosterId: number | null) => SIDE_COLORS[Math.max(0, trade.sides.findIndex((s) => s.rosterId === rosterId)) % SIDE_COLORS.length];
  const widestOn = new Date(trade.widest.day * DAY_MS);
  const days = trade.sides[0]?.path.map((p) => p.day) ?? [];
  // One value scale for every side's chart — the trade's lowest value to its highest — so they compare.
  const values = trade.sides.flatMap((side) => side.got.flatMap((a) => a.path.map((p) => p.value).filter((v): v is number => v !== null)));
  const scale: ChartScale = { first: days[0] ?? 0, last: days[days.length - 1] ?? 0, lo: Math.min(...values), hi: Math.max(...values) };
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border border-border p-2 sm:gap-3">
      {/* On the left, when the trade was made; under it, the gap between the sides now, and the widest it's been with when. */}
      <div className="flex min-w-[3.25rem] flex-col items-center gap-3 border-r border-border pr-2 sm:pr-3">
        <span className="text-center text-[0.6875rem] font-semibold uppercase leading-tight tracking-wide text-ink-secondary" title="When the trade was made">
          {madeOn.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          <br />
          {madeOn.getFullYear()}
        </span>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <GapNumber label="Now" title="How far apart the sides are now" value={trade.gap} color={colorOf(trade.gap.ahead)} />
          <GapNumber label="Max" title="The farthest apart the sides have been" value={trade.widest} color={colorOf(trade.widest.ahead)}>
            <span className="mt-0.5 text-center text-[0.625rem] leading-tight text-ink-muted">
              {widestOn.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
              <br />
              {widestOn.getUTCFullYear()}
            </span>
          </GapNumber>
        </div>
      </div>
      <div className={`grid min-w-0 gap-3 ${trade.sides.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {trade.sides.map((side, i) => (
          <SideColumn key={side.rosterId} side={side} color={SIDE_COLORS[i % SIDE_COLORS.length]} ahead={side === leader && side.now > 0} scale={scale} />
        ))}
      </div>
    </li>
  );
}

const FIELD = "min-w-0 border border-border bg-page px-2 py-1 text-xs text-ink-primary outline-none focus:border-ink-primary";

/** Finding trades: by a player, pick or team typed in, a season, a team, and the order they're in. */
function TradeFilters({ trades, filter, onChange }: { trades: AnalyzedTrade[]; filter: TradeFilter; onChange: (next: TradeFilter) => void }) {
  const seasons = useMemo(() => [...new Set(trades.map((t) => t.season))].sort().reverse(), [trades]);
  const teams = useMemo(() => [...new Set(trades.flatMap((t) => t.sides.map((s) => s.team)))].sort((a, b) => a.localeCompare(b)), [trades]);
  const mine = trades.some((t) => t.sides.some((s) => s.mine));
  return (
    <div className="flex flex-wrap gap-2">
      <input
        type="search"
        value={filter.query}
        onChange={(e) => onChange({ ...filter, query: e.target.value })}
        placeholder="Player, pick or team"
        aria-label="Find a player, pick or team"
        className={`${FIELD} flex-[1_1_12rem]`}
      />
      <select aria-label="Season" value={filter.season ?? ""} onChange={(e) => onChange({ ...filter, season: e.target.value || null })} className={FIELD}>
        <option value="">All seasons</option>
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select aria-label="Team" value={filter.team ?? ""} onChange={(e) => onChange({ ...filter, team: e.target.value || null })} className={`${FIELD} max-w-[12rem]`}>
        <option value="">All teams</option>
        {mine ? <option value={MY_TRADES}>My trades</option> : null}
        {teams.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
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

const NO_FILTER: TradeFilter = { query: "", season: null, team: null, sort: "newest" };

/**
 * Every trade in a league, all its seasons, newest first: what each side got, what it was worth when traded
 * and now — in KTC dynasty values (superflex or 1QB, as the league plays), shown as the values page's grades —
 * and each side's haul from the trade to now on a little chart. Filters above find a player's, a season's or a
 * team's, and reorder them.
 */
export function TradeAnalyzer({ leagueId, leagueName, sleeperUserId }: { leagueId: string; leagueName: string; sleeperUserId: string | null }) {
  const data = useLeagueTrades(leagueId, sleeperUserId);
  const [filter, setFilter] = useState<TradeFilter>(NO_FILTER);
  const shown = useMemo(() => (data ? filterTrades(data.trades, filter) : []), [data, filter]);
  const filtered = filter.query.trim() !== "" || filter.season !== null || filter.team !== null;
  return (
    <PlateCard
      title={leagueName}
      aside={data ? <span className="tabular-nums">{filtered ? `${shown.length} of ${data.trades.length}` : data.trades.length} trades</span> : null}
      bodyClassName="p-2 sm:p-3"
    >
      {!data ? (
        <p className="py-4 text-center text-sm text-ink-secondary">Loading trades…</p>
      ) : data.trades.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-secondary">No trades yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <TradeFilters trades={data.trades} filter={filter} onChange={setFilter} />
          {shown.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-secondary">No trades match.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {shown.map((trade) => (
                <TradeCard key={trade.id} trade={trade} />
              ))}
            </ol>
          )}
        </div>
      )}
    </PlateCard>
  );
}
