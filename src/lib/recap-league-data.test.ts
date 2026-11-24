import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_RECAP_MODEL, RecapModel, withLeagueData } from "./recap-model";

const model = (over: Partial<RecapModel>): RecapModel => ({ ...EMPTY_RECAP_MODEL, ...over });

test("a saved write-up keeps what was typed in it and takes the league's numbers as they are now", () => {
  const saved = model({
    title: "My own title",
    standings: "Team A $10\nTeam B $0",
    records: "Team A 1-0",
    bowlDetail: "What a game, typed by the commish",
    aiRecap: "AI lede, edited",
    include: { lastWeek: false },
    layout: ["aiRecap", "standings"],
    more: { 3: { result: "old result", resultDetail: "my note", lines: "old lines", detail: "" } },
  });
  const fresh = model({
    title: "🚨📋 Week 7 Recap",
    standings: "Team A $25\nTeam B $15",
    records: "Team A 2-0",
    more: { 3: { result: "new result", resultDetail: "", lines: "new lines", detail: "" } },
  });
  const out = withLeagueData(saved, fresh);
  assert.equal(out.title, "My own title");
  assert.equal(out.standings, "Team A $25\nTeam B $15");
  assert.equal(out.records, "Team A 2-0");
  assert.equal(out.bowlDetail, "What a game, typed by the commish");
  assert.equal(out.aiRecap, "AI lede, edited");
  assert.deepEqual(out.include, { lastWeek: false });
  assert.deepEqual(out.layout, ["aiRecap", "standings"]);
  assert.deepEqual(out.more?.[3], { result: "new result", resultDetail: "my note", lines: "new lines", detail: "" });
});

test("an added section takes the league's newer text unless it's been typed in; Commish Notes are always the commish's", () => {
  const fresh = model({ extra: { playerOfWeek: "⭐ Josh Allen 41.2", lowScorer: "📉 Team C 70.1", commishNotes: "" } });
  // Written from the league's data, untouched since: updated.
  const untouched = model({ extra: { playerOfWeek: "⭐ Josh Allen 30.5", lowScorer: "📉 Team D 80", commishNotes: "Dues by Friday" }, extraDraft: { playerOfWeek: "⭐ Josh Allen 30.5", lowScorer: "📉 Team D 80" } });
  const a = withLeagueData(untouched, fresh);
  assert.equal(a.extra.playerOfWeek, "⭐ Josh Allen 41.2");
  assert.equal(a.extra.lowScorer, "📉 Team C 70.1");
  assert.equal(a.extra.commishNotes, "Dues by Friday");
  // Typed in: kept, and still taken for typed in the next time.
  const typed = model({ extra: { playerOfWeek: "⭐ Josh Allen 30.5 — MVP!" }, extraDraft: { playerOfWeek: "⭐ Josh Allen 30.5" } });
  const b = withLeagueData(typed, fresh);
  assert.equal(b.extra.playerOfWeek, "⭐ Josh Allen 30.5 — MVP!");
  assert.equal(withLeagueData(b, fresh).extra.playerOfWeek, "⭐ Josh Allen 30.5 — MVP!");
  // Saved before the league's text was kept with it: updated where only its numbers differ.
  const older = model({ extra: { playerOfWeek: "⭐ Josh Allen 30.5", lowScorer: "📉 My words here" } });
  const c = withLeagueData(older, fresh);
  assert.equal(c.extra.playerOfWeek, "⭐ Josh Allen 41.2");
  assert.equal(c.extra.lowScorer, "📉 My words here");
});
