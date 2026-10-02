export function combinePoints(whole: number | undefined, decimal: number | undefined): number {
  return (whole ?? 0) + (decimal ?? 0) / 100;
}

export function formatPoints(points: number): string {
  return points.toFixed(2);
}

export function formatRecord(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function winPct(wins: number, losses: number, ties: number): number {
  const games = wins + losses + ties;
  if (games === 0) return 0;
  return (wins + ties * 0.5) / games;
}

export function formatPct(pct: number): string {
  return `${(pct * 100).toFixed(1)}%`;
}

export function displayManagerName(user: { display_name?: string; metadata?: { team_name?: string } | null } | undefined): string {
  return user?.metadata?.team_name || user?.display_name || "Unclaimed team";
}

/** The manager's actual Sleeper @handle, as opposed to displayManagerName's team branding — for the recap graphic's Winners/Standings sections, which list who's getting paid by their real account, not their team's name. */
export function displaySleeperUsername(user: { username?: string | null; display_name?: string } | undefined): string {
  return user?.username || user?.display_name || "unclaimed";
}

/**
 * "Josh Allen" -> "J. Allen" — compact enough for the lineup view's narrow
 * rows on a phone. Keeps everything from the second word on (so a suffix
 * like "Odell Beckham Jr." comes out "O. Beckham Jr.", not truncated to just
 * the last word) and passes single-word names (the rare DST edge case)
 * through unchanged, since there's no first name to abbreviate.
 */
export function abbreviateFirstName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** A countdown as plain hours:minutes:seconds — no day rollover, even a week out. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}
