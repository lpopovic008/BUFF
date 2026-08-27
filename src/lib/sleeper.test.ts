import test from "node:test";
import assert from "node:assert/strict";
import { weighProjection } from "./sleeper";

test("weighProjection sums projected stat categories by the league's own point values", () => {
  const stats = { pass_yd: 260, pass_td: 2, pass_int: 1, rush_yd: 8 };
  const scoringSettings = { pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1 };
  // 260*0.04 + 2*4 + 1*-2 + 8*0.1 = 10.4 + 8 - 2 + 0.8 = 17.2
  assert.equal(weighProjection(stats, scoringSettings), 17.2);
});

test("weighProjection accounts for custom bonuses like tight end premium", () => {
  const stats = { rec: 6, rec_yd: 70, bonus_rec_te: 6 };
  const tePremiumLeague = { rec: 1, rec_yd: 0.1, bonus_rec_te: 0.5 };
  // 6*1 + 70*0.1 + 6*0.5 = 6 + 7 + 3 = 16
  assert.equal(weighProjection(stats, tePremiumLeague), 16);
});

test("weighProjection falls back to the reception-based pts_* rollup when no raw stat categories overlap the league's scoring", () => {
  // Stats only carries Sleeper's rollups here (e.g. a week where the raw
  // per-category breakdown wasn't returned) — nothing to weigh directly, so
  // it picks the rollup matching this league's own reception value instead
  // of always defaulting to full PPR.
  const stats = { pts_ppr: 11, pts_half_ppr: 8.5, pts_std: 6 };
  assert.equal(weighProjection(stats, { rec: 0 }), 6);
  assert.equal(weighProjection(stats, { rec: 0.5 }), 8.5);
  assert.equal(weighProjection(stats, { rec: 1 }), 11);
});

test("weighProjection falls back to the PPR rollup when scoringSettings is missing", () => {
  const stats = { pts_ppr: 14.2, pts_half_ppr: 11.7, pts_std: 9.2 };
  assert.equal(weighProjection(stats, undefined), 14.2);
});

test("weighProjection has no reception value to read, so it treats the league as standard scoring", () => {
  const stats = { pts_ppr: 5.5, pts_half_ppr: 4.5, pts_std: 3.5 };
  const scoringSettings = { made_up_category: 1 };
  assert.equal(weighProjection(stats, scoringSettings), 3.5);
});

test("weighProjection falls through to whatever rollup is actually present when its reception-based pick is missing", () => {
  const stats = { pts_half_ppr: 2.5 };
  assert.equal(weighProjection(stats, { rec: 1 }), 2.5);
});
