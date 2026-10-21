"use client";

import { ReactNode } from "react";
import { PlateCard } from "@/components/ui/PlateCard";
import { useLeagueTrades } from "@/hooks/useLeagueTrades";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { AnalyzedTrade, TradeAsset, TradeSide } from "@/lib/trades";
import { shownGrade, valueGrade } from "@/lib/player-values";

// Each side's color — its swatch by the team's name and its line on the chart.
const SIDE_COLORS = ["var(--ink-primary)", "var(--series-1)", "var(--series-2)", "var(--series-5)"];

const ADDED =
  "KTC's trade calculator's value adjustment: fewer, better pieces are worth more than the plain sum. Each piece counts for more the closer it is to the trade's best, the side ahead that way is ahead by a player worth the difference, and this evens the plain totals out to match";

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
        {side.addedThen > 0 || side.addedNow > 0 ? (
          <li className="flex items-baseline gap-2 text-xs" title={ADDED}>
            <span className="min-w-0 flex-1 truncate italic text-ink-secondary">Added value</span>
            <Values from={grade(side.addedThen)} fromTitle="When traded" to={grade(side.addedNow)} toTitle="Now" small />
          </li>
        ) : null}
      </ul>
      <div className="mt-auto flex items-baseline justify-end gap-2 border-t border-border pt-1 text-xs">
        <span className="text-ink-muted">Total</span>
        <span className="tabular-nums text-ink-muted">{grade(side.then + side.addedThen)}</span>
        <span className="text-ink-muted">→</span>
        <span className="font-bold tabular-nums text-ink-primary">{grade(side.now + side.addedNow)}</span>
        <Change from={side.then + side.addedThen} to={side.now + side.addedNow} />
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

function TradeCard({ trade }: { trade: AnalyzedTrade }) {
  const worth = (s: TradeSide) => s.now + s.addedNow;
  const leader = trade.sides.reduce((best, s) => (worth(s) > worth(best) ? s : best), trade.sides[0]);
  const date = new Date(trade.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <li className="flex flex-col gap-2 border border-border p-2">
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
    </li>
  );
}

/**
 * Every trade in a league, all its seasons, newest first: what each side got, what it was worth when traded
 * and now — in KTC dynasty values (superflex or 1QB, as the league plays), shown as the values page's grades —
 * and each side's haul from the trade to now on a little chart.
 */
export function TradeAnalyzer({ leagueId, leagueName, sleeperUserId }: { leagueId: string; leagueName: string; sleeperUserId: string | null }) {
  const data = useLeagueTrades(leagueId, sleeperUserId);
  return (
    <PlateCard
      title={leagueName}
      aside={data ? <span className="tabular-nums">{data.trades.length} trades</span> : null}
      bodyClassName="p-2 sm:p-3"
    >
      {!data ? (
        <p className="py-4 text-center text-sm text-ink-secondary">Loading trades…</p>
      ) : data.trades.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-secondary">No trades yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {data.trades.map((trade) => (
            <TradeCard key={trade.id} trade={trade} />
          ))}
        </ol>
      )}
    </PlateCard>
  );
}
