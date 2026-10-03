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

/** Earnings leaderboard. One series, so the title names it and no legend is needed. */
function EarningsChart({ ledger }: { ledger: PlanLedger }) {
  const max = Math.max(1, ...ledger.managers.map((x) => x.total));
  return (
    <div className="flex flex-col gap-2">
      {ledger.managers.map((mgr) => {
        const pct = (mgr.total / max) * 100;
        return (
          <div key={mgr.rosterId} className="flex items-center gap-3">
            <div className="w-20 shrink-0 truncate text-sm text-ink-secondary" title={mgr.name}>
              {mgr.name}
            </div>
            <div className="relative h-5 flex-1 overflow-hidden bg-page">
              <div className="h-full bg-series-1 transition-[width] duration-500" style={{ width: `${Math.max(pct, 1.5)}%` }} />
            </div>
            <div className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-primary">{money(mgr.total)}</div>
          </div>
        );
      })}
    </div>
  );
}

/** The week grid: rows are managers, columns are weeks then the season-end awards, cells are dollars. */
function WeekGrid({ ledger, plan }: { ledger: PlanLedger; plan: PayoutPlan }) {
  const ruleText = new Map(plan.rules.map((r) => [r.id, describeRecipients(r)]));
  const highScoreRules = new Set(plan.rules.filter((r) => r.award === "weekHighScore").map((r) => r.id));
  const breakdown = (payments: RulePayment[] | undefined) =>
    (payments ?? []).map((p) => `${money(p.amount)} for ${ruleText.get(p.ruleId) ?? "a rule"}`).join("; ");
  const hasSeasonRules = plan.rules.some((r) => awardInfo(r.award).timing === "season");
  const seasonDecided = ledger.seasonOver || ledger.regularSeasonOver;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[45rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-muted">
              <th className="sticky left-0 z-10 bg-surface-raised py-2 pr-3 text-left font-medium">Manager</th>
              {ledger.weeks.map((w) => (
                <th key={w} className="px-1.5 py-2 text-center font-medium tabular-nums">
                  {w}
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
                {ledger.weeks.map((w) => {
                  const amount = mgr.weekly[w] ?? 0;
                  const played = ledger.weeksPlayed.includes(w);
                  const detail = mgr.weeklyDetail[w];
                  const isHigh = (detail ?? []).some((p) => highScoreRules.has(p.ruleId));
                  return (
                    <td
                      key={w}
                      className="border-t border-grid px-1.5 py-2 text-center tabular-nums"
                      title={played ? `Week ${w}: ${amount > 0 ? breakdown(detail) : "nothing"}` : `Week ${w}: not played yet`}
                    >
                      {!played ? (
                        <span className="text-ink-muted">·</span>
                      ) : isHigh ? (
                        <span className="bg-series-1/12 px-1.5 py-0.5 font-semibold text-series-1">{money(amount)}</span>
                      ) : amount > 0 ? (
                        <span className="text-ink-primary">{money(amount)}</span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
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
  onPlanChange,
}: {
  season: LeagueSeason;
  plan: PayoutPlan;
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

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Season earnings</h3>
        <EarningsChart ledger={ledger} />
      </Card>

      <PayoutSetup plan={plan} season={season.results} ledger={ledger} onChange={onPlanChange} />

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Week by week</h3>
        <WeekGrid ledger={ledger} plan={plan} />
      </Card>

    </div>
  );
}
