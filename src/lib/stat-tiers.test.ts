import test from "node:test";
import assert from "node:assert/strict";
import { statTier } from "./stat-tiers";

test("a stat's yellow zone is inclusive: under it red, over it green", () => {
  assert.equal(statTier("QB", "pass_yd", 199), "bad");
  assert.equal(statTier("QB", "pass_yd", 200), "mid");
  assert.equal(statTier("QB", "pass_yd", 269), "mid");
  assert.equal(statTier("QB", "pass_yd", 270), "good");
  assert.equal(statTier("QB", "pass_att", 24), "bad");
  assert.equal(statTier("QB", "pass_att", 35), "good");
  assert.equal(statTier("QB", "pass_cmp", 15), "mid");
  assert.equal(statTier("QB", "pass_cmp", 19), "mid");
  assert.equal(statTier("QB", "pass_cmp", 20), "good");
  assert.equal(statTier("QB", "pass_td", 0), "bad");
  assert.equal(statTier("QB", "pass_td", 1), "mid");
  assert.equal(statTier("QB", "pass_td", 2), "good");
});

test("fewer interceptions is better", () => {
  assert.equal(statTier("QB", "pass_int", 0), "good");
  assert.equal(statTier("QB", "pass_int", 1), "mid");
  assert.equal(statTier("QB", "pass_int", 2), "bad");
});

test("a touchdown has no yellow: none red, one or more green", () => {
  for (const [position, key] of [
    ["QB", "rush_td"],
    ["RB", "rush_td"],
    ["RB", "rec_td"],
    ["WR", "rec_td"],
    ["WR", "rush_td"],
    ["TE", "rec_td"],
    ["TE", "rush_td"],
  ]) {
    assert.equal(statTier(position, key, 0), "bad", `${position} ${key}`);
    assert.equal(statTier(position, key, 1), "good", `${position} ${key}`);
    assert.equal(statTier(position, key, 3), "good", `${position} ${key}`);
  }
});

test("each position grades rushing and receiving on its own scale", () => {
  // Rushing: a QB's 4 carries, a back's 10–14, a receiver's 1–2.
  assert.equal(statTier("QB", "rush_att", 4), "mid");
  assert.equal(statTier("QB", "rush_att", 5), "good");
  assert.equal(statTier("RB", "rush_att", 9), "bad");
  assert.equal(statTier("RB", "rush_yd", 60), "mid");
  assert.equal(statTier("RB", "rush_yd", 61), "good");
  assert.equal(statTier("WR", "rush_att", 0), "bad");
  assert.equal(statTier("WR", "rush_yd", 19), "mid");
  // A tight end runs as a receiver does.
  assert.equal(statTier("TE", "rush_yd", 10), "mid");
  // Receiving: a receiver's 40–69 yards, a back's 19–30, a tight end's 40–59.
  assert.equal(statTier("WR", "rec_yd", 69), "mid");
  assert.equal(statTier("WR", "rec_yd", 70), "good");
  assert.equal(statTier("RB", "rec_yd", 31), "good");
  assert.equal(statTier("RB", "rec", 1), "bad");
  assert.equal(statTier("TE", "rec_yd", 59), "mid");
  assert.equal(statTier("TE", "rec_yd", 60), "good");
  assert.equal(statTier("TE", "rec_tgt", 3), "mid");
  assert.equal(statTier("TE", "rec", 3), "bad");
});

test("kickers, defenses and ungraded stats get no color", () => {
  assert.equal(statTier("K", "fgm", 3), null);
  assert.equal(statTier("DEF", "sack", 4), null);
  assert.equal(statTier("QB", "rec", 1), null);
  assert.equal(statTier("WR", "pass_yd", 300), null);
});
