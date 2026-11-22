// Who's who in a league on another site, in the terms the app knows a Sleeper league's managers by: each team's
// manager has an id of their own in it — yours (the team you've said is yours, see TrackedLeague.myTeam, or else
// the one the site says you're signed in as) the same id as your Sleeper account's, so the app finds your team there
// as it does in a Sleeper league.

import { getConfig } from "../localStore";

/** Your id, as the app knows you everywhere: your Sleeper account's (or, with none, "me"). */
export function myId(): string {
  return getConfig().sleeperUserId ?? "me";
}

/** The team you've said is yours in a league, if you have. */
export function chosenTeam(leagueId: string): string | null {
  return getConfig().leagues.find((l) => l.leagueId === leagueId)?.myTeam ?? null;
}

/**
 * A team's manager's id in a league on another site: yours for your team — the one you've chosen, or with none
 * chosen, the one the site says is yours (`siteSaysMine`) — and one of its own for anyone else's.
 */
export function managerId(leagueId: string, teamId: string | number, siteSaysMine = false): string {
  const chosen = chosenTeam(leagueId);
  const mine = chosen != null ? chosen === String(teamId) : siteSaysMine;
  return mine ? myId() : `${leagueId}:team-${teamId}`;
}
