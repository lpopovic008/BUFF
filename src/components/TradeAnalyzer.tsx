"use client";

import { ReactNode, useMemo, useState } from "react";
import { PlateCard } from "@/components/ui/PlateCard";
import { useLeagueTrades } from "@/hooks/useLeagueTrades";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { AnalyzedTrade, filterTrades, MY_TRADES, TRADE_SORTS, TradeAsset, TradeFilter, TradeGap, TradeSide, TradeSort } from "@/lib/trades";
import { DAY_MS } from "@/lib/value-history";
import { shownGrade, valueGrade } from "@/lib/player-values";

// Each side's color — its swatch by the team's name and its line on the chart.
const SIDE_COLORS = ["var(--ink-primary)", "var(--series-1)", "var(--series-2)", "var(--series-5)"];

const ADDED =
  "KTC's trade calculator's value adjustment: fewer, better pieces are worth more than the plain sum. Each piece counts for more the closer it is to the trade's best, the side ahead that way is ahead by a player worth the difference, and this evens the plain totals out to match. It's held at its value when traded, so the totals since show how lopsided the trade has become";

const ESTIMATED = "KTC had no value for this pick then, so it's read off its round's trend — picks gain value steadily as their draft nears";

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

/** A value, "≈" before it when it's estimated, "–" with none. */
function Shown({ value, estimated = false }: { value: number | null; estimated?: boolean }) {
  return <>{value !== null ? `${estimated ? "≈" : ""}${grade(value)}` : "–"}</>;
}

/** A row's two values: from (muted) → to (bold), in columns lined up row to row. */
function Values({ from, to, fromTitle, toTitle, small = false }: { from: ReactNode; to: ReactNode; fromTitle: string; toTitle: string; small?: boolean }) {
  return (
    <>
      <span className="w-[3ch] shrink-0 text-right tabular-nums text-ink-muted" title={fromTitle}>
        {from}
      </span>
      <span className="text-ink-muted">→</span>
      <span className={`w-[3ch] shrink-0 text-right tabular-nums ${small ? "text-ink-secondary" : "font-bold text-ink-primary"}`} title={toTitle}>
        {to}
      </span>
    </>
  );
}

/**
 * One thing a side got: its name and position, then what it was worth when traded and what it's worth now — a
 * drafted pick, what it was worth when it was used, with the player it became under it, their value from the
 * draft to now.
 */
function AssetRow({ asset }: { asset: TradeAsset }) {
  const position = asset.position === "PICK" ? null : asset.position;
  const became = asset.became;
  return (
    <li className="flex flex-col gap-0.5 text-xs">
      <span className="flex items-baseline gap-2">
        <span className="flex min-w-0 flex-1 items-baseline gap-1">
          <span className="truncate font-semibold text-ink-primary">{asset.label}</span>
          {position ? <span className={`shrink-0 text-[0.625rem] font-semibold ${POSITION_TEXT_COLOR[position] ?? "text-ink-muted"}`}>{position}</span> : null}
          {asset.pickOf ? <span className="min-w-0 truncate text-[0.625rem] text-ink-muted">({asset.pickOf})</span> : null}
        </span>
        <Values
          from={<Shown value={asset.then} estimated={asset.thenEstimated} />}
          fromTitle={asset.thenEstimated ? `When traded — estimated: ${ESTIMATED}` : "When traded"}
          to={became ? <Shown value={asset.atDraft ?? null} estimated={asset.atDraftEstimated} /> : <Shown value={asset.now} estimated={asset.nowEstimated} />}
          toTitle={
            became
              ? asset.atDraftEstimated
                ? `At its draft — estimated: ${ESTIMATED}`
                : "At its draft"
              : asset.nowEstimated
                ? `Now — estimated: ${ESTIMATED}`
                : "Now"
          }
        />
      </span>
      {became ? (
        <span className="flex items-baseline gap-2 pl-2 text-[0.6875rem]">
          <span className="flex min-w-0 flex-1 items-baseline gap-1">
            <span className="text-ink-muted">↳</span>
            <span className="truncate font-semibold text-ink-primary">{became.name}</span>
            {became.position ? <span className={`shrink-0 text-[0.625rem] font-semibold ${POSITION_TEXT_COLOR[became.position] ?? ""}`}>{became.position}</span> : null}
          </span>
          <Values from={<Shown value={became.drafted} />} fromTitle="When drafted" to={<Shown value={became.now} />} toTitle="Now" />
        </span>
      ) : null}
    </li>
  );
}

/** A side of a trade: its team (yours underlined; whoever's haul is worth the most now on the plate), what it got, and its totals. */
function SideColumn({ side, color, ahead }: { side: TradeSide; color: string; ahead: boolean }) {
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
      <ul className="flex flex-col gap-1">
        {side.got.map((asset, i) => (
          <AssetRow key={i} asset={asset} />
        ))}
        {side.faab > 0 ? <li className="text-xs text-ink-muted">${side.faab} FAAB</li> : null}
        {side.got.length === 0 && side.faab === 0 ? <li className="text-xs text-ink-muted">Nothing</li> : null}
        {side.added > 0 ? (
          <li className="flex items-baseline gap-2 text-xs" title={ADDED}>
            <span className="min-w-0 flex-1 truncate italic text-ink-secondary">Added value</span>
            <Values from={grade(side.added)} fromTitle="When traded" to={grade(side.added)} toTitle="Held at its value when traded" small />
          </li>
        ) : null}
      </ul>
      <div className="mt-auto flex items-baseline justify-end gap-2 border-t border-border pt-1 text-xs">
        <span className="text-ink-muted">Total</span>
        <span className="tabular-nums text-ink-muted">{grade(side.then + side.added)}</span>
        <span className="text-ink-muted">→</span>
        <span className="font-bold tabular-nums text-ink-primary">{grade(side.now + side.added)}</span>
        <Change from={side.then + side.added} to={side.now + side.added} />
      </div>
    </div>
  );
}

/** Each side's haul, week by week from the trade to now, a line in its color. */
function TradePath({ sides }: { sides: TradeSide[] }) {
  const first = sides[0]?.path[0]?.day;
  const last = sides[0]?.path[sides[0].path.length - 1]?.day;
  const top = Math.max(1, ...sides.flatMap((s) => s.path.map((p) => p.value)));
  if (first === undefined || last === undefined || last <= first) return null;
  const x = (day: number) => ((day - first) / (last - first)) * 100;
  const y = (value: number) => 38 - (value / top) * 36;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-12 w-full" role="img" aria-label="Each side's value from the trade to now">
      <line x1={0} x2={100} y1={38} y2={38} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {sides.map((s, i) => (
        <polyline
          key={s.rosterId}
          points={s.path.map((p) => `${x(p.day)},${y(p.value)}`).join(" ")}
          fill="none"
          stroke={SIDE_COLORS[i % SIDE_COLORS.length]}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
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
  const date = new Date(trade.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const colorOf = (rosterId: number | null) => SIDE_COLORS[Math.max(0, trade.sides.findIndex((s) => s.rosterId === rosterId)) % SIDE_COLORS.length];
  const widestOn = new Date(trade.widest.day * DAY_MS);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border border-border p-2 sm:gap-3">
      {/* On the left, the gap between the sides now, and the widest it's been with when. */}
      <div className="flex min-w-[3.25rem] flex-col items-center gap-3 border-r border-border pr-2 sm:pr-3">
        <GapNumber label="Now" title="How far apart the sides are now" value={trade.gap} color={colorOf(trade.gap.ahead)} />
        <GapNumber label="Max" title="The farthest apart the sides have been" value={trade.widest} color={colorOf(trade.widest.ahead)}>
          <span className="mt-0.5 text-center text-[0.625rem] leading-tight text-ink-muted">
            {widestOn.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
            <br />
            {widestOn.getUTCFullYear()}
          </span>
        </GapNumber>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline justify-between text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
          <span>{date}</span>
          <span className="font-normal normal-case">then → now</span>
        </div>
        <div className={`grid gap-3 ${trade.sides.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {trade.sides.map((side, i) => (
            <SideColumn key={side.rosterId} side={side} color={SIDE_COLORS[i % SIDE_COLORS.length]} ahead={side === leader && side.now > 0} />
          ))}
        </div>
        <TradePath sides={trade.sides} />
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
