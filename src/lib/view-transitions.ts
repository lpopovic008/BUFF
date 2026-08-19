// Shared view-transition-name builders so the Dashboard and the League page
// agree on the same identifiers for the elements that should morph between
// them (see ViewTransitionLink). Names must be valid CSS idents and unique
// per element on the page at transition time, hence the leagueId suffix.

export function leagueTitleTransitionName(leagueId: string): string {
  return `league-title-${leagueId}`;
}

export function myTeamNameTransitionName(leagueId: string): string {
  return `team-my-${leagueId}`;
}

export function opponentTeamNameTransitionName(leagueId: string): string {
  return `team-opp-${leagueId}`;
}
