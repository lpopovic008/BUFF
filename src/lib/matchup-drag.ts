// A matchup dragged (from the League page's matchups) onto a write-up's upcoming Matchup of the Week (see
// RecapSectionsEditor): its two teams, by roster id, carried as their own kind of drag data.

export const MATCHUP_DRAG_TYPE = "application/x-commish-matchup";

/** Sets a drag going with a matchup's teams (and their names as plain text, for anything else it's dropped on). */
export function startMatchupDrag(e: React.DragEvent, rosterIds: number[], label: string): void {
  e.dataTransfer.setData(MATCHUP_DRAG_TYPE, JSON.stringify(rosterIds));
  e.dataTransfer.setData("text/plain", label);
  e.dataTransfer.effectAllowed = "copy";
}

/** Whether a drag carries a matchup (its data can only be read on the drop). */
export function isMatchupDrag(e: React.DragEvent): boolean {
  return [...e.dataTransfer.types].includes(MATCHUP_DRAG_TYPE);
}

/** The teams a dropped matchup carries — none, for anything else. */
export function droppedMatchup(e: React.DragEvent): number[] {
  try {
    const ids = JSON.parse(e.dataTransfer.getData(MATCHUP_DRAG_TYPE));
    return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === "number") : [];
  } catch {
    return [];
  }
}
