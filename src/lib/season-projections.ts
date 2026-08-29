// Season-long projected fantasy points per Sleeper player id, for the Draft
// Room's post-draft roster summary. Sleeper's own projections endpoint (see
// getWeeklyProjections in sleeper.ts) is week-by-week with no season-total
// equivalent, so this fetches every regular-season week in parallel and
// sums them — one request per week, each already covering every player, so
// a full season costs REGULAR_SEASON_WEEKS requests total. No league is
// connected in the Draft Room, so there's no custom scoring to weigh
// against; getWeeklyProjections falls back to Sleeper's PPR rollup.

import { getWeeklyProjections } from "./sleeper";

/** Standard fantasy regular season length (weeks 1-17); a bye week naturally nets ~0 for that player without special-casing it. */
const REGULAR_SEASON_WEEKS = 17;

const cache = new Map<string, Promise<Record<string, number>>>();

export async function getSeasonProjections(season: string): Promise<Record<string, number>> {
  const cached = cache.get(season);
  if (cached) return cached;

  const promise = (async () => {
    const weeks = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1);
    const weekly = await Promise.all(weeks.map((week) => getWeeklyProjections(season, week)));
    const totals: Record<string, number> = {};
    for (const weekMap of weekly) {
      for (const [playerId, points] of Object.entries(weekMap)) {
        totals[playerId] = (totals[playerId] ?? 0) + points;
      }
    }
    return totals;
  })();

  cache.set(season, promise);
  return promise;
}
