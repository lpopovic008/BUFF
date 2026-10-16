"use client";

import { Card } from "@/components/ui/Card";
import { useState } from "react";
import { PayoutSetup } from "@/components/PayoutSetup";
import { BoardRow, CUBE_TOP, PayoutBoard } from "@/components/PayoutBoard";
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

const RULE_GROUPS = ["Regular season", "Playoffs", "Season"] as const;

/** Which legend heading a rule sits under: weekly rules by the weeks they pay, everything judged once under Season. */
function ruleGroup(rule: PayoutRule, regularSeasonWeeks: number): (typeof RULE_GROUPS)[number] {
  if (awardInfo(rule.award).timing === "season") return "Season";
  return rule.fromWeek > regularSeasonWeeks ? "Playoffs" : "Regular season";
}

/** An amount as the board shows it on a cube's top: bold, in the map tags' ink, on the cube's top face. */
function AmountPlate({ amount }: { amount: number }) {
  return (
    <span className="shrink-0 px-1 font-bold tabular-nums text-[var(--map-tag-ink)]" style={{ backgroundColor: CUBE_TOP }}>
      {money(amount)}
    </span>
  );
}

/**
 * A rule for the legend, as briefly as it can be said: what one of its
 * cubes is worth, as it reads on the board, then who it goes to — "[$20] to
 * the week's highest scorer", or for the podium "[$180] 1st [$108] 2nd
 * [$72] 3rd". Where the amount comes from the pot, that's said after. The
 * heading it sits under says when; weeks are only spelled out when a rule
 * doesn't cover its whole stretch.
 */
function LegendLine({ rule, ledger, regularSeasonWeeks }: { rule: PayoutRule; ledger: PlanLedger; regularSeasonWeeks: number }) {
  const per = rule.amountKind === "dollars" ? rule.amount : (ledger.budgets.find((b) => b.ruleId === rule.id)?.perPayout ?? 0);
  const source = rule.amountKind === "percent" ? `${rule.amount}% of the pot` : rule.amountKind === "remainder" ? "the rest of the pot" : null;
  if (rule.award === "podium") {
    return (
      <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-ink-primary">
        {podiumSplit(rule).map((pct, k) => (
          <span key={k} className="flex items-baseline gap-1">
            <AmountPlate amount={(per * pct) / 100} />
            {ordinal(k + 1)}
          </span>
        ))}
        {source ? <span className="text-ink-muted">{source}</span> : null}
      </li>
    );
  }
  const weekly = awardInfo(rule.award).timing === "weekly";
  const fullStretch = rule.fromWeek > regularSeasonWeeks || (rule.fromWeek <= 1 && rule.toWeek >= regularSeasonWeeks);
  const weeks =
    weekly && !fullStretch
      ? rule.fromWeek === rule.toWeek
        ? ` (week ${rule.fromWeek})`
        : ` (weeks ${rule.fromWeek}–${rule.toWeek})`
      : "";
  return (
    <li className="flex items-baseline gap-2 text-xs text-ink-primary">
      <AmountPlate amount={per} />
      <span>
        to {describeRecipients(rule)}
        {weeks}
        {source ? <span className="text-ink-muted"> · {source}</span> : null}
      </span>
    </li>
  );
}

/**
 * The week grid, drawn as a board in 3D (see PayoutBoard): rows are managers,
 * columns are the season's weeks (regular season, then playoffs, per
 * Sleeper's schedule) and the season-end awards; every payout is a cube
 * with its amount on top, and each manager's cubes stack into a bar. The week
 * in progress, when it's counted ("as it stands"), is shaded: its amounts
 * update live as games are scored, but aren't settled until the week is over.
 * Under it, the legend: each rule, with what one of its cubes is worth.
 */
function WeekGrid({
  ledger,
  plan,
  regularSeasonWeeks,
  lastWeek,
  currentWeek,
  finishedThrough,
  teamNames,
  stacked,
}: {
  ledger: PlanLedger;
  plan: PayoutPlan;
  regularSeasonWeeks: number;
  lastWeek: number;
  currentWeek: number | null;
  /** The last week Sleeper has made official. */
  finishedThrough: number;
  /** Team names by roster; each manager's row shows the team name over the username. */
  teamNames: Map<number, string>;
  /** Each manager's payouts piled into one bar (see PayoutBoard). */
  stacked: boolean;
}) {
  const ruleText = new Map(plan.rules.map((r) => [r.id, describeRecipients(r)]));
  const breakdown = (payments: RulePayment[] | undefined) =>
    (payments ?? []).map((p) => `${money(p.amount)} for ${ruleText.get(p.ruleId) ?? "a rule"}`).join("; ");
  const hasSeasonRules = plan.rules.some((r) => awardInfo(r.award).timing === "season");
  const seasonDecided = ledger.seasonOver || ledger.regularSeasonOver;

  const weeks = Array.from({ length: Math.max(lastWeek, ...ledger.weeks) }, (_, i) => i + 1);
  // Only while it's counted and not yet official: with "as it stands" off, it isn't paid out until it's over.
  const live =
    !ledger.seasonOver && currentWeek != null && currentWeek > finishedThrough && ledger.weeksPlayed.includes(currentWeek)
      ? currentWeek
      : null;

  const rows: BoardRow[] = ledger.managers.map((mgr) => ({
    key: mgr.rosterId,
    name: teamNames.get(mgr.rosterId) ?? mgr.name,
    username: mgr.name,
    weeks: weeks.map((w) => {
      const amount = mgr.weekly[w] ?? 0;
      const played = ledger.weeksPlayed.includes(w);
      const detail = mgr.weeklyDetail[w];
      return {
        amount: played ? amount : 0,
        pending: !played,
        live: w === live,
        title: !played
          ? `Week ${w}: not played yet`
          : `Week ${w}${w === live ? " (in progress, not final)" : ""}: ${amount > 0 ? breakdown(detail) : "nothing"}`,
      };
    }),
    season: hasSeasonRules
      ? {
          amount: mgr.seasonEnd,
          pending: mgr.seasonEnd <= 0 && !seasonDecided,
          title: mgr.seasonEnd > 0 ? breakdown(mgr.seasonDetail) : seasonDecided ? "No season-end award" : "Decided at season’s end",
        }
      : null,
    total: mgr.total,
    net: mgr.net,
  }));

  return (
    <div>
      <PayoutBoard rows={rows} weeks={weeks} regularSeasonWeeks={regularSeasonWeeks} hasSeason={hasSeasonRules} stacked={stacked} />
      {plan.rules.length ? (
        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
          {RULE_GROUPS.map((group) => {
            const rules = plan.rules.filter((r) => ruleGroup(r, regularSeasonWeeks) === group);
            return (
              <div key={group} className={`min-w-0 ${rules.length ? "" : "max-md:hidden"}`}>
                <h4 className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-muted">{group}</h4>
                {rules.length ? (
                  <ol className="flex flex-col gap-1.5">
                    {rules.map((r) => (
                      <LegendLine key={r.id} rule={r} ledger={ledger} regularSeasonWeeks={regularSeasonWeeks} />
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
  const [stacked, setStacked] = useState(false);
  const balanced = Math.abs(ledger.unallocated) < 0.005;
  const stillToPay = Math.max(0, ledger.committed - ledger.paidToDate);
  const seasonPrizes = ledger.budgets
    .filter((b) => awardInfo(plan.rules.find((r) => r.id === b.ruleId)!.award).timing === "season")
    .reduce((s, b) => s + b.projected, 0);

  const totals: [string, number][] = [
    ["Total pot", ledger.pot],
    ["Paid out", ledger.paidToDate],
    ["Still to pay", stillToPay],
    ["Season prizes", seasonPrizes],
  ];

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Payouts</h2>
        <button
          type="button"
          onClick={() => setStacked((s) => !s)}
          aria-pressed={stacked}
          className="bg-[var(--map-tag)] px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--map-tag-ink)] hover:opacity-90"
        >
          {stacked ? "Spread" : "Stack"}
        </button>
      </div>
      <WeekGrid
        ledger={ledger}
        plan={plan}
        regularSeasonWeeks={season.results.regularSeasonWeeks}
        lastWeek={season.results.lastWeek}
        currentWeek={currentWeek}
        finishedThrough={season.finishedThrough}
        teamNames={season.teamNames}
        stacked={stacked}
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
