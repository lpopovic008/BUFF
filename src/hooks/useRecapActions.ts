"use client";

// Every action the recap write-up supports — copy as text, copy as a
// graphic, save to the commish's Google Doc, plus auto-saving to the local
// archive in the background — as one hook so the toolbar (now pinned at the
// top of the page, see recap/page.tsx) and the section editor can share the
// exact same state without either owning it. Previously lived inside
// RecapEditor itself; pulled out once the buttons needed to render somewhere
// else in the tree entirely.

import { useEffect, useRef, useState } from "react";
import { saveRecap } from "@/lib/localStore";
import { RecapModel, joinRecapModel } from "@/lib/recap-model";
import { drawRecapGraphic, drawRecapGraphicParts, RecapGraphicExtras } from "@/lib/recap-graphic";
import {
  GraphicTeam,
  decidedMatchupFor,
  previewMatchupFor,
  winnersForGraphic,
  highScorerForGraphic,
  lastWeekForGraphic,
  standingsForGraphic,
  recordsStandingsForGraphic,
} from "@/lib/recap-graphic-data";
import { BowlMatchupResult, BowlMatchupPreview } from "@/lib/bowl-narrative";
import { recapDisplayFont } from "@/lib/fonts";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { appendWriteupToDoc, DOCS_SCOPE } from "@/lib/google-docs";
import { WeekRecapData } from "@/lib/league-data";
import { PayoutLedger } from "@/lib/payouts";
import { teamAvatarUrlForCanvas } from "@/lib/sleeper";

export interface RecapActionsArgs {
  leagueId: string;
  season: string;
  week: number;
  title: string;
  model: RecapModel | null;
  plainBody: string;
  savedAt: string | null;
  /** False while this week's recap is still loading (or the week/league is switching) — gates auto-save below, so the brief model=null/plainBody="" reset a week switch does never gets mistaken for a real edit and saved over whatever's already there. */
  loaded: boolean;
  writeupDocId?: string;
  /** Resolved via resolveGoogleClientId() — empty when Google Docs isn't connected, in which case Save to Doc stays hidden. */
  googleClientId: string;
  /** This week's decided Bowl of the Week / Honorable Mention picks, and next week's still-undecided marquee pick — feed the recap graphic's poster cards. Null wherever there's no resolvable pick yet. */
  bowlMatchup: BowlMatchupResult | null;
  honorableMatchup: BowlMatchupResult | null;
  upcomingMatchup: BowlMatchupPreview | null;
  upcomingHonorableMatchup: BowlMatchupPreview | null;
  /** Roster id -> team name/logo/username, for turning the matchups above into the graphic's MatchupTeam shape, and for the Winners/Standings sections' usernames. */
  teams: Record<number, GraphicTeam>;
  /** This write-up's own week's matchup data and money ledger — feeds the graphic's High Scorer podium, Winners margins, and Updated Standings, the same live data the on-screen sections already show (see RecapSectionsEditor). Null in preseason or before it's loaded. */
  recapData: WeekRecapData | null;
  ledger: PayoutLedger | null;
  /** Player id -> display name, for the High Scorer podium's top-3-player photos. */
  playerNames: Record<string, string>;
}

export function useRecapActions(args: RecapActionsArgs) {
  const [copied, setCopied] = useState(false);
  const [graphicStatus, setGraphicStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [graphicError, setGraphicError] = useState<string | null>(null);
  // The 3-image split (see handleCopySplitGraphic) tries copying every part
  // to the clipboard in one shot first; "needs-parts" is the fallback state
  // for a browser that won't accept multiple ClipboardItems in one write()
  // call, at which point splitParts holds each part for handleCopySplitPart
  // to copy individually and partCopied tracks which of those the commish
  // has actually clicked so the UI can check them off one at a time.
  const [splitStatus, setSplitStatus] = useState<"idle" | "generating" | "copied" | "needs-parts" | "error">("idle");
  const [splitError, setSplitError] = useState<string | null>(null);
  const [splitParts, setSplitParts] = useState<Promise<Blob>[] | null>(null);
  const [partCopied, setPartCopied] = useState<boolean[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState(args.savedAt);
  const [docStatus, setDocStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [docError, setDocError] = useState<string | null>(null);
  // Tracks the last body auto-saved (see the effect below) — a ref rather
  // than state since it's only ever read/written from that effect, never
  // rendered. Never needs resetting on a week switch: the new week's body
  // is different text by construction, so it naturally won't match
  // whatever the previous week last saved.
  const lastSavedBodyRef = useRef<string | null>(null);

  // A new week's own recap is a clean slate for every action's status — this
  // hook lives in the page component now (see recap/page.tsx), which doesn't
  // remount on a week change the way the old keyed <RecapEditor> did. Reset
  // during render (not an effect) per React's "adjusting state when a prop
  // changes" pattern, so it lands in the same commit as the week switch
  // instead of causing an extra cascading render.
  const weekKey = `${args.leagueId}-${args.week}`;
  const [resetKey, setResetKey] = useState(weekKey);
  if (resetKey !== weekKey) {
    setResetKey(weekKey);
    setLastSavedAt(args.savedAt);
    setCopied(false);
    setGraphicStatus("idle");
    setGraphicError(null);
    setSplitStatus("idle");
    setSplitError(null);
    setSplitParts(null);
    setPartCopied([]);
    setDocStatus("idle");
    setDocError(null);
  }

  // The exact text that gets saved, copied, and posted — reassembled from the
  // header boxes on every render, so copying is always exactly what's on
  // screen, headers (and inclusions) included, never a stale or
  // hand-diverged version.
  const body = args.model ? joinRecapModel(args.model) : args.plainBody;

  async function handleCopy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /**
   * Everything drawRecapGraphic/drawRecapGraphicParts need beyond the body
   * text itself — shared by the full-graphic and split-graphic exports so
   * neither can drift from what the other draws.
   */
  function buildGraphicExtras(): RecapGraphicExtras {
    // Sleeper's avatar CDN doesn't reliably send CORS headers, and a
    // custom-uploaded team picture can be hosted anywhere — a canvas-bound
    // <img crossOrigin="anonymous"> (needed to keep the graphic exportable)
    // silently fails to load either and falls back to initials. Route
    // every team logo through the same wsrv.nl proxy player headshots
    // already use (see playerHeadshotUrlForCanvas), just for this export —
    // the on-screen editor keeps using the raw URL directly.
    const canvasTeams: Record<number, GraphicTeam> = {};
    for (const [id, t] of Object.entries(args.teams)) {
      canvasTeams[Number(id)] = { ...t, avatar: t.avatar ? teamAvatarUrlForCanvas(t.avatar) : null };
    }
    const avatarByName: Record<string, string | null> = {};
    for (const t of Object.values(canvasTeams)) avatarByName[t.name] = t.avatar;
    return {
      bowl: decidedMatchupFor(canvasTeams, args.bowlMatchup),
      honorable: decidedMatchupFor(canvasTeams, args.honorableMatchup),
      upcoming: previewMatchupFor(canvasTeams, args.upcomingMatchup),
      upcomingHonorable: previewMatchupFor(canvasTeams, args.upcomingHonorableMatchup),
      highScorer: highScorerForGraphic(
        args.recapData,
        args.ledger,
        args.week,
        canvasTeams,
        args.playerNames,
        args.model?.highScorerDetail ?? ""
      ),
      winners: winnersForGraphic(args.recapData, args.ledger, args.week, canvasTeams),
      lastWeek: lastWeekForGraphic(args.recapData, args.ledger, args.week, canvasTeams),
      standings: standingsForGraphic(args.recapData, args.ledger, args.week, canvasTeams),
      records: recordsStandingsForGraphic(args.recapData, canvasTeams),
      avatarByName,
      displayFontFamily: recapDisplayFont.style.fontFamily,
      include: args.model?.include,
    };
  }

  function canvasToBlobPromise(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Couldn't render the graphic."));
      }, "image/png");
    });
  }

  /** Renders the write-up and its stats as a single image (see recap-graphic.ts)
   * and copies that image to the clipboard, ready to paste into a group chat or
   * post — a shareable graphic instead of formatted text. */
  async function handleCopyGraphic() {
    setGraphicStatus("copying");
    setGraphicError(null);
    try {
      const canvas = document.createElement("canvas");
      await drawRecapGraphic(canvas, body, args.model, buildGraphicExtras());
      // Passed as a Promise (not awaited first) rather than an already-resolved
      // Blob — Safari ties clipboard-write permission to the triggering click,
      // and only accepts that if ClipboardItem gets the still-pending promise.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasToBlobPromise(canvas) })]);
      setGraphicStatus("copied");
      setTimeout(() => setGraphicStatus("idle"), 2000);
    } catch (err) {
      setGraphicStatus("error");
      setGraphicError(err instanceof Error ? err.message : "Couldn't copy the graphic.");
    }
  }

  /**
   * Same picture as handleCopyGraphic, but cut into 3 shorter images (see
   * drawRecapGraphicParts) instead of one tall one — iMessage (and other
   * chat apps) bubble-collapse a sufficiently tall image behind a "tap to
   * view" instead of showing it inline, which a single image can't avoid
   * once the write-up has more than a few sections included. Tries copying
   * all 3 parts to the clipboard in one go first; not every browser accepts
   * multiple ClipboardItems in a single write() call, so a failure there
   * falls back to "needs-parts" — copying each part individually via
   * handleCopySplitPart — instead of just failing outright.
   */
  async function handleCopySplitGraphic() {
    setSplitStatus("generating");
    setSplitError(null);
    setSplitParts(null);
    setPartCopied([]);
    try {
      const canvases = await drawRecapGraphicParts(body, args.model, buildGraphicExtras(), 3);
      const blobPromises = canvases.map(canvasToBlobPromise);
      try {
        await navigator.clipboard.write(blobPromises.map((p) => new ClipboardItem({ "image/png": p })));
        setSplitStatus("copied");
        setTimeout(() => setSplitStatus("idle"), 2000);
      } catch {
        setSplitParts(blobPromises);
        setPartCopied(blobPromises.map(() => false));
        setSplitStatus("needs-parts");
      }
    } catch (err) {
      setSplitStatus("error");
      setSplitError(err instanceof Error ? err.message : "Couldn't render the split graphic.");
    }
  }

  /** Copies just one already-rendered part from the last handleCopySplitGraphic call — the fallback UI for a browser that wouldn't accept all of them in one clipboard write. */
  async function handleCopySplitPart(index: number) {
    const part = splitParts?.[index];
    if (!part) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": part })]);
      setPartCopied((prev) => prev.map((v, i) => (i === index ? true : v)));
    } catch (err) {
      setSplitStatus("error");
      setSplitError(err instanceof Error ? err.message : "Couldn't copy that part.");
    }
  }

  // Auto-saves to this browser's local archive shortly after an edit
  // settles — no more manual "Save to archive" click needed. This is also
  // what Google Sync (see google-drive-sync.ts's onLocalWrite listener)
  // pushes to Drive, so a saved write-up shows up on any other device
  // signed into the same Google account without a separate step.
  useEffect(() => {
    if (!args.loaded) return;
    if (lastSavedBodyRef.current === body) return;
    const timer = setTimeout(() => {
      const now = new Date().toISOString();
      saveRecap({
        leagueId: args.leagueId,
        season: args.season,
        week: args.week,
        title: args.title,
        body,
        model: args.model ?? undefined,
        savedAt: now,
      });
      lastSavedBodyRef.current = body;
      setLastSavedAt(now);
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.loaded, body, args.leagueId, args.season, args.week, args.title]);

  /** Appends the write-up currently shown to the commish's Google Doc — whatever's been hand-edited, not the auto-generated draft. Prompts a Google sign-in popup the first time (or once the cached token expires). */
  async function handleSaveToDoc() {
    if (!args.writeupDocId || !args.googleClientId) return;
    setDocStatus("saving");
    setDocError(null);
    try {
      const accessToken = await getGoogleAccessToken(args.googleClientId, DOCS_SCOPE);
      // week 0 is the preseason sentinel (see recap/page.tsx) — that write-up
      // has no week tab of its own, so it saves straight into the season tab.
      await appendWriteupToDoc(args.writeupDocId, body, accessToken, args.season, args.week === 0 ? null : args.week);
      setDocStatus("saved");
      setTimeout(() => setDocStatus("idle"), 2500);
    } catch (err) {
      setDocStatus("error");
      setDocError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return {
    body,
    copied,
    graphicStatus,
    graphicError,
    splitStatus,
    splitError,
    /** How many parts the last split render actually produced — see drawRecapGraphicParts, which can return fewer than 3 when there aren't enough sections to cut cleanly. */
    splitPartCount: splitParts?.length ?? 0,
    partCopied,
    docStatus,
    docError,
    lastSavedAt,
    handleCopy,
    handleCopyGraphic,
    handleCopySplitGraphic,
    handleCopySplitPart,
    handleSaveToDoc,
  };
}
