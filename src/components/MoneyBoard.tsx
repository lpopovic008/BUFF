"use client";

import { Card } from "@/components/ui/Card";
import { useState } from "react";
import { PayoutSetup } from "@/components/PayoutSetup";
import { paymentSwatch, placeSwatch, ruleSwatches } from "@/lib/payout-colors";
import { LeagueSeason } from "@/lib/league-money";
import {
  awardInfo,
  describeRecipients,
  formatMoney as money,
  PayoutPlan,
  ordinal,
  PayoutRule,
  podiumSplit,
  PlanLedger,
  RulePayment,
} from "@/lib/payout-plan";

// The grid's fixed columns (in rem); the weeks share whatever's left equally,
// regular season and playoffs alike, so the grid reads like a calendar. On
// narrow screens each week keeps at least MIN_WEEK_REM and the grid scrolls.
const MANAGER_REM = 8;
const MONEY_COL_REM = 3.75;
const MIN_WEEK_REM = 2;

const RULE_GROUPS = ["Regular season", "Playoffs", "Season"] as const;

/** Which legend heading a rule sits under: weekly rules by the weeks they pay, everything judged once under Season. */
function ruleGroup(rule: PayoutRule, regularSeasonWeeks: number): (typeof RULE_GROUPS)[number] {
  if (awardInfo(rule.award).timing === "season") return "Season";
  return rule.fromWeek > regularSeasonWeeks ? "Playoffs" : "Regular season";
}

/**
 * A rule for the legend, as briefly as it can be said: "$20 to the week's
 * highest scorer". The heading it sits under says when; weeks are only
 * spelled out when a rule doesn't cover its whole stretch.
 */
function legendLine(rule: PayoutRule, ledger: PlanLedger, regularSeasonWeeks: number): string {
  const per = ledger.budgets.find((b) => b.ruleId === rule.id)?.perPayout ?? 0;
  const amount =
    rule.amountKind === "dollars"
      ? money(rule.amount)
      : rule.amountKind === "percent"
        ? `${rule.amount}% of the pot (${money((ledger.pot * rule.amount) / 100)})`
        : `The rest of the pot (about ${money(per)})`;
  if (rule.award === "podium") {
    return `${amount} for the podium: ${podiumSplit(rule)
      .map((pct, k) => `${ordinal(k + 1)} ${+pct.toFixed(2)}% (${money((per * pct) / 100)})`)
      .join(" · ")}`;
  }
  const weekly = awardInfo(rule.award).timing === "weekly";
  const fullStretch = rule.fromWeek > regularSeasonWeeks || (rule.fromWeek <= 1 && rule.toWeek >= regularSeasonWeeks);
  const weeks =
    weekly && !fullStretch
      ? rule.fromWeek === rule.toWeek
        ? ` (week ${rule.fromWeek})`
        : ` (weeks ${rule.fromWeek}–${rule.toWeek})`
      : "";
  return `${amount} to ${describeRecipients(rule)}${weeks}`;
}

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
  teamNames,
}: {
  ledger: PlanLedger;
  plan: PayoutPlan;
  regularSeasonWeeks: number;
  lastWeek: number;
  currentWeek: number | null;
  /** Team names by roster; each manager's row shows the team name over the username. */
  teamNames: Map<number, string>;
}) {
  const ruleText = new Map(plan.rules.map((r) => [r.id, describeRecipients(r)]));
  const swatches = ruleSwatches(plan.rules, regularSeasonWeeks);
  /** A paid amount, in the color of the rule that paid the most of it. */
  const paid = (amount: number, payments: RulePayment[] | undefined, bold = false) => {
    const top = [...(payments ?? [])].sort((a, b) => b.amount - a.amount)[0];
    const c = top ? paymentSwatch(top, swatches) : undefined;
    return c ? (
      <span
        className={`px-1 py-0.5 ${bold ? "font-bold" : "font-semibold"}`}
        style={{ backgroundColor: c.bg, color: c.ink }}
      >
        {money(amount)}
      </span>
    ) : (
      <span className="text-ink-primary">{money(amount)}</span>
    );
  };
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
          className="w-full table-fixed border-separate border-spacing-0 text-xs xl:text-sm"
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
                  className={`px-0.5 py-2 text-center font-medium tabular-nums ${w === firstPlayoff ? "border-l border-grid" : ""} ${
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
                {/* Team name over the Sleeper username, smaller — as the standings table had it. */}
                <td className="sticky left-0 z-10 border-t border-grid bg-surface-raised py-1.5 pr-3">
                  <div className="truncate font-medium text-ink-primary">{teamNames.get(mgr.rosterId) ?? mgr.name}</div>
                  <div className="truncate text-[0.6875rem] leading-tight text-ink-muted">{mgr.name}</div>
                </td>
                {weeks.map((w, i) => {
                  const amount = mgr.weekly[w] ?? 0;
                  const played = ledger.weeksPlayed.includes(w);
                  const detail = mgr.weeklyDetail[w];
                  const pending = w === live;
                  return (
                    <td
                      key={w}
                      className={`relative border-t border-grid px-0.5 py-2 text-center tabular-nums ${
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
                        ) : amount > 0 ? (
                          paid(amount, detail)
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
                      paid(mgr.seasonEnd, mgr.seasonDetail, true)
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
      {plan.rules.length ? (
        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
          {RULE_GROUPS.map((group) => {
            const rules = plan.rules.filter((r) => ruleGroup(r, regularSeasonWeeks) === group);
            return (
              <div key={group} className={`min-w-0 ${rules.length ? "" : "max-md:hidden"}`}>
                <h4 className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-muted">{group}</h4>
                {rules.length ? (
                  <ol className="flex flex-col gap-1">
                    {rules.map((r) => (
                      <li key={r.id} className="flex items-start gap-2 text-xs text-ink-primary">
                        {r.award === "podium" ? (
                          <span className="mt-0.5 flex shrink-0 gap-0.5" aria-hidden>
                            {podiumSplit(r)
                              .slice(0, 3)
                              .map((_, k) => (
                                <span key={k} className="h-3 w-3" style={{ backgroundColor: placeSwatch(k + 1)!.bg }} />
                              ))}
                          </span>
                        ) : (
                          <span className="mt-0.5 h-3 w-3 shrink-0" style={{ backgroundColor: swatches.get(r.id)!.bg }} aria-hidden />
                        )}
                        <span>{legendLine(r, ledger, regularSeasonWeeks)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-ink-muted">None</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-secondary">No payout rules yet. Use Edit rules below to set them up.</p>
      )}
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
  /** computePlanLedger(plan, season.results), computed by the page. */
  ledger: PlanLedger;
  onPlanChange: (plan: PayoutPlan) => void;
}) {
  const [editing, setEditing] = useState(false);
  const balanced = Math.abs(ledger.unallocated) < 0.005;
  const stillToPay = Math.max(0, ledger.committed - ledger.paidToDate);
  const seasonPrizes = ledger.budgets
    .filter((b) => awardInfo(plan.rules.find((r) => r.id === b.ruleId)!.award).timing === "season")
    .reduce((s, b) => s + b.projected, 0);

  const totals: [string, number][] = [
    ["Total pot", ledger.pot],
    ["Paid out", ledger.paidToDate],
    ["Still to pay", stillToPay],
    ["Season-end prizes", seasonPrizes],
  ];

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Payouts</h2>
      <WeekGrid
        ledger={ledger}
        plan={plan}
        regularSeasonWeeks={season.results.regularSeasonWeeks}
        lastWeek={season.results.lastWeek}
        currentWeek={currentWeek}
        teamNames={season.teamNames}
      />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-grid pt-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-8">
          {totals.map(([label, amount]) => (
            <div key={label}>
              <dt className="text-[0.625rem] font-semibold uppercase tracking-wider text-ink-muted">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums text-ink-primary">{money(amount)}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-expanded={editing}
          className="bg-[var(--map-tag)] px-3 py-1.5 text-sm font-semibold text-[var(--map-tag-ink)] hover:opacity-90"
        >
          {editing ? "Done editing" : "Edit rules"}
        </button>
      </div>
      {plan.rules.length > 0 && !balanced ? (
        <p className="mt-2 text-xs tabular-nums text-status-critical">
          {ledger.unallocated > 0
            ? `${money(ledger.unallocated)} of the pot isn’t paid out by any rule`
            : `The rules pay out ${money(-ledger.unallocated)} more than the pot`}
        </p>
      ) : null}
      {editing ? (
        <div className="mt-4 border-t border-grid pt-4">
          <PayoutSetup plan={plan} season={season.results} ledger={ledger} onChange={onPlanChange} embedded />
        </div>
      ) : null}
    </Card>
  );
}
