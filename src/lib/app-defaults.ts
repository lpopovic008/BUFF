// The commish's Sleeper username, for the CI recap-automation script only
// (scripts/weekly-recap.ts) — it runs server-side in GitHub Actions with no
// browser and no Settings page to read a username from. NOT used by the app
// itself: a browser's own Settings page always starts blank, even on a
// fresh machine, so a visitor other than the commish never sees this.
export const COMMISH_SLEEPER_USERNAME = "lpop8";

/**
 * The NFL season to load by default. Sleeper labels a season by the calendar
 * year it starts in, so before the season kicks off in September the previous
 * year's leagues are still the interesting ones.
 */
export function defaultSeason(now: Date = new Date()): string {
  const year = now.getFullYear();
  // Months are 0-indexed; treat Jan–Jun as "still last season".
  return now.getMonth() < 6 ? String(year - 1) : String(year);
}
