"use client";

import { RecapModel } from "@/lib/recap-model";
import { BowlMatchupResult, BowlMatchupPreview } from "@/lib/bowl-narrative";
import { LeagueTeamOption } from "@/hooks/useLeagueTeams";
import { recapBodyFont } from "@/lib/fonts";
import { RecapSectionsEditor } from "./RecapSectionsEditor";

/**
 * The write-up's editable body — every header box (see RecapSectionsEditor)
 * for a league with the commissioner house style, or one plain text box for
 * a league without it (or a previously-saved recap that shape can't be
 * recovered from). The toolbar (copy/copy graphic/save/save to doc) lives in
 * the page header now, not here — see recap/page.tsx and useRecapActions.
 */
export function RecapEditor({
  model,
  onModelChange,
  plainBody,
  onPlainBodyChange,
  bowlMatchup,
  honorableMatchup,
  upcomingMatchup,
  upcomingHonorableMatchup,
  teams,
  teamOptions,
  onRenameBowl,
  onRenameHonorable,
  onRenameUpcomingBowl,
  onRenameUpcomingHonorable,
  onChangeUpcomingBowlTeam,
  onChangeUpcomingHonorableTeam,
}: {
  model: RecapModel | null;
  onModelChange: (model: RecapModel) => void;
  plainBody: string;
  onPlainBodyChange: (body: string) => void;
  bowlMatchup: BowlMatchupResult | null;
  honorableMatchup: BowlMatchupResult | null;
  upcomingMatchup: BowlMatchupPreview | null;
  upcomingHonorableMatchup: BowlMatchupPreview | null;
  /** Roster id -> team name/logo, resolving the matchups above into names to display. */
  teams: Record<number, { name: string; avatar: string | null }>;
  /** The league's roster pool for the upcoming-matchup team pickers — null until useLeagueTeams finishes loading. */
  teamOptions: LeagueTeamOption[] | null;
  /** Double-clicking a matchup's header renames it — writes back to the shared bowl pick (see recap/page.tsx) so the same game's name stays identical everywhere it's shown, this week and next. */
  onRenameBowl: (name: string) => void;
  onRenameHonorable: (name: string) => void;
  onRenameUpcomingBowl: (name: string) => void;
  onRenameUpcomingHonorable: (name: string) => void;
  /** Picking a team for one of next week's matchup slots — writes back to the shared bowl pick the same way a rename does. */
  onChangeUpcomingBowlTeam: (slot: 0 | 1, rosterId: number | "") => void;
  onChangeUpcomingHonorableTeam: (slot: 0 | 1, rosterId: number | "") => void;
}) {
  if (!model) {
    return (
      <textarea
        value={plainBody}
        onChange={(e) => onPlainBodyChange(e.target.value)}
        rows={20}
        className={`${recapBodyFont.className} w-full border border-border bg-page p-4 text-sm text-ink-primary outline-none transition-colors focus:border-series-1`}
      />
    );
  }

  return (
    <div className={recapBodyFont.className}>
      <RecapSectionsEditor
        model={model}
        onChange={onModelChange}
        bowlMatchup={bowlMatchup}
        honorableMatchup={honorableMatchup}
        upcomingMatchup={upcomingMatchup}
        upcomingHonorableMatchup={upcomingHonorableMatchup}
        teams={teams}
        teamOptions={teamOptions}
        onRenameBowl={onRenameBowl}
        onRenameHonorable={onRenameHonorable}
        onRenameUpcomingBowl={onRenameUpcomingBowl}
        onRenameUpcomingHonorable={onRenameUpcomingHonorable}
        onChangeUpcomingBowlTeam={onChangeUpcomingBowlTeam}
        onChangeUpcomingHonorableTeam={onChangeUpcomingHonorableTeam}
      />
    </div>
  );
}
