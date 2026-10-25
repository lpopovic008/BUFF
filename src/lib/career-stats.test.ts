import test from "node:test";
import assert from "node:assert/strict";
import { careerColumns, careerTotals, seasonPoints, seasonRank } from "./career-stats";

test("careerColumns leads with the position's main job", () => {
  assert.deepEqual(
    careerColumns("WR").map((g) => g.group),
    ["Receiving", "Rushing"]
  );
  assert.deepEqual(
    careerColumns("QB").map((g) => g.group),
    ["Passing", "Rushing"]
  );
  const [receiving] = careerColumns("WR");
  const stats = { rec: 100, rec_tgt: 180, rec_yd: 1516, rec_td: 14 };
  assert.deepEqual(
    receiving.columns.map((c) => c.value(stats)),
    ["100/180", "1516", "15.2", "14"]
  );
  // A rate with nothing under it.
  assert.equal(receiving.columns[2].value({}), "–");
});

test("careerTotals adds up counts, not ranks or rates", () => {
  const totals = careerTotals([
    { season: "2023", team: "KC", stats: { gp: 16, pass_yd: 4000, pos_rank_ppr: 3, cmp_pct: 66, pass_lng: 60 } },
    { season: "2024", team: "KC", stats: { gp: 17, pass_yd: 3900, pos_rank_ppr: 11, cmp_pct: 68, pass_lng: 50 } },
  ]);
  assert.deepEqual(totals, { gp: 33, pass_yd: 7900 });
});

test("a season's points and rank go by the league's scoring", () => {
  const stats = { rec: 10, rec_yd: 100, pts_ppr: 20, pts_half_ppr: 15, pos_rank_ppr: 4, pos_rank_half_ppr: 6, pos_rank_std: 9 };
  assert.equal(seasonPoints(stats, { rec: 0.5, rec_yd: 0.1 }), 15);
  assert.equal(seasonPoints(stats), 20);
  assert.equal(seasonRank(stats, { rec: 0.5 }), 6);
  assert.equal(seasonRank(stats, { rec: 0 }), 9);
  assert.equal(seasonRank({}, undefined), null);
});
