/**
 * Diagnostic, read-only: for every league of the commissioner's this season, every traded pick from a draft
 * that's done, and whether the trade analyzer can tell who it became — with each season's drafts as Sleeper
 * lists them. Temporary.
 *
 *   npx tsx scripts/probe-trades.ts
 */

import { COMMISH_SLEEPER_USERNAME, defaultSeason } from "../src/lib/app-defaults";
import { getDraft, getDraftPicks, getLeagueDrafts, getLeagueHistoryChain, getTransactions, getUserByUsername, getUserLeagues } from "../src/lib/sleeper";

async function main() {
  const user = await getUserByUsername(COMMISH_SLEEPER_USERNAME);
  if (!user) throw new Error("no such user");
  for (const league of await getUserLeagues(user.user_id, defaultSeason())) {
    if (league.settings.type !== 2) continue;
    console.log(`\n=== ${league.name}`);
    const chain = await getLeagueHistoryChain(league.league_id);
    console.log(`  seasons: ${chain.map((l) => l.season).join(", ")}`);
    const drafts = [];
    for (const l of chain) {
      for (const d of await getLeagueDrafts(l.league_id)) {
        const full = await getDraft(d.draft_id);
        const picks = await getDraftPicks(d.draft_id);
        drafts.push({ ...d, full, picks });
        console.log(
          `  draft ${d.draft_id} in the ${l.season} league: season ${d.season}, ${d.status}, ${d.type}, start ${d.start_time ? new Date(d.start_time).toISOString().slice(0, 10) : "?"}, ${picks.length} picks, rounds ${d.settings?.rounds}, slot_to_roster_id ${JSON.stringify(full?.slot_to_roster_id ?? d.slot_to_roster_id)}`
        );
        if (picks[0]) console.log(`    a pick: ${JSON.stringify(picks[0]).slice(0, 300)}`);
      }
    }
    const traded = [];
    for (const l of chain) {
      for (let w = 0; w <= 18; w++) {
        for (const t of await getTransactions(l.league_id, w)) {
          if (t.type !== "trade" || t.status !== "complete") continue;
          for (const p of t.draft_picks ?? []) traded.push({ ...p, in: l.season, week: w });
        }
      }
    }
    const done = new Set(drafts.filter((d) => d.status === "complete").map((d) => d.season));
    for (const p of traded) {
      if (!done.has(p.season)) continue;
      const candidates = drafts.filter((d) => d.season === p.season && d.status === "complete");
      const found = candidates.map((d) => {
        const slots = d.full?.slot_to_roster_id ?? d.slot_to_roster_id ?? {};
        const slot = Object.entries(slots).find(([, r]) => r === p.roster_id)?.[0];
        const pick = d.picks.find((x) => x.round === p.round && String(x.draft_slot) === slot);
        return `${d.draft_id}: slot ${slot ?? "none"} → ${pick ? `${pick.player_id} (made by roster ${pick.roster_id})` : "no pick"}`;
      });
      console.log(`  traded ${p.season} round ${p.round} of roster ${p.roster_id} (in the ${p.in} league, week ${p.week}) — ${found.join(" | ") || "no draft that season"}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
