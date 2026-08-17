// Baked-in identity so the dashboard needs no manual setup on a fresh browser.
//
// Deliberately the *username* rather than league IDs: Sleeper mints a new
// league_id for every league every season (the years are chained together via
// previous_league_id), so hard-coded league IDs would go stale each August.
// A username re-discovers the current season's leagues automatically.
//
// Leave as an empty string to disable auto-setup and use the Settings page.
// Annotated as `string` rather than inferred, so the empty-string checks that
// gate auto-setup stay valid whatever value is filled in here.
export const DEFAULT_SLEEPER_USERNAME: string = "lpop8";

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
