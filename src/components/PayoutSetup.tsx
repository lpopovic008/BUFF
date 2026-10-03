"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import {
  AmountKind,
  AWARDS,
  awardInfo,
  AwardKind,
  defaultRule,
  describeRecipients,
  describeTiming,
  formatMoney,
  PayoutPlan,
  PayoutRule,
  PlanLedger,
  RankSpec,
  SeasonResults,
} from "@/lib/payout-plan";

const FIELD =
  "border border-border bg-page px-2 py-1.5 text-sm text-ink-primary outline-none focus:border-series-1";
const LABEL =
  "text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted";

/**
 * A number box that lets you type freely ("", "1.", "12.5") and only hands
 * back a value once it parses.
 */
function NumberField({
  value,
  onChange,
  min = 0,
  step = 1,
  className = "",
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
  className?: string;
  label: string;
}) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  // Follow changes made elsewhere (e.g. "set everyone"), without fighting the user's typing.
  if (shown !== value) {
    setShown(value);
    if (Number(text) !== value) setText(String(value));
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      min={min}
      step={step}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n) && n >= min)
          onChange(n);
      }}
      onBlur={() => setText(String(value))}
      className={`${FIELD} tabular-nums ${className}`}
    />
  );
}

function BuyIns({
  plan,
  season,
  pot,
  onChange,
}: {
  plan: PayoutPlan;
  season: SeasonResults;
  pot: number;
  onChange: (plan: PayoutPlan) => void;
}) {
  const amounts = season.rosterIds.map((id) => plan.buyIns[id] ?? 0);
  const same = amounts.every((a) => a === amounts[0]);
  const [everyone, setEveryone] = useState(same ? (amounts[0] ?? 0) : 0);
  const [open, setOpen] = useState(!same);
  const setAll = (n: number) =>
    onChange({
      ...plan,
      buyIns: Object.fromEntries(season.rosterIds.map((id) => [id, n])),
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Everyone buys in for</span>
          <span className="flex items-center gap-1">
            <span className="text-sm text-ink-muted">$</span>
            <NumberField
              label="Buy-in for every manager"
              value={everyone}
              onChange={(n) => {
                setEveryone(n);
                setAll(n);
              }}
              className="w-24"
            />
          </span>
        </label>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="pb-1.5 text-sm font-medium text-series-1 hover:underline"
          aria-expanded={open}
        >
          {open ? "Hide each manager’s buy-in" : "Set each manager’s buy-in"}
        </button>
        <div className="ml-auto text-right">
          <div className={LABEL}>Total pot</div>
          <div className="text-xl font-semibold tabular-nums text-ink-primary">
            {formatMoney(pot)}
          </div>
        </div>
      </div>
      {open ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {season.rosterIds.map((id) => (
            <label
              key={id}
              className="flex items-center justify-between gap-3 border-b border-grid py-1"
            >
              <span className="truncate text-sm text-ink-primary">
                {season.names.get(id) ?? `Roster ${id}`}
              </span>
              <span className="flex items-center gap-1">
                <span className="text-sm text-ink-muted">$</span>
                <NumberField
                  label={`Buy-in for ${season.names.get(id) ?? `roster ${id}`}`}
                  value={plan.buyIns[id] ?? 0}
                  onChange={(n) =>
                    onChange({ ...plan, buyIns: { ...plan.buyIns, [id]: n } })
                  }
                  className="w-24"
                />
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Whether teams can tie for a rule's award (nobody ties in the final finishing order). */
const canTie = (rule: PayoutRule) =>
  awardInfo(rule.award).ranked && rule.award !== "finalPlace";

/** A rule in plain English: "Pay $15 to every matchup winner, every regular-season week (1–14)." */
function RuleSentence({
  rule,
  perPayout,
  pot,
  regularSeasonWeeks,
}: {
  rule: PayoutRule;
  perPayout: number;
  pot: number;
  regularSeasonWeeks: number;
}) {
  const amount =
    rule.amountKind === "dollars"
      ? formatMoney(rule.amount)
      : rule.amountKind === "percent"
        ? `${rule.amount}% of the pot (${formatMoney((pot * rule.amount) / 100)})`
        : `the rest of the pot (about ${formatMoney(perPayout)})`;
  const info = awardInfo(rule.award);
  return (
    <p className="text-sm leading-relaxed text-ink-primary">
      Pay <b>{amount}</b> to <b>{describeRecipients(rule)}</b>{" "}
      {describeTiming(rule, regularSeasonWeeks)}.
      {canTie(rule) ? (
        <span className="text-ink-secondary">
          {" "}
          Ties{" "}
          {rule.ties === "split"
            ? "split the money"
            : "each get the full amount"}
          .
        </span>
      ) : null}
      {rule.skipIfPaid ? (
        <span className="text-ink-secondary">
          {" "}
          Not on top of an earlier payout{" "}
          {info.timing === "weekly" ? "that week" : "at season’s end"}.
        </span>
      ) : null}
    </p>
  );
}

function RuleEditor({
  rule,
  index,
  count,
  season,
  pot,
  budget,
  onChange,
  onMove,
  onRemove,
  startOpen,
}: {
  startOpen: boolean;
  rule: PayoutRule;
  index: number;
  count: number;
  season: SeasonResults;
  pot: number;
  budget: { perPayout: number; projected: number; paid: number } | undefined;
  onChange: (rule: PayoutRule) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const info = awardInfo(rule.award);
  const [open, setOpen] = useState(startOpen);
  const set = (patch: Partial<PayoutRule>) => onChange({ ...rule, ...patch });
  const setAward = (award: AwardKind) => {
    const next = awardInfo(award);
    const rank: RankSpec = next.modes.includes(rule.rank.mode)
      ? rule.rank
      : { mode: "place", n: 1 };
    set({ award, rank });
  };

  return (
    <li className="flex flex-col gap-3 border border-border bg-page/40 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 bg-[var(--map-tag)] px-1.5 text-xs font-bold tabular-nums text-[var(--map-tag-ink)]">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <RuleSentence
            rule={rule}
            perPayout={budget?.perPayout ?? 0}
            pot={pot}
            regularSeasonWeeks={season.regularSeasonWeeks}
          />
          {budget ? (
            <p className="mt-1 text-xs tabular-nums text-ink-muted">
              About {formatMoney(budget.projected)} over the season ·{" "}
              {formatMoney(budget.paid)} paid so far
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mr-1 border border-border px-2 py-0.5 text-xs font-semibold text-ink-secondary hover:text-ink-primary"
          >
            {open ? "Done" : "Edit"}
          </button>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="px-1.5 text-ink-secondary hover:text-ink-primary disabled:opacity-30"
            aria-label="Move rule up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            className="px-1.5 text-ink-secondary hover:text-ink-primary disabled:opacity-30"
            aria-label="Move rule down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="px-1.5 text-ink-secondary hover:text-status-critical"
            aria-label="Remove rule"
          >
            ✕
          </button>
        </div>
      </div>

      {open ? (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Amount</span>
            <span className="flex items-center gap-1">
              {rule.amountKind !== "remainder" ? (
                <NumberField
                  label="Amount"
                  value={rule.amount}
                  step={rule.amountKind === "percent" ? 0.5 : 1}
                  onChange={(amount) => set({ amount })}
                  className="w-20"
                />
              ) : null}
              <select
                aria-label="Amount type"
                value={rule.amountKind}
                onChange={(e) =>
                  set({ amountKind: e.target.value as AmountKind })
                }
                className={FIELD}
              >
                <option value="dollars">dollars</option>
                <option value="percent">% of the pot</option>
                <option value="remainder">the rest of the pot</option>
              </select>
            </span>
          </label>

          <label className="flex min-w-0 flex-col gap-1">
            <span className={LABEL}>Paid to</span>
            <select
              aria-label="Paid to"
              value={rule.award}
              onChange={(e) => setAward(e.target.value as AwardKind)}
              className={`${FIELD} max-w-full`}
            >
              <optgroup label="Each week">
                {AWARDS.filter((a) => a.timing === "weekly").map((a) => (
                  <option key={a.kind} value={a.kind}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="End of season">
                {AWARDS.filter((a) => a.timing === "season").map((a) => (
                  <option key={a.kind} value={a.kind}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          {info.ranked ? (
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Which</span>
              <span className="flex items-center gap-1">
                <select
                  aria-label="Which places"
                  value={rule.rank.mode}
                  onChange={(e) =>
                    set({
                      rank: {
                        ...rule.rank,
                        mode: e.target.value as RankSpec["mode"],
                      },
                    })
                  }
                  className={FIELD}
                >
                  <option value="place">only place</option>
                  <option value="top">the top</option>
                  {info.modes.includes("bottom") ? (
                    <option value="bottom">the bottom</option>
                  ) : null}
                </select>
                <NumberField
                  label="Place or count"
                  value={rule.rank.n}
                  min={1}
                  onChange={(n) =>
                    set({
                      rank: { ...rule.rank, n: Math.max(1, Math.round(n)) },
                    })
                  }
                  className="w-16"
                />
              </span>
            </label>
          ) : null}

          {info.timing === "weekly" ? (
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Weeks</span>
              <span className="flex items-center gap-1.5 text-sm text-ink-secondary">
                <NumberField
                  label="From week"
                  value={rule.fromWeek}
                  min={1}
                  onChange={(n) => set({ fromWeek: Math.round(n) })}
                  className="w-16"
                />
                to
                <NumberField
                  label="To week"
                  value={rule.toWeek}
                  min={1}
                  onChange={(n) => set({ toWeek: Math.round(n) })}
                  className="w-16"
                />
              </span>
            </label>
          ) : (
            <div className="flex flex-col gap-1">
              <span className={LABEL}>When</span>
              <span className="py-1.5 text-sm text-ink-secondary">
                {rule.award === "finalPlace"
                  ? `After the championship (week ${season.lastWeek})`
                  : `After week ${season.regularSeasonWeeks}`}
              </span>
            </div>
          )}

          {canTie(rule) ? (
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Ties</span>
              <select
                aria-label="Ties"
                value={rule.ties}
                onChange={(e) =>
                  set({ ties: e.target.value as PayoutRule["ties"] })
                }
                className={FIELD}
              >
                <option value="split">split the money</option>
                <option value="each">each get it all</option>
              </select>
            </label>
          ) : null}

          {index > 0 ? (
            <label className="flex items-center gap-2 py-1.5 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={rule.skipIfPaid}
                onChange={(e) => set({ skipIfPaid: e.target.checked })}
                className="h-4 w-4 accent-[var(--map-tag)]"
              />
              No double-dipping
              <span className="text-xs text-ink-muted">
                (skip anyone a rule above already paid)
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * The league's money setup: everyone's buy-in, and the payout rules, which
 * are played through the season's results to fill the week-by-week grid.
 */
export function PayoutSetup({
  plan,
  season,
  ledger,
  onChange,
}: {
  plan: PayoutPlan;
  season: SeasonResults;
  ledger: PlanLedger;
  onChange: (plan: PayoutPlan) => void;
}) {
  const budgets = new Map(ledger.budgets.map((b) => [b.ruleId, b]));
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const setRules = (rules: PayoutRule[]) => onChange({ ...plan, rules });
  const balanced = Math.abs(ledger.unallocated) < 0.005;

  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        Payout setup
      </h3>
      <p className="mb-4 text-xs text-ink-secondary">
        What everyone buys in for, and how the pot gets paid out. Rules run in
        order, top to bottom.
      </p>

      <BuyIns
        plan={plan}
        season={season}
        pot={ledger.pot}
        onChange={onChange}
      />

      <div className="mt-5 flex flex-col gap-3">
        {plan.rules.length === 0 ? (
          <p className="border border-dashed border-border p-4 text-center text-sm text-ink-secondary">
            No payout rules yet. Add one for each way the pot pays out: weekly
            high scores, matchup wins, the champion, and so on.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {plan.rules.map((rule, i) => (
              <RuleEditor
                key={rule.id}
                startOpen={added.has(rule.id)}
                rule={rule}
                index={i}
                count={plan.rules.length}
                season={season}
                pot={ledger.pot}
                budget={budgets.get(rule.id)}
                onChange={(next) =>
                  setRules(plan.rules.map((r) => (r.id === rule.id ? next : r)))
                }
                onMove={(dir) => {
                  const rules = [...plan.rules];
                  const j = i + dir;
                  if (j < 0 || j >= rules.length) return;
                  [rules[i], rules[j]] = [rules[j], rules[i]];
                  setRules(rules);
                }}
                onRemove={() =>
                  setRules(plan.rules.filter((r) => r.id !== rule.id))
                }
              />
            ))}
          </ol>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              const rule = defaultRule(season.regularSeasonWeeks);
              setAdded((a) => new Set(a).add(rule.id));
              setRules([...plan.rules, rule]);
            }}
            className="bg-[var(--map-tag)] px-3 py-1.5 text-sm font-semibold text-[var(--map-tag-ink)] hover:opacity-90"
          >
            + Add a payout rule
          </button>
          <p
            className={`text-sm tabular-nums ${balanced ? "text-status-good" : "text-status-critical"}`}
          >
            {plan.rules.length === 0
              ? null
              : balanced
                ? `Balanced: the rules pay out the whole ${formatMoney(ledger.pot)} pot.`
                : ledger.unallocated > 0
                  ? `${formatMoney(ledger.unallocated)} of the ${formatMoney(ledger.pot)} pot isn’t paid out by any rule.`
                  : `The rules pay out about ${formatMoney(ledger.committed)}, ${formatMoney(-ledger.unallocated)} more than the ${formatMoney(ledger.pot)} pot.`}
          </p>
        </div>
      </div>
    </Card>
  );
}
