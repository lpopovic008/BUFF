"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { IconLink, IconButton } from "@/components/ui/IconButton";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentIcon,
  CopyIcon,
  ImageIcon,
  CheckIcon,
  UploadIcon,
} from "@/components/ui/Icon";
import { computeWeekRecap, WeekRecapData } from "@/lib/league-data";
import {
  formatRecapMarkdown,
  buildWeeklyRecapModel,
  buildPreseasonRecapModel,
  findWeekTopStarters,
} from "@/lib/format-recap";
import { RecapModel, parseRecapModel } from "@/lib/recap-model";
import {
  formatBowlResultLine,
  formatUpcomingBowlBlock,
  formatUpcomingHonorableBlock,
  resolveBowlMatchup,
  resolveBowlMatchupPreview,
  BowlMatchupResult,
  BowlMatchupPreview,
} from "@/lib/bowl-narrative";
import { loadLeagueMoney, LeagueMoney } from "@/lib/league-money";
import { findLeagueProfile, defaultProfileFor } from "@/lib/league-config";
import { summarizeWeek } from "@/lib/payouts";
import { getRecap, getBowlPicks, saveBowlPicks, RecapBowlPicks, SavedRecap } from "@/lib/localStore";
import { resolveGoogleClientId } from "@/lib/google-config";
import { useConfig } from "@/hooks/useConfig";
import { useRecapActions } from "@/hooks/useRecapActions";
import { getRecapWeek, getLeague, getLeagueRosters, getLeagueUsers } from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players";
import { displayManagerName } from "@/lib/format";
import { useLeagueTeams } from "@/hooks/useLeagueTeams";
import { recapDisplayFont } from "@/lib/fonts";
import { RecapEditor } from "./RecapEditor";

// week=0 is a sentinel for the preseason write-up — a free-write space that
// exists before there's any real matchup data to auto-generate a recap from.
const PRESEASON_WEEK = 0;

function simplePreseasonTemplate(leagueName: string, season: string): string {
  return [`🚨📋 ${leagueName} — ${season} Preseason`, "", "[Write your season preview here.]", ""].join("\n");
}

/**
 * Where a freshly-computed house-style model meets whatever was last saved.
 * A saved recap always wins outright (a save is a deliberate checkpoint) —
 * preferring its own structured `model` when one exists, falling back to
 * recovering one from its flat `body` (see parseRecapModel) for a recap
 * saved before the header boxes existed. When that recovery can't confirm
 * the shape, the flat body is kept as a single plain box rather than risking
 * silently dropping part of a hand-edited write-up into the wrong field.
 */
function resolveHouseStyleState(
  fresh: RecapModel,
  saved: SavedRecap | null
): { model: RecapModel | null; plainBody: string; fresh: RecapModel } {
  if (!saved) return { model: fresh, plainBody: "", fresh };
  if (saved.model) return { model: saved.model, plainBody: "", fresh };
  const parsed = parseRecapModel(saved.body);
  return parsed ? { model: parsed, plainBody: "", fresh } : { model: null, plainBody: saved.body, fresh };
}

async function fetchTeamNames(leagueId: string): Promise<Record<number, string>> {
  const [rosters, users] = await Promise.all([getLeagueRosters(leagueId), getLeagueUsers(leagueId)]);
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const teamNames: Record<number, string> = {};
  for (const r of rosters) {
    teamNames[r.roster_id] = displayManagerName(r.owner_id ? usersById.get(r.owner_id) : undefined);
  }
  return teamNames;
}

interface RecapHeader {
  title: string;
  leagueName: string;
  season: string;
  subtitle: string;
}

function RecapContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const leagueId = searchParams.get("id");
  const weekParam = searchParams.get("week");
  const week = weekParam !== null ? Number(weekParam) : null;
  const isPreseason = week === PRESEASON_WEEK;

  const [recapData, setRecapData] = useState<WeekRecapData | null>(null);
  const [header, setHeader] = useState<RecapHeader | null>(null);
  // The structured, header-by-header write-up — set whenever the league has
  // the commissioner house style. `plainBody` backs the single flat text box
  // used instead, either because the league doesn't use that style at all, or
  // because a previously-saved recap's text can't be recovered into the
  // structured shape (see parseRecapModel) and editing it as one field is the
  // safe fallback rather than risking silently losing part of it.
  const [model, setModel] = useState<RecapModel | null>(null);
  const [plainBody, setPlainBody] = useState("");
  // The structured model computed fresh from this week's live data —
  // computed regardless of whether a saved recap won out over it above, so
  // the plain-textarea fallback can still offer "switch to the new format"
  // rather than being permanently stuck once a recap predates the header
  // boxes (see resolveHouseStyleState and RecapEditor's onSwitchToNewFormat).
  const [freshModel, setFreshModel] = useState<RecapModel | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [money, setMoney] = useState<LeagueMoney | null>(null);
  const [upcomingPicks, setUpcomingPicks] = useState<RecapBowlPicks | null>(null);
  const [teamNames, setTeamNames] = useState<Record<number, string>>({});
  // Player id -> display name, for the High Scorer section's live "led by"
  // callout (see RecapSectionsEditor) — resolved once per week from the
  // high scorer's top starters, same lookup the mechanical text generator
  // already needed.
  const [highScorerNames, setHighScorerNames] = useState<Record<string, string>>({});
  // The same bowl-of-the-week/honorable-mention picks as structured data (who
  // actually won, not just the sentence) — feeds the recap graphic's poster
  // cards, which need to tell winner from loser to style and label them
  // apart. Null wherever the flat text also falls back to brackets.
  const [bowlMatchup, setBowlMatchup] = useState<BowlMatchupResult | null>(null);
  const [honorableMatchup, setHonorableMatchup] = useState<BowlMatchupResult | null>(null);
  const [upcomingBowlPreview, setUpcomingBowlPreview] = useState<BowlMatchupPreview | null>(null);
  const [upcomingHonorablePreview, setUpcomingHonorablePreview] = useState<BowlMatchupPreview | null>(null);

  // Feeds the bowl-pick team selects — a league-wide roster dump, loaded lazily
  // (the picker shows "Loading teams…" until ready) and needed for both regular
  // weeks and the Preseason page's own "Upcoming Week 1" picker.
  const teamOptions = useLeagueTeams(leagueId);
  // Roster id -> name/logo/username, for the recap graphic's poster cards
  // and its Winners/Standings sections (which list the real @handle, not
  // the team's display name). Reuses the same fetch the bowl-pick team
  // pickers already make — no extra network call.
  const teamsById = useMemo(() => {
    const map: Record<number, { name: string; avatar: string | null; username: string }> = {};
    for (const t of teamOptions ?? []) map[t.rosterId] = { name: t.teamName, avatar: t.avatar, username: t.username };
    return map;
  }, [teamOptions]);
  const { config } = useConfig();
  const googleClientId = resolveGoogleClientId(config.googleClientId);

  // No week in the URL yet — resolve which week's write-up should be open and pin it into the URL so the recap is bookmarkable.
  useEffect(() => {
    if (!leagueId || weekParam) return;
    getRecapWeek().then((recapWeek) => {
      router.replace(`/recap?id=${leagueId}&week=${recapWeek}`);
    });
  }, [leagueId, weekParam, router]);

  useEffect(() => {
    if (!leagueId || week === null || !Number.isFinite(week) || week < PRESEASON_WEEK) return;
    let cancelled = false;

    (async () => {
      setRecapData(null);
      setHeader(null);
      setModel(null);
      setPlainBody("");
      setFreshModel(null);
      setMoney(null);
      setUpcomingPicks(null);
      setTeamNames({});
      setHighScorerNames({});
      setBowlMatchup(null);
      setHonorableMatchup(null);
      setUpcomingBowlPreview(null);
      setUpcomingHonorablePreview(null);
      setError(null);
      try {
        if (week === PRESEASON_WEEK) {
          const league = await getLeague(leagueId);
          if (cancelled || !league) return;
          // Every league gets the graphic-style write-up, whether or not
          // the commish has hand-entered real payout rules for it — a
          // league with no matching LeagueProfile still gets a ledger (via
          // defaultProfileFor), just with every payout at $0, so the same
          // High Scorer/Winners/Last Week/Standings sections show up
          // everywhere instead of only for leagues with configured money.
          const leagueMoney = await loadLeagueMoney(leagueId, findLeagueProfile(league.name) ?? defaultProfileFor(league));
          if (cancelled) return;
          setMoney(leagueMoney);
          setHeader({
            title: `${league.name} — Preseason`,
            leagueName: league.name,
            season: league.season,
            subtitle: "Free-write — nothing to auto-generate yet.",
          });

          const saved = getRecap(leagueId, league.season, PRESEASON_WEEK);
          if (leagueMoney) {
            const names = await fetchTeamNames(leagueId);
            if (cancelled) return;
            setTeamNames(names);

            const upcoming = getBowlPicks(leagueId, league.season, PRESEASON_WEEK + 1);
            setUpcomingPicks(upcoming);
            setUpcomingBowlPreview(resolveBowlMatchupPreview(upcoming.bowlOfWeek));
            setUpcomingHonorablePreview(resolveBowlMatchupPreview(upcoming.honorableBowl));
            const fresh = buildPreseasonRecapModel({
              leagueName: league.name,
              season: league.season,
              upcomingBowlLines: formatUpcomingBowlBlock(upcoming.bowlOfWeek, PRESEASON_WEEK + 1, names, []),
              upcomingHonorableLines: formatUpcomingHonorableBlock(upcoming.honorableBowl, PRESEASON_WEEK + 1, names),
            });
            const resolved = resolveHouseStyleState(fresh, saved);
            setModel(resolved.model);
            setPlainBody(resolved.plainBody);
            setFreshModel(resolved.fresh);
          } else {
            setModel(null);
            setPlainBody(saved ? saved.body : simplePreseasonTemplate(league.name, league.season));
            setFreshModel(null);
          }
          setSavedAt(saved ? saved.savedAt : null);
          return;
        }

        const data = await computeWeekRecap(leagueId, week);
        if (cancelled || !data) return;
        setRecapData(data);
        setHeader({
          title: `${data.league.name} — Week ${week} Recap`,
          leagueName: data.league.name,
          season: data.league.season,
          subtitle: "Auto-generated from Sleeper data. Edit freely before copying it out to your group chat.",
        });

        // Every league gets the house-style recap — the money blocks, last
        // week's bowl-game result, and next week's marquee-matchup preview —
        // whether or not it has real payout rules configured (see
        // defaultProfileFor); a league without one just shows $0 everywhere
        // money would otherwise appear.
        const leagueMoney = await loadLeagueMoney(leagueId, findLeagueProfile(data.league.name) ?? defaultProfileFor(data.league));
        if (cancelled) return;
        setMoney(leagueMoney);

        const saved = getRecap(leagueId, data.league.season, week);
        if (leagueMoney) {
          // Team names come straight from this week's own matchup data — no extra
          // fetch needed, and it's already every team in the league.
          const names: Record<number, string> = {};
          for (const g of data.games) for (const t of g.teams) names[t.rosterId] = t.teamName;
          setTeamNames(names);

          // This week's own bowl pick (set on last week's page) resolves against
          // this week's now-final matchups; next week's pick (being set on THIS
          // page, below) previews using standings through this week.
          const resultPick = getBowlPicks(leagueId, data.league.season, week);
          const upcoming = getBowlPicks(leagueId, data.league.season, week + 1);
          setUpcomingPicks(upcoming);
          setBowlMatchup(resolveBowlMatchup(resultPick.bowlOfWeek, data.games));
          setHonorableMatchup(resolveBowlMatchup(resultPick.honorableBowl, data.games));
          setUpcomingBowlPreview(resolveBowlMatchupPreview(upcoming.bowlOfWeek));
          setUpcomingHonorablePreview(resolveBowlMatchupPreview(upcoming.honorableBowl));

          const summary = summarizeWeek(leagueMoney.ledger, week);
          const leaderIds = summary?.highScorer
            ? findWeekTopStarters(summary.highScorer.rosterId, data.games).map((l) => l.playerId)
            : [];
          const resolvedPlayers = leaderIds.length > 0 ? await resolvePlayers(leaderIds) : [];
          if (cancelled) return;
          const playerNames: Record<string, string> = {};
          for (const p of resolvedPlayers) playerNames[p.playerId] = p.name;
          setHighScorerNames(playerNames);

          const fresh = buildWeeklyRecapModel({
            data,
            ledger: leagueMoney.ledger,
            playerNames,
            bowlResultLine: formatBowlResultLine("👑", resultPick.bowlOfWeek, names, data.games),
            honorableResultLine: formatBowlResultLine("🏆", resultPick.honorableBowl, names, data.games),
            upcomingBowlLines: formatUpcomingBowlBlock(upcoming.bowlOfWeek, week + 1, names, data.standingsAfter),
            upcomingHonorableLines: formatUpcomingHonorableBlock(upcoming.honorableBowl, week + 1, names),
          });
          const resolvedState = resolveHouseStyleState(fresh, saved);
          setModel(resolvedState.model);
          setPlainBody(resolvedState.plainBody);
          setFreshModel(resolvedState.fresh);
        } else {
          setModel(null);
          setPlainBody(saved ? saved.body : formatRecapMarkdown(data));
          setFreshModel(null);
        }
        setSavedAt(saved ? saved.savedAt : null);
      } catch {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, week]);

  /**
   * A next-week pick changed (team, or a rename routed through here — see
   * renameUpcomingBowl below). Only the two "upcoming" preview fields are
   * mechanically derived from picks, so only those get regenerated — every
   * other field (title, winners, standings, hand-typed details, ...) is left
   * exactly as the commish has it. Rebuilding the whole model from scratch
   * here used to silently overwrite whatever they'd edited elsewhere on the
   * page the moment they touched a pick.
   */
  function handlePicksSaved(picks: RecapBowlPicks) {
    setUpcomingPicks(picks);
    setUpcomingBowlPreview(resolveBowlMatchupPreview(picks.bowlOfWeek));
    setUpcomingHonorablePreview(resolveBowlMatchupPreview(picks.honorableBowl));
    if (!leagueId || week === null) return;
    setModel((current) => {
      if (!current) return current;
      if (week === PRESEASON_WEEK) {
        return {
          ...current,
          upcomingBowlLines: formatUpcomingBowlBlock(picks.bowlOfWeek, PRESEASON_WEEK + 1, teamNames, []).join("\n"),
          upcomingHonorableLines: formatUpcomingHonorableBlock(picks.honorableBowl, PRESEASON_WEEK + 1, teamNames).join("\n"),
        };
      }
      if (!recapData) return current;
      return {
        ...current,
        upcomingBowlLines: formatUpcomingBowlBlock(picks.bowlOfWeek, week + 1, teamNames, recapData.standingsAfter).join(
          "\n"
        ),
        upcomingHonorableLines: formatUpcomingHonorableBlock(picks.honorableBowl, week + 1, teamNames).join("\n"),
      };
    });
  }

  /** A next-week matchup's team slot changed — writes back to the shared pick record and folds the new preview lines into the model via handlePicksSaved above. */
  function changeUpcomingTeam(field: keyof RecapBowlPicks, slot: 0 | 1, rosterId: number | "") {
    if (!leagueId || !header || week === null) return;
    const pickWeek = week + 1;
    const current = upcomingPicks ?? getBowlPicks(leagueId, header.season, pickWeek);
    const pick = current[field];
    const nextIds = [...pick.rosterIds];
    if (rosterId !== "") nextIds[slot] = rosterId;
    else nextIds.splice(slot, 1);
    const updatedPick = { ...pick, rosterIds: nextIds.filter((id) => id !== undefined) };
    const updated: RecapBowlPicks = { ...current, [field]: updatedPick };
    saveBowlPicks(leagueId, header.season, pickWeek, updated);
    handlePicksSaved(updated);
  }

  /**
   * Renaming this week's Bowl of the Week/Honorable Mention writes straight
   * back to the same week-keyed BowlGamePick that was set as the "upcoming"
   * pick on last week's page (see saveBowlPicks/getBowlPicks) — so the name
   * is never duplicated per-section, and a league visiting last week's page
   * again would see the same updated name in its own preview box too.
   */
  function renameResultBowl(field: keyof RecapBowlPicks, name: string) {
    if (!leagueId || !header || !recapData || week === null) return;
    const current = getBowlPicks(leagueId, header.season, week);
    const updatedPick = { ...current[field], name };
    const updated: RecapBowlPicks = { ...current, [field]: updatedPick };
    saveBowlPicks(leagueId, header.season, week, updated);

    const matchup = resolveBowlMatchup(updatedPick, recapData.games);
    if (field === "bowlOfWeek") setBowlMatchup(matchup);
    else setHonorableMatchup(matchup);

    setModel((prev) => {
      if (!prev) return prev;
      if (field === "bowlOfWeek") {
        return { ...prev, bowlResult: formatBowlResultLine("👑", updatedPick, teamNames, recapData.games) };
      }
      return { ...prev, honorableResult: formatBowlResultLine("🏆", updatedPick, teamNames, recapData.games) };
    });
  }

  /**
   * Renaming next week's preview writes to the same pick record
   * handlePicksSaved above already knows how to fold back into the model —
   * reused as-is so a rename regenerates the preview lines identically to a
   * picker save.
   */
  function renameUpcomingBowl(field: keyof RecapBowlPicks, name: string) {
    if (!leagueId || !header || week === null) return;
    const pickWeek = week + 1;
    const current = upcomingPicks ?? getBowlPicks(leagueId, header.season, pickWeek);
    const updated: RecapBowlPicks = { ...current, [field]: { ...current[field], name } };
    saveBowlPicks(leagueId, header.season, pickWeek, updated);
    handlePicksSaved(updated);
  }

  const actions = useRecapActions({
    leagueId: leagueId ?? "",
    season: header?.season ?? "",
    week: week ?? PRESEASON_WEEK,
    title: header?.title ?? "",
    model,
    plainBody,
    savedAt,
    // Gates auto-save (see useRecapActions) — same condition as the loading
    // guard just below, so a week switch's brief model=null/plainBody=""
    // reset never gets mistaken for a real edit and auto-saved over
    // whatever this week already had.
    loaded: Boolean(leagueId) && !error && week !== null && !!header && (isPreseason || !!recapData),
    writeupDocId: money?.profile.writeupDocId,
    googleClientId,
    bowlMatchup,
    honorableMatchup,
    upcomingMatchup: upcomingBowlPreview,
    upcomingHonorableMatchup: upcomingHonorablePreview,
    teams: teamsById,
    recapData,
    ledger: money?.ledger ?? null,
    playerNames: highScorerNames,
  });

  if (!leagueId) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">No league selected.</Card>;
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

      <div className="sticky top-0 z-10 -mx-3 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-page/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2 text-sm">
          {week > PRESEASON_WEEK + 1 ? (
            <Link
              href={`/recap?id=${leagueId}&week=${week - 1}`}
              className="flex items-center gap-1 border border-border px-3 py-1.5 font-medium text-ink-secondary transition-colors hover:bg-page"
            >
              <ChevronLeftIcon className="h-4 w-4" /> Week {week - 1}
            </Link>
          ) : null}
          {week === PRESEASON_WEEK + 1 ? (
            <Link
              href={`/recap?id=${leagueId}&week=${PRESEASON_WEEK}`}
              className="flex items-center gap-1 border border-border px-3 py-1.5 font-medium text-ink-secondary transition-colors hover:bg-page"
            >
              <ChevronLeftIcon className="h-4 w-4" /> Preseason
            </Link>
          ) : null}
          <Link
            href={`/recap?id=${leagueId}&week=${week + 1}`}
            className="flex items-center gap-1 border border-border px-3 py-1.5 font-medium text-ink-secondary transition-colors hover:bg-page"
          >
            {isPreseason ? "Week 1" : `Week ${week + 1}`} <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <IconLink href={`/recap/archive?id=${leagueId}`} icon={<DocumentIcon />} label="Recap archive" />
          <div className="relative">
            <IconButton
              icon={actions.graphicStatus === "copied" ? <CheckIcon /> : <ImageIcon />}
              label={
                actions.graphicStatus === "copying"
                  ? "Rendering graphic…"
                  : actions.graphicStatus === "copied"
                    ? "Copied graphic"
                    : "Copy graphic"
              }
              onClick={actions.handleCopyGraphic}
              disabled={actions.graphicStatus === "copying"}
            />
            {/* A sliver of the graphic's own neon theme along the bottom edge — ties this button to what it produces. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-[#ff2e9a] via-[#22d3ee] to-[#39ff8e]"
            />
          </div>
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
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-primary">{header.title}</h1>
          <p className="mt-1 text-sm text-ink-secondary">{header.subtitle}</p>
        </div>
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

      {(() => {
        const editor = (
          <RecapEditor
            model={model}
            onModelChange={setModel}
            plainBody={plainBody}
            onPlainBodyChange={setPlainBody}
            freshModel={freshModel}
            bowlMatchup={bowlMatchup}
            honorableMatchup={honorableMatchup}
            upcomingMatchup={upcomingBowlPreview}
            upcomingHonorableMatchup={upcomingHonorablePreview}
            teams={teamsById}
            teamOptions={teamOptions}
            recapData={recapData}
            ledger={money?.ledger ?? null}
            week={week}
            playerNames={highScorerNames}
            onRenameBowl={(name) => renameResultBowl("bowlOfWeek", name)}
            onRenameHonorable={(name) => renameResultBowl("honorableBowl", name)}
            onRenameUpcomingBowl={(name) => renameUpcomingBowl("bowlOfWeek", name)}
            onRenameUpcomingHonorable={(name) => renameUpcomingBowl("honorableBowl", name)}
            onChangeUpcomingBowlTeam={(slot, rosterId) => changeUpcomingTeam("bowlOfWeek", slot, rosterId)}
            onChangeUpcomingHonorableTeam={(slot, rosterId) => changeUpcomingTeam("honorableBowl", slot, rosterId)}
          />
        );
        // The structured editor's .recap-neon wrapper (see RecapSectionsEditor)
        // paints its own dark card background matching the exported graphic —
        // wrapping it in the page's light Card would double up on chrome. The
        // plain-textarea fallback (no model) still needs the Card for its
        // border/background.
        return model ? editor : <Card className="p-5">{editor}</Card>;
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
