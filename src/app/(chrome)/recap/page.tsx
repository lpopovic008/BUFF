"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import {
  CopyIcon,
  CheckIcon,
  UploadIcon,
} from "@/components/ui/Icon";
import { lastWeekOf, regularSeasonWeeksOf } from "@/lib/league-data";
import { setHeaderWeek } from "@/lib/header-week";
import { getCurrentWeek, getRecapWeek, getLeague } from "@/lib/sleeper";
import { recapDisplayFont } from "@/lib/fonts";
import { RecapEditor } from "./RecapEditor";
import { GraphicCopyMenu } from "./GraphicCopyMenu";
import { RecapContents } from "./RecapContents";
import { TitleWithHistory } from "@/components/HistoryButtons";
import { LeaguePicker } from "@/components/LeaguePicker";
import { PRESEASON_WEEK, useRecapWriteup } from "./useRecapWriteup";

function RecapContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const leagueId = searchParams.get("id");
  const weekParam = searchParams.get("week");
  const week = weekParam !== null ? Number(weekParam) : null;
  const { isPreseason, header, model, recapData, money, error, actions, googleClientId, editorProps, contentsProps } = useRecapWriteup(leagueId, week);

  // The header's "Week N" picks the week's write-up (the preseason one too).
  useEffect(() => {
    if (!leagueId || week === null || !Number.isFinite(week)) return;
    let cancelled = false;
    Promise.all([getLeague(leagueId), getCurrentWeek()]).then(([league, currentWeek]) => {
      if (cancelled) return;
      setHeaderWeek({
        week,
        currentWeek,
        lastWeek: league ? lastWeekOf(league) : Math.max(week, currentWeek),
        regularSeasonWeeks: league ? regularSeasonWeeksOf(league) : null,
        firstWeek: PRESEASON_WEEK,
        onChange: (w) => router.push(`/recap?id=${leagueId}&week=${w}`),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [leagueId, week, router]);
  useEffect(() => () => setHeaderWeek(null), []);

  // No week in the URL yet — resolve which week's write-up should be open and pin it into the URL so the recap is bookmarkable.
  useEffect(() => {
    if (!leagueId || weekParam) return;
    getRecapWeek().then((recapWeek) => {
      router.replace(`/recap?id=${leagueId}&week=${recapWeek}`);
    });
  }, [leagueId, weekParam, router]);

  if (!leagueId) {
    return <LeaguePicker title="Write-ups" commishOnly href={(id) => `/recap?id=${id}`} />;
  }
  if (error) {
    return <Card className="p-12 text-center text-sm text-status-critical">{error}</Card>;
  }
  if (week === null || !header || (!isPreseason && !recapData)) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading recap…</Card>;
  }

  return (
    <div className="flex flex-col gap-6 animate-[rise_0.5s_ease-out_backwards]">
      {/* Gives the browser a live use of the display font so it's actually loaded — see recap-graphic.ts, which draws with it via its resolved font-family name, not this class. */}
      <span aria-hidden className={`${recapDisplayFont.className} absolute h-0 w-0 overflow-hidden`}>
        .
      </span>

      <div className="flex flex-col gap-1">
        <TitleWithHistory
          actions={
            <>
              <GraphicCopyMenu
                graphicStatus={actions.graphicStatus}
                graphicError={actions.graphicError}
                splitStatus={actions.splitStatus}
                splitError={actions.splitError}
                splitPartCount={actions.splitPartCount}
                partCopied={actions.partCopied}
                onCopyFull={actions.handleCopyGraphic}
                onCopySplit={actions.handleCopySplitGraphic}
                onCopySplitPart={actions.handleCopySplitPart}
              />
              {money?.profile.writeupDocId && googleClientId ? (
                // Typing directly into the Doc already leaves a plain-text copy
                // there, so Save to Doc stands in for Copy Text here.
                <IconButton
                  icon={actions.docStatus === "saved" ? <CheckIcon /> : <UploadIcon />}
                  label={
                    actions.docStatus === "saving" ? "Saving to Doc…" : actions.docStatus === "saved" ? "Saved to Doc" : "Save to Doc"
                  }
                  variant="primary"
                  onClick={actions.handleSaveToDoc}
                  disabled={actions.docStatus === "saving"}
                />
              ) : (
                <IconButton
                  icon={actions.copied ? <CheckIcon /> : <CopyIcon />}
                  label={actions.copied ? "Copied plain text" : "Copy plain text"}
                  onClick={actions.handleCopy}
                />
              )}
            </>
          }
        >
          <h1 className="min-w-0 text-2xl font-semibold text-ink-primary">{header.leagueName}</h1>
        </TitleWithHistory>
        <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            {actions.lastSavedAt ? (
              <span>Auto-saved {new Date(actions.lastSavedAt).toLocaleString()}</span>
            ) : (
              <span>Not saved yet</span>
            )}
            {money?.profile.writeupDocId && !googleClientId ? (
              <a href="/settings" className="underline decoration-dotted hover:text-ink-secondary">
                Connect Google Docs in Settings to save write-ups there
              </a>
            ) : null}
            {actions.graphicStatus === "error" && actions.graphicError ? (
              <span className="text-status-critical">Copy graphic failed: {actions.graphicError}</span>
            ) : null}
            {actions.docStatus === "error" && actions.docError ? (
              <span className="text-status-critical">Google Doc save failed: {actions.docError}</span>
            ) : null}
          </div>
        </div>
      </div>

      {(() => {
        const editor = (
          <RecapEditor {...editorProps} />
        );
        // The structured editor's .recap-neon wrapper (see RecapSectionsEditor)
        // paints its own dark card background matching the exported graphic —
        // wrapping it in the page's light Card would double up on chrome. The
        // plain-textarea fallback (no model) still needs the Card for its
        // border/background.
        if (!model) return <Card className="p-5">{editor}</Card>;
        // The contents down the left, as wide as they need, the write-up taking the rest;
        // on a phone, just the write-up.
        return (
          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[20rem_minmax(0,1fr)]">
            <aside className="hidden md:sticky md:top-[calc(var(--header-h,0px)+1rem)] md:block md:max-h-[calc(100vh-var(--header-h,0px)-2rem)] md:overflow-y-auto">
              <RecapContents {...contentsProps!} />
            </aside>
            <div className="min-w-0">{editor}</div>
          </div>
        );
      })()}
    </div>
  );
}

export default function RecapPage() {
  return (
    <Suspense fallback={<Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>}>
      <RecapContent />
    </Suspense>
  );
}
