import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_RECAP_MODEL, joinRecapModel, parseRecapModel, RecapModel } from "./recap-model";

function sampleModel(overrides: Partial<RecapModel> = {}): RecapModel {
  return {
    ...EMPTY_RECAP_MODEL,
    title: "🚨📋 Week 4 Recap",
    bowlResult: "👑 The Sharks won THE BIJAN BOWL! Congrats to The Sharks!",
    bowlDetail: "What a game — down 20 at half and stormed back.",
    honorableResult: "🏆 The Otters won THE MINNOW BOWL! Congrats to The Otters!",
    honorableDetail: "<Detail>",
    highScorer: "📈 The Sharks outperformed the league this week! He scored a whopping 154.20! The team was led by Ja'Marr Chase and Bijan Robinson! Congrats to The Sharks!",
    highScorerDetail: "<Detail>",
    winners: "🔹The Sharks\n▫️The Otters\n▫️The Minnows",
    lastWeek: "The Sharks\n154.20 ✅\nThe Otters\n120.10 ✅",
    standings: "$140 The Sharks\n$90 The Otters",
    upcomingWeek: 5,
    upcomingBowlLines: "THE GATOR BOWL\nThe Sharks vs The Whales\n\nThe Sharks has scored 500.5 which ranks 1st in the league",
    upcomingBowlDetail: "Should be a good one.",
    upcomingHonorableLines: "THE PUDDLE BOWL\nThe Otters vs The Minnows",
    upcomingHonorableDetail: "<Detail>",
    ...overrides,
  };
}

test("joinRecapModel produces the documented section order and blank-line spacing", () => {
  const text = joinRecapModel(sampleModel());
  const lines = text.split("\n");
  assert.equal(lines[0], "🚨📋 Week 4 Recap");
  assert.equal(lines[1], "");
  assert.equal(lines[2], "👑 The Sharks won THE BIJAN BOWL! Congrats to The Sharks!");
  assert.ok(text.includes("🤑 Winners this week who will receive commission:"));
  assert.ok(text.includes("UPCOMING WEEK 5:"));
  assert.ok(text.includes("WHO WILL PREVAIL?!"));
  assert.ok(text.endsWith("Good Luck to All!"));
});

test("parseRecapModel is the exact inverse of joinRecapModel for a fully-filled model", () => {
  const model = sampleModel();
  const parsed = parseRecapModel(joinRecapModel(model));
  assert.deepEqual(parsed, model);
});

test("parseRecapModel round-trips multi-line detail commentary without losing paragraphs", () => {
  const model = sampleModel({
    bowlDetail: "First paragraph of commentary.\nSecond line, still the same thought.",
  });
  const parsed = parseRecapModel(joinRecapModel(model));
  assert.equal(parsed?.bowlDetail, "First paragraph of commentary.\nSecond line, still the same thought.");
});

test("parseRecapModel round-trips the default placeholder details", () => {
  const model = sampleModel({ bowlDetail: "<Detail>", upcomingHonorableDetail: "<Detail>" });
  const parsed = parseRecapModel(joinRecapModel(model));
  assert.equal(parsed?.bowlDetail, "<Detail>");
  assert.equal(parsed?.upcomingHonorableDetail, "<Detail>");
});

test("parseRecapModel recovers the upcoming week number from the banner line", () => {
  const parsed = parseRecapModel(joinRecapModel(sampleModel({ upcomingWeek: 12 })));
  assert.equal(parsed?.upcomingWeek, 12);
});

test("parseRecapModel returns null for text that doesn't start with the title emoji", () => {
  assert.equal(parseRecapModel("Just some free text, not a recap at all."), null);
});

test("parseRecapModel returns null when a required header line is missing", () => {
  const text = joinRecapModel(sampleModel()).replace(
    "🤑 Winners this week who will receive commission:",
    "🤑 Something else entirely:"
  );
  assert.equal(parseRecapModel(text), null);
});

test("parseRecapModel returns null when the closing rallying-cry line is missing", () => {
  const text = joinRecapModel(sampleModel()).replace("Good Luck to All!", "Good luck everyone!");
  assert.equal(parseRecapModel(text), null);
});

test("parseRecapModel handles an embedded blank line inside the upcoming-matchup preview", () => {
  // formatUpcomingBowlBlock's real shape: name, matchup, a blank, then stat
  // lines — that internal blank must not be mistaken for the section boundary.
  const model = sampleModel({
    upcomingBowlLines: "THE GATOR BOWL\nThe Sharks vs The Whales\n\nStat line one\nStat line two",
  });
  const parsed = parseRecapModel(joinRecapModel(model));
  assert.equal(parsed?.upcomingBowlLines, model.upcomingBowlLines);
  assert.equal(parsed?.upcomingBowlDetail, model.upcomingBowlDetail);
});

test("parseRecapModel returns null on a hand-typed body that doesn't match the house shape", () => {
  assert.equal(parseRecapModel("🚨📋 Week 4 Recap\n\nJust wrote whatever here, no structure."), null);
});
