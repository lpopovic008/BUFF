"use client";

import { useEffect, useRef, useState } from "react";
import { RecapModel } from "@/lib/recap-model";
import { BowlMatchupResult, BowlMatchupPreview } from "@/lib/bowl-narrative";
import { LeagueTeamOption } from "@/hooks/useLeagueTeams";
import { WeekRecapData } from "@/lib/league-data";
import { PayoutLedger } from "@/lib/payouts";
import { GraphicTeam } from "@/lib/recap-graphic-data";
import { recapBodyFont } from "@/lib/fonts";
import { RecapSectionsEditor } from "./RecapSectionsEditor";

// The graphic replica has a fixed authored width (see recap-neon.css's
// .recap-neon) — every size inside it (avatars, fonts, paddings) is
// hand-tuned at that width, so letting the CSS box itself shrink squeezes
// rows meant to sit side by side into overlapping mush. Keep it in sync with
// recap-neon.css's `.recap-neon { width: ... }`.
const GRAPHIC_WIDTH = 640;

/**
 * Uniformly shrinks its fixed-width child to fit whatever width is actually
 * available — like zooming out on the exported image — instead of letting
 * the child's own CSS reflow it. A narrow/mobile screen gets a smaller but
 * completely undistorted copy of the same layout, edge to edge, no
 * horizontal scrolling needed.
 */
function ScaleToFit({ width, children }: { width: number; children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    function recompute() {
      const nextScale = Math.min(1, outer!.clientWidth / width);
      setScale(nextScale);
      setHeight(inner!.scrollHeight * nextScale);
    }

    recompute();
    // Two observers, not one: the outer wrapper resizes with the viewport,
    // the inner content resizes as sections load in or rows are added —
    // either one changing the right-sized scale/height.
    const ro = new ResizeObserver(recompute);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={outerRef} style={{ width: "100%", height, overflow: "hidden" }}>
      <div ref={innerRef} style={{ width, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

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
  freshModel,
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
  /** The structured model computed fresh from this week's live data, regardless of what actually won out above — offered as an escape hatch (see the plain-textarea branch below) for a saved recap old enough to predate the header boxes, which otherwise gets permanently stuck as one flat field. Null only while data is still loading. */
  freshModel: RecapModel | null;
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
      <div className="flex flex-col gap-2">
        {freshModel ? (
          <button
            type="button"
            onClick={() => {
              if (
                !window.confirm(
                  "Switch to the new graphic-style layout? This write-up was saved in an older format that can't be recovered into the new header boxes automatically — copy anything you want to keep from the text below first, since it won't carry over."
                )
              ) {
                return;
              }
              onModelChange(freshModel);
              onPlainBodyChange("");
            }}
            className="self-start text-xs font-medium text-series-1 underline decoration-dotted hover:text-series-1/80"
          >
            This write-up was saved in an older format — switch to the new graphic-style layout
          </button>
        ) : null}
        <textarea
          value={plainBody}
          onChange={(e) => onPlainBodyChange(e.target.value)}
          rows={20}
          className={`${recapBodyFont.className} w-full border border-border bg-page p-4 text-sm text-ink-primary outline-none transition-colors focus:border-series-1`}
        />
      </div>
    );
  }

  return (
    // Full-bleed (cancels ChromeLayout's page gutter) and scaled to fit — the
    // graphic replica below has a fixed authored width (see GRAPHIC_WIDTH
    // above and recap-neon.css) instead of a responsive one, so on a narrow/
    // mobile screen ScaleToFit shrinks the whole thing uniformly to fit edge
    // to edge, rather than each component squeezing/wrapping on its own.
    <div className={`${recapBodyFont.className} -mx-3 px-3 sm:-mx-6 sm:px-6`}>
      <ScaleToFit width={GRAPHIC_WIDTH}>
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
      </ScaleToFit>
    </div>
  );
}
