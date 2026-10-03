// Talks to the FastAPI backend's POST /payouts/parse (backend/app/routers/
// payouts.py): sends the commish's own description of their league's money,
// gets back plain-English notes and the payout rules it describes. The rules
// come back in payout-plan.ts's own vocabulary; they're checked again here
// before anything uses them, and the payout engine does all the math.

import {
  AmountKind,
  AWARDS,
  AwardKind,
  newRuleId,
  PayoutPlan,
  PayoutRule,
  RankSpec,
  SeasonResults,
} from "./payout-plan";

export interface PayoutReading {
  notes: string[];
  plan: PayoutPlan;
  unsupported: string[];
  questions: string[];
}

interface ParsedRule {
  award: string;
  rank_mode: string;
  rank_n: number;
  amount_kind: string;
  amount: number;
  from_week: number;
  to_week: number;
  ties: string;
  skip_if_paid: boolean;
  split?: number[];
}

interface ParsedPayouts {
  notes: string[];
  buy_in: number;
  buy_in_overrides: { roster_id: number; amount: number }[];
  rules: ParsedRule[];
  unsupported: string[];
  questions: string[];
}

const AWARD_KINDS = new Set<string>(AWARDS.map((a) => a.kind));

function toRule(r: ParsedRule, season: SeasonResults): PayoutRule | null {
  if (!AWARD_KINDS.has(r.award)) return null;
  const award = r.award as AwardKind;
  const modes = AWARDS.find((a) => a.kind === award)!.modes;
  const mode = (
    modes.includes(r.rank_mode as RankSpec["mode"]) ? r.rank_mode : "place"
  ) as RankSpec["mode"];
  const amountKind = (
    ["dollars", "percent", "remainder"].includes(r.amount_kind)
      ? r.amount_kind
      : "dollars"
  ) as AmountKind;
  const fromWeek = Math.min(
    Math.max(1, Math.round(r.from_week) || 1),
    season.lastWeek,
  );
  return {
    id: newRuleId(),
    award,
    rank: { mode, n: Math.max(1, Math.round(r.rank_n) || 1) },
    amountKind,
    amount: Math.max(0, Number(r.amount) || 0),
    fromWeek,
    toWeek: Math.min(
      Math.max(fromWeek, Math.round(r.to_week) || season.regularSeasonWeeks),
      season.lastWeek,
    ),
    ties: r.ties === "each" ? "each" : "split",
    skipIfPaid: !!r.skip_if_paid,
    ...(award === "podium" && r.split?.length ? { split: r.split.map((n) => Math.max(0, Number(n) || 0)) } : {}),
  };
}

export async function readPayoutDescription(
  description: string,
  season: SeasonResults,
): Promise<PayoutReading> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base)
    throw new Error("The payout reader's backend isn't configured yet.");

  const res = await fetch(`${base.replace(/\/$/, "")}/payouts/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description,
      team_count: season.rosterIds.length,
      regular_season_weeks: season.regularSeasonWeeks,
      last_week: season.lastWeek,
      playoff_teams: season.playoffTeams ?? undefined,
      managers: season.rosterIds.map((id) => ({
        roster_id: id,
        name: season.names.get(id) ?? `Roster ${id}`,
      })),
    }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(
      detail?.detail ||
        `The payout reader is unavailable right now (${res.status}).`,
    );
  }
  const data = (await res.json()) as ParsedPayouts;

  const buyIns: Record<number, number> = Object.fromEntries(
    season.rosterIds.map((id) => [id, Math.max(0, data.buy_in || 0)]),
  );
  for (const o of data.buy_in_overrides ?? [])
    if (o.roster_id in buyIns) buyIns[o.roster_id] = Math.max(0, o.amount);
  const rules = (data.rules ?? [])
    .map((r) => toRule(r, season))
    .filter((r): r is PayoutRule => r !== null);

  return {
    notes: data.notes ?? [],
    plan: { version: 1, buyIns, rules, description },
    unsupported: data.unsupported ?? [],
    questions: data.questions ?? [],
  };
}
