"use client";

import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { PayoutSetup } from "@/components/PayoutSetup";
import { LeagueSeason } from "@/lib/league-money";
import {
  awardInfo,
  describeRecipients,
  formatMoney as money,
  PayoutPlan,
  PlanLedger,
  RulePayment,
} from "@/lib/payout-plan";

// The grid's fixed columns (in rem); the weeks share whatever's left equally,
// regular season and playoffs alike, so the grid reads like a calendar. On
// narrow screens each week keeps at least MIN_WEEK_REM and the grid scrolls.
const MANAGER_REM = 8;
const MONEY_COL_REM = 4.25;
const MIN_WEEK_REM = 2.75;

/**
 * The week grid: rows are managers, columns are the season's weeks (regular
 * season, then playoffs, per Sleeper's schedule) and the season-end awards;
 * cells are dollars. Behind each row runs a bar for that manager's season
 * earnings so far. The week in progress is shaded: its amounts update live
 * as games are scored, but aren't settled until the week is over.
 */
function WeekGrid({
  ledger,
  plan,
  regularSeasonWeeks,
  lastWeek,
  currentWeek,
}: {
  ledger: PlanLedger;
  plan: PayoutPlan;
  regularSeasonWeeks: number;
  lastWeek: number;
  currentWeek: number | null;
}) {
  const ruleText = new Map(plan.rules.map((r) => [r.id, describeRecipients(r)]));
  const highScoreRules = new Set(plan.rules.filter((r) => r.award === "weekHighScore").map((r) => r.id));
  const breakdown = (payments: RulePayment[] | undefined) =>
    (payments ?? []).map((p) => `${money(p.amount)} for ${ruleText.get(p.ruleId) ?? "a rule"}`).join("; ");
  const hasSeasonRules = plan.rules.some((r) => awardInfo(r.award).timing === "season");
  const seasonDecided = ledger.seasonOver || ledger.regularSeasonOver;

  const weeks = Array.from({ length: Math.max(lastWeek, ...ledger.weeks) }, (_, i) => i + 1);
  const isPlayoff = (w: number) => w > regularSeasonWeeks;
  const playoffCount = weeks.filter(isPlayoff).length;
  const live = !ledger.seasonOver && currentWeek != null && weeks.includes(currentWeek) ? currentWeek : null;
  const maxTotal = Math.max(0, ...ledger.managers.map((m) => m.total));
  // The shading for the week in progress, and the earnings bars: the theme's
  // ink at low opacity, so the numbers stay readable on top in either theme.
  const LIVE_BG = "bg-[color-mix(in_srgb,var(--map-tag)_9%,transparent)]";
  const firstPlayoff = regularSeasonWeeks + 1;

  return (
    <div>
      <div className="overflow-x-auto">
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-sm"
          style={{ minWidth: `${MANAGER_REM + weeks.length * MIN_WEEK_REM + (hasSeasonRules ? 3 : 2) * MONEY_COL_REM}rem` }}
        >
          <colgroup>
            <col style={{ width: `${MANAGER_REM}rem` }} />
            {weeks.map((w) => (
              <col key={w} />
            ))}
            {hasSeasonRules ? <col style={{ width: `${MONEY_COL_REM}rem` }} /> : null}
            <col style={{ width: `${MONEY_COL_REM}rem` }} />
            <col style={{ width: `${MONEY_COL_REM}rem` }} />
          </colgroup>
          <thead>
            {playoffCount > 0 ? (
              <tr className="text-[0.625rem] uppercase tracking-wide text-ink-muted">
                <th className="sticky left-0 z-10 bg-surface-raised" />
                <th colSpan={regularSeasonWeeks} className="pb-0.5 text-center font-medium">
                  Regular season
                </th>
                <th colSpan={playoffCount} className="border-l border-grid pb-0.5 text-center font-medium">
                  Playoffs
                </th>
                <th colSpan={hasSeasonRules ? 3 : 2} />
              </tr>
            ) : null}
            <tr className="text-xs uppercase tracking-wide text-ink-muted">
              <th className="sticky left-0 z-10 bg-surface-raised py-2 pr-3 text-left font-medium">Manager</th>
              {weeks.map((w) => (
                <th
                  key={w}
                  className={`px-1 py-2 text-center font-medium tabular-nums ${w === firstPlayoff ? "border-l border-grid" : ""} ${
                    w === live ? LIVE_BG : ""
                  }`}
                  title={w === live ? `Week ${w} is in progress: its payouts update live and aren’t final yet` : undefined}
                >
                  {w === live ? (
                    <span className="flex flex-col items-center leading-tight">
                      <span className="bg-[var(--map-tag)] px-1 font-bold text-[var(--map-tag-ink)]">{w}</span>
                      <span className="mt-0.5 text-[0.5625rem] font-semibold tracking-wider">Live</span>
                    </span>
                  ) : (
                    w
                  )}
                </th>
              ))}
              {hasSeasonRules ? <th className="px-1.5 py-2 text-center font-medium">Season</th> : null}
              <th className="py-2 pl-3 text-right font-medium">Total</th>
              <th className="py-2 pl-3 text-right font-medium" title="Total won, less the buy-in">
                Net
              </th>
            </tr>
          </thead>
          <tbody>
            {ledger.managers.map((mgr) => (
              <tr key={mgr.rosterId}>
                <td className="sticky left-0 z-10 truncate border-t border-grid bg-surface-raised py-2 pr-3 font-medium text-ink-primary">
                  {mgr.name}
                </td>
                {weeks.map((w, i) => {
                  const amount = mgr.weekly[w] ?? 0;
                  const played = ledger.weeksPlayed.includes(w);
                  const detail = mgr.weeklyDetail[w];
                  const isHigh = (detail ?? []).some((p) => highScoreRules.has(p.ruleId));
                  const pending = w === live;
                  return (
                    <td
                      key={w}
                      className={`relative border-t border-grid px-1 py-2 text-center tabular-nums ${
                        w === firstPlayoff ? "border-l" : ""
                      } ${pending ? LIVE_BG : ""}`}
                      title={
                        !played
                          ? `Week ${w}: not played yet`
                          : `Week ${w}${pending ? " (in progress, not final)" : ""}: ${amount > 0 ? breakdown(detail) : "nothing"}`
                      }
                    >
                      {i === 0 && maxTotal > 0 ? (
                        // This manager's season earnings, as a bar behind the row's weeks.
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-1.5 left-0 z-0 bg-[color-mix(in_srgb,var(--map-tag)_10%,transparent)] transition-[width] duration-500"
                          // Every week column is the same width, so the full bar is that many of this first cell.
                          style={{ width: `${(mgr.total / maxTotal) * weeks.length * 100}%` }}
                        />
                      ) : null}
                      <span className={`relative z-[1] ${pending ? "italic" : ""}`}>
                        {!played ? (
                          <span className="text-ink-muted">·</span>
                        ) : isHigh ? (
                          <span className="bg-series-1/12 px-1.5 py-0.5 font-semibold text-series-1">{money(amount)}</span>
                        ) : amount > 0 ? (
                          <span className="text-ink-primary">{money(amount)}</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </span>
                    </td>
                  );
                })}
                {hasSeasonRules ? (
                  <td
                    className="border-t border-grid px-1.5 py-2 text-center tabular-nums"
                    title={mgr.seasonEnd > 0 ? breakdown(mgr.seasonDetail) : seasonDecided ? "No season-end award" : "Decided at season’s end"}
                  >
                    {mgr.seasonEnd > 0 ? (
                      <span className="font-semibold text-ink-primary">{money(mgr.seasonEnd)}</span>
                    ) : seasonDecided ? (
                      <span className="text-ink-muted">—</span>
                    ) : (
                      <span className="text-ink-muted">·</span>
                    )}
                  </td>
                ) : null}
                <td className="border-t border-grid py-2 pl-3 text-right font-semibold tabular-nums text-ink-primary">{money(mgr.total)}</td>
                <td
                  className={`border-t border-grid py-2 pl-3 text-right tabular-nums ${
                    mgr.net > 0 ? "text-status-good" : mgr.net < 0 ? "text-status-critical" : "text-ink-muted"
                  }`}
                >
                  {mgr.net > 0 ? "+" : mgr.net < 0 ? "−" : ""}
                  {money(Math.abs(mgr.net))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-secondary">
        {highScoreRules.size > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-series-1/12 px-1.5 py-0.5 font-semibold text-series-1">$</span>
            includes a weekly high-score payout
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 bg-[color-mix(in_srgb,var(--map-tag)_10%,transparent)]" />
          season earnings so far
        </span>
        {live ? (
          <span className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 ${LIVE_BG}`} />
            week {live}: in progress, payouts update live and aren’t final
          </span>
        ) : null}
        <span>
          <span className="text-ink-muted">—</span> no money · <span className="text-ink-muted">·</span> not played yet · hover a
          cell for what it paid
        </span>
      </div>
    </div>
  );
}

export function MoneyBoard({
  season,
  plan,
  ledger,
  currentWeek,
  onPlanChange,
}: {
  season: LeagueSeason;
  plan: PayoutPlan;
  /** The NFL week in progress, shaded in the grid as not final yet. */
  currentWeek: number | null;
  /** computePlanLedger(plan, season.results), computed by the page (the standings table reads it too). */
  ledger: PlanLedger;
  onPlanChange: (plan: PayoutPlan) => void;
}) {
  const lastPlayed = ledger.weeksPlayed.at(-1) ?? 0;
  const stillToPay = Math.max(0, ledger.committed - ledger.paidToDate);
  const seasonPrizes = ledger.budgets
    .filter((b) => awardInfo(plan.rules.find((r) => r.id === b.ruleId)!.award).timing === "season")
    .reduce((s, b) => s + b.projected, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Total pot" value={money(ledger.pot)} sublabel={`${season.results.rosterIds.length} buy-ins`} />
        <StatTile label="Paid out" value={money(ledger.paidToDate)} sublabel={lastPlayed ? `through week ${lastPlayed}` : "nothing played yet"} />
        <StatTile label="Still to pay" value={money(stillToPay)} sublabel="by the rules below" />
        <StatTile label="Season-end prizes" value={money(seasonPrizes)} sublabel={ledger.seasonOver ? "paid out" : "decided at season’s end"} />
      </div>

      <PayoutSetup plan={plan} season={season.results} ledger={ledger} onChange={onPlanChange} />

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Week by week</h3>
        <WeekGrid
          ledger={ledger}
          plan={plan}
          regularSeasonWeeks={season.results.regularSeasonWeeks}
          lastWeek={season.results.lastWeek}
          currentWeek={currentWeek}
        />
      </Card>

    </div>
  );
}
