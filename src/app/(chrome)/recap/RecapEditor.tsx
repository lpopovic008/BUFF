"use client";

import { RecapModel } from "@/lib/recap-model";
import { BowlMatchupResult, BowlMatchupPreview } from "@/lib/bowl-narrative";
import { LeagueTeamOption } from "@/hooks/useLeagueTeams";
import { WeekRecapData } from "@/lib/league-data";
import { PayoutLedger } from "@/lib/payouts";
import { GraphicTeam } from "@/lib/recap-graphic-data";
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
  recapData,
  ledger,
  week,
  playerNames,
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
  /** Roster id -> team name/logo/username, resolving the matchups above into names to display. */
  teams: Record<number, GraphicTeam>;
  /** The league's roster pool for the upcoming-matchup team pickers — null until useLeagueTeams finishes loading. */
  teamOptions: LeagueTeamOption[] | null;
  /** This write-up's own week's matchup data and money ledger, feeding the four computed sections (High Scorer, Winners, Last Week Results, Updated Standings) — see RecapSectionsEditor. */
  recapData: WeekRecapData | null;
  ledger: PayoutLedger | null;
  week: number;
  /** Player id -> display name, for the High Scorer callout's "led by" names. */
  playerNames: Record<string, string>;
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
    // Full-bleed (cancels ChromeLayout's page gutter) and horizontally
    // scrollable — the graphic replica below has a fixed width (see
    // recap-neon.css) instead of a responsive one, so a narrow/mobile
    // viewport scrolls sideways to see the rest of it instead of every
    // component inside squeezing to fit.
    <div className={`${recapBodyFont.className} -mx-3 overflow-x-auto px-3 sm:-mx-6 sm:px-6`}>
      <RecapSectionsEditor
        model={model}
        onChange={onModelChange}
        bowlMatchup={bowlMatchup}
        honorableMatchup={honorableMatchup}
        upcomingMatchup={upcomingMatchup}
        upcomingHonorableMatchup={upcomingHonorableMatchup}
        teams={teams}
        teamOptions={teamOptions}
        recapData={recapData}
        ledger={ledger}
        week={week}
        playerNames={playerNames}
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
