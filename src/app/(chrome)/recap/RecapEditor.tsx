"use client";

import { RecapModel } from "@/lib/recap-model";
import { BowlMatchupResult, BowlMatchupPreview } from "@/lib/bowl-narrative";
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
  onRenameBowl,
  onRenameHonorable,
  onRenameUpcomingBowl,
  onRenameUpcomingHonorable,
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
  /** Double-clicking a matchup's header renames it — writes back to the shared bowl pick (see recap/page.tsx) so the same game's name stays identical everywhere it's shown, this week and next. */
  onRenameBowl: (name: string) => void;
  onRenameHonorable: (name: string) => void;
  onRenameUpcomingBowl: (name: string) => void;
  onRenameUpcomingHonorable: (name: string) => void;
}) {
  if (!model) {
    return (
      <textarea
        value={plainBody}
        onChange={(e) => onPlainBodyChange(e.target.value)}
        rows={20}
        className="w-full border border-border bg-page p-4 font-mono text-sm text-ink-primary outline-none transition-colors focus:border-series-1"
      />
    );
  }

  return (
    <RecapSectionsEditor
      model={model}
      onChange={onModelChange}
      bowlMatchup={bowlMatchup}
      honorableMatchup={honorableMatchup}
      upcomingMatchup={upcomingMatchup}
      upcomingHonorableMatchup={upcomingHonorableMatchup}
      teams={teams}
      onRenameBowl={onRenameBowl}
      onRenameHonorable={onRenameHonorable}
      onRenameUpcomingBowl={onRenameUpcomingBowl}
      onRenameUpcomingHonorable={onRenameUpcomingHonorable}
    />
  );
}
