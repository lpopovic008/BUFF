import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { LeagueMoney } from "@/lib/league-money";
import { formatRecord } from "@/lib/format";

function money(n: number): string {
  return `$${n}`;
}

/** Earnings leaderboard. One series, so the title names it and no legend is needed. */
function EarningsChart({ money: m }: { money: LeagueMoney }) {
  const managers = m.ledger.managers;
  const max = Math.max(1, ...managers.map((x) => x.total));
  return (
    <div className="flex flex-col gap-2">
      {managers.map((mgr) => {
        const pct = (mgr.total / max) * 100;
        return (
          <div key={mgr.rosterId} className="flex items-center gap-3">
            <div className="w-20 shrink-0 truncate text-sm text-ink-secondary" title={mgr.name}>
              {mgr.name}
            </div>
            <div className="relative h-5 flex-1 overflow-hidden bg-page">
              <div
                className="h-full bg-series-1 transition-[width] duration-500"
                style={{ width: `${Math.max(pct, 1.5)}%` }}
              />
            </div>
            <div className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-primary">
              {money(mgr.total)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The sheet's week grid: rows are managers, columns are weeks, cells are dollars. */
function WeekGrid({ money: m }: { money: LeagueMoney }) {
  const weeks = Array.from({ length: m.profile.payouts.regularSeasonWeeks }, (_, i) => i + 1);
  const highScore = m.profile.payouts.weeklyHighScore;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-muted">
              <th className="sticky left-0 z-10 bg-surface-raised py-2 pr-3 text-left font-medium">
                Manager
              </th>
              {weeks.map((w) => (
                <th key={w} className="px-1.5 py-2 text-center font-medium tabular-nums">
                  {w}
                </th>
              ))}
              <th className="py-2 pl-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {m.ledger.managers.map((mgr) => (
              <tr key={mgr.rosterId}>
                <td className="sticky left-0 z-10 truncate border-t border-grid bg-surface-raised py-2 pr-3 font-medium text-ink-primary">
                  {mgr.name}
                </td>
                {weeks.map((w) => {
                  const amount = mgr.weekly[w];
                  const played = m.ledger.weeksPlayed.includes(w);
                  const isHigh = amount === highScore;
                  return (
                    <td
                      key={w}
                      className="border-t border-grid px-1.5 py-2 text-center tabular-nums"
                      title={
                        played
                          ? `Week ${w}: ${money(amount ?? 0)}${isHigh ? " (high score)" : ""}`
                          : `Week ${w}: not played yet`
                      }
                    >
                      {!played ? (
                        <span className="text-ink-muted">·</span>
                      ) : isHigh ? (
                        <span className="bg-series-1/12 px-1.5 py-0.5 font-semibold text-series-1">
                          {money(amount)}
                        </span>
                      ) : amount > 0 ? (
                        <span className="text-ink-primary">{money(amount)}</span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="border-t border-grid py-2 pl-3 text-right font-semibold tabular-nums text-ink-primary">
                  {money(mgr.weeklyTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-series-1/12 px-1.5 py-0.5 font-semibold text-series-1">
            {money(highScore)}
          </span>
          week&rsquo;s high score
        </span>
        <span>
          {money(m.profile.payouts.perWin)} a win · <span className="text-ink-muted">—</span> no
          money · <span className="text-ink-muted">·</span> not played
        </span>
      </div>
    </div>
  );
}

export function MoneyBoard({ money: m }: { money: LeagueMoney }) {
  const { ledger, profile } = m;
  const rules = profile.payouts;
  const weeksLeft = rules.regularSeasonWeeks - ledger.weeksPlayed.length;
  const weeklyLeft = ledger.reconciliation.projectedWeekly - ledger.paidToDate;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Total pot" value={money(ledger.reconciliation.pot)} sublabel={`${money(rules.buyIn)} × ${ledger.managers.length}`} />
        <StatTile
          label="Paid out"
          value={money(ledger.paidToDate)}
          sublabel={`through week ${ledger.weeksPlayed.at(-1) ?? 0}`}
        />
        <StatTile
          label="Weekly left"
          value={money(weeklyLeft)}
          sublabel={`${weeksLeft} week${weeksLeft === 1 ? "" : "s"} to play`}
        />
        <StatTile
          label="Held for top 3"
          value={money(ledger.reconciliation.finalTotal)}
          sublabel={rules.finalPayouts.map((p) => money(p.amount)).join(" / ")}
        />
      </div>

      {!ledger.reconciliation.balances ? (
        <Card className="border-status-critical/30 bg-status-critical/5 p-4">
          <p className="text-sm text-ink-primary">
            <span className="font-semibold text-status-critical">⚠ Payout rules don&rsquo;t balance.</span>{" "}
            The pot is {money(ledger.reconciliation.pot)}, but the rules commit{" "}
            {money(ledger.reconciliation.projectedWeekly)} in weekly commission plus{" "}
            {money(ledger.reconciliation.finalTotal)} to the top 3 —{" "}
            {ledger.reconciliation.unallocated > 0
              ? `${money(ledger.reconciliation.unallocated)} is unassigned.`
              : `that overspends by ${money(-ledger.reconciliation.unallocated)}.`}
          </p>
        </Card>
      ) : null}

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Season earnings
        </h3>
        <EarningsChart money={m} />
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Week by week
        </h3>
        <p className="mb-4 text-xs text-ink-secondary">
          {money(rules.perWin)} per win, {money(rules.weeklyHighScore)} to the week&rsquo;s high
          scorer
          {rules.highScoreStacks ? " (stacking with the win)" : " (instead of the win, never both)"}
          , weeks 1&ndash;{rules.regularSeasonWeeks}.
        </p>
        <WeekGrid money={m} />
      </Card>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Record &amp; high scores
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-grid text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3 font-medium">Manager</th>
                <th className="py-2 pr-3 text-right font-medium">Record</th>
                <th className="py-2 pr-3 text-right font-medium">Points for</th>
                <th className="py-2 pr-3 text-right font-medium">High-score weeks</th>
                <th className="py-2 pr-3 text-right font-medium">Earned</th>
              </tr>
            </thead>
            <tbody>
              {ledger.managers.map((mgr) => (
                <tr key={mgr.rosterId} className="border-b border-grid last:border-0">
                  <td className="py-2 pr-3 font-medium text-ink-primary">{mgr.name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                    {formatRecord(mgr.wins, mgr.losses, mgr.ties)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                    {mgr.pointsFor.toFixed(2)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                    {mgr.highScoreWeeks.length > 0 ? mgr.highScoreWeeks.join(", ") : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums text-ink-primary">
                    {money(mgr.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
