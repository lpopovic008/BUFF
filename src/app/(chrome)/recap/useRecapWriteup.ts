"use client";

import { useEffect, useMemo, useState } from "react";
import { computeWeekRecap, MatchupGame, StandingsRow, WeekRecapData } from "@/lib/league-data";
import {
  formatRecapMarkdown,
  buildWeeklyRecapModel,
  buildPreseasonRecapModel,
  findWeekTopStarters,
} from "@/lib/format-recap";
import {
  RecapModel,
  RecapSectionKey,
  parseRecapModel,
  EMPTY_RECAP_MODEL,
  normalizeLayout,
  recapLayout,
  isUpcomingSection,
  matchupNumber,
  matchupTitle,
  MORE_MATCHUPS,
  MoreMatchup,
  MoreMatchupText,
} from "@/lib/recap-model";
import {
  formatBowlResultLine,
  formatUpcomingBowlBlock,
  formatUpcomingHonorableBlock,
  resolveBowlMatchup,
  resolveBowlMatchupPreview,
  BowlMatchupResult,
  BowlMatchupPreview,
  suggestMatchups,
} from "@/lib/bowl-narrative";
import { loadLeagueMoney, LeagueMoney } from "@/lib/league-money";
import { findLeagueProfile, defaultProfileFor } from "@/lib/league-config";
import { summarizeWeek } from "@/lib/payouts";
import { getRecap, getBowlPicks, saveBowlPicks, getRecapLayout, saveRecapLayout, pickAt, withPickAt, RecapBowlPicks, SavedRecap } from "@/lib/localStore";
import { resolveGoogleClientId } from "@/lib/google-config";
import { useConfig } from "@/hooks/useConfig";
import { useRecapActions } from "@/hooks/useRecapActions";
import { getLeague, getLeagueRosters, getLeagueUsers, getMatchups } from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players";
import { displayManagerName } from "@/lib/format";
import { useLeagueTeams } from "@/hooks/useLeagueTeams";
import { recapContents, sectionsToAdd } from "./RecapContents";

// week=0 is a sentinel for the preseason write-up — a free-write space that
// exists before there's any real matchup data to auto-generate a recap from.
export const PRESEASON_WEEK = 0;

function simplePreseasonTemplate(leagueName: string, season: string): string {
  return [`🚨📋 ${leagueName} — ${season} Preseason`, "", "[Write your season preview here.]", ""].join("\n");
}

/**
 * The text of the Matchups of the Week past the second (see RecapModel.more): each one's result from this
 * week's picks (made last week) against this week's games, and its preview from next week's picks.
 */
function moreMatchupTexts(
  resultPicks: RecapBowlPicks | null,
  upcomingPicks: RecapBowlPicks,
  nextWeek: number,
  names: Record<number, string>,
  games: MatchupGame[],
  standings: StandingsRow[]
): Partial<Record<MoreMatchup, MoreMatchupText>> {
  const out: Partial<Record<MoreMatchup, MoreMatchupText>> = {};
  for (const n of MORE_MATCHUPS) {
    out[n] = {
      result: formatBowlResultLine(matchupTitle(n, false).emoji, pickAt(resultPicks, n), names, games),
      resultDetail: "",
      lines: formatUpcomingBowlBlock(pickAt(upcomingPicks, n), nextWeek, names, standings).join("\n"),
      detail: "",
    };
  }
  return out;
}

/** A week's games as pairs of roster ids, from Sleeper's schedule. */
async function weekPairs(leagueId: string, week: number): Promise<[number, number][]> {
  const byMatchup = new Map<number, number[]>();
  for (const m of await getMatchups(leagueId, week)) {
    if (m.matchup_id == null) continue;
    byMatchup.set(m.matchup_id, [...(byMatchup.get(m.matchup_id) ?? []), m.roster_id]);
  }
  return [...byMatchup.values()].filter((ids) => ids.length === 2).map((ids) => [ids[0], ids[1]]);
}

/**
 * Next week's Matchups of the Week still without teams, filled with the best of the games left — best first
 * (see suggestMatchups), each game used once. Only those in the layout; null when there's nothing to fill.
 */
function suggestPicks(picks: RecapBowlPicks, layout: RecapSectionKey[], ranked: [number, number][]): RecapBowlPicks | null {
  const numbers = layout.filter((k) => isUpcomingSection(k)).map((k) => matchupNumber(k) ?? 0).sort((a, b) => a - b);
  const taken = new Set(numbers.flatMap((n) => pickAt(picks, n).rosterIds));
  const left = ranked.filter(([a, b]) => !taken.has(a) && !taken.has(b));
  let next = picks;
  for (const n of numbers) {
    const pick = pickAt(next, n);
    if (pick.rosterIds.length > 0 || left.length === 0) continue;
    next = withPickAt(next, n, { ...pick, rosterIds: [...left.shift()!] });
  }
  return next === picks ? null : next;
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
  // A model saved before a field existed (e.g. records/recordsDetail, added
  // for the Season Standings section) simply won't have that key in its
  // JSON — spreading it over EMPTY_RECAP_MODEL backfills anything missing
  // instead of leaving it undefined, which every reader here (joinRecapModel,
  // isDetailShown, ...) assumes is always at least an empty string.
  // The added sections' text is backfilled from the fresh draft too, so a section added to an older saved week
  // starts from this week's data rather than blank.
  // So is the text of the Matchups of the Week past the second.
  if (saved.model) {
    const model = { ...EMPTY_RECAP_MODEL, ...saved.model, extra: { ...fresh.extra, ...saved.model.extra }, more: { ...fresh.more, ...saved.model.more } };
    return { model, plainBody: "", fresh };
  }
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

/** The league's recap layout (see RecapModel.layout) — what a new week's write-up starts from; the house style's when it's never been changed. */
function leagueLayout(leagueId: string): RecapSectionKey[] | undefined {
  const saved = getRecapLayout(leagueId);
  return saved ? normalizeLayout(saved) : undefined;
}

interface RecapHeader {
  title: string;
  leagueName: string;
  season: string;
}

/**
 * A league's write-up for a week, as the Write-ups page edits it — loaded, worked out from the week's games and
 * money, and auto-saved (see useRecapActions) — and everything that changes it: its sections, the Matchups of the
 * Week's picks and names. Shared by the Write-ups page and the League Room's write-ups panel.
 */
export function useRecapWriteup(leagueId: string | null, week: number | null) {
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
  // This week's own bowl picks, raw and untrimmed — the source the bowl/
  // honorable name inputs bind to directly, instead of the *resolved*
  // bowlMatchup/honorableMatchup below (which is null until both a name AND
  // two teams exist, and trims the name for display). Binding a text input
  // to a value that can vanish or get silently trimmed mid-edit is exactly
  // what made the name field feel broken — see renameResultBowl.
  const [resultPicks, setResultPicks] = useState<RecapBowlPicks | null>(null);
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
  // How many Matchups of the Week there can be — one per game the league plays a week — and next week's games,
  // best first (see suggestMatchups), for filling in any added later.
  const [maxMatchups, setMaxMatchups] = useState(2);
  const [rankedPairs, setRankedPairs] = useState<[number, number][]>([]);
  // The Matchups of the Week past the second: how this week's turned out, and next week's for the graphic.
  const moreResults = useMemo(() => {
    const out: Record<number, BowlMatchupResult | null> = {};
    for (const n of MORE_MATCHUPS) out[n] = recapData ? resolveBowlMatchup(pickAt(resultPicks, n), recapData.games) : null;
    return out;
  }, [resultPicks, recapData]);
  const morePreviews = useMemo(() => {
    const out: Record<number, BowlMatchupPreview | null> = {};
    for (const n of MORE_MATCHUPS) out[n] = resolveBowlMatchupPreview(pickAt(upcomingPicks, n));
    return out;
  }, [upcomingPicks]);

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
      setResultPicks(null);
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
          });

          const saved = getRecap(leagueId, league.season, PRESEASON_WEEK);
          if (leagueMoney) {
            const names = await fetchTeamNames(leagueId);
            if (cancelled) return;
            setTeamNames(names);

            // Week 1's games, for its Matchups of the Week — in the schedule's order, there being no standings yet.
            const pairs = await weekPairs(leagueId, PRESEASON_WEEK + 1);
            if (cancelled) return;
            setMaxMatchups(Math.max(2, pairs.length));
            setRankedPairs(suggestMatchups(pairs, []));
            let upcoming = getBowlPicks(leagueId, league.season, PRESEASON_WEEK + 1);
            const suggested = suggestPicks(upcoming, recapLayout({ layout: saved?.model?.layout ?? leagueLayout(leagueId) }), suggestMatchups(pairs, []));
            if (suggested) {
              upcoming = suggested;
              saveBowlPicks(leagueId, league.season, PRESEASON_WEEK + 1, upcoming);
            }
            setUpcomingPicks(upcoming);
            setUpcomingBowlPreview(resolveBowlMatchupPreview(upcoming.bowlOfWeek));
            setUpcomingHonorablePreview(resolveBowlMatchupPreview(upcoming.honorableBowl));
            const fresh = {
              ...buildPreseasonRecapModel({
                layout: leagueLayout(leagueId),
                leagueName: league.name,
                season: league.season,
                upcomingBowlLines: formatUpcomingBowlBlock(upcoming.bowlOfWeek, PRESEASON_WEEK + 1, names, []),
                upcomingHonorableLines: formatUpcomingHonorableBlock(upcoming.honorableBowl, PRESEASON_WEEK + 1, names),
              }),
              more: moreMatchupTexts(null, upcoming, PRESEASON_WEEK + 1, names, [], []),
            };
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
          // Next week's Matchups of the Week still without teams get the best of next week's games (see suggestMatchups).
          const pairs = await weekPairs(leagueId, week + 1);
          if (cancelled) return;
          setMaxMatchups(Math.max(2, pairs.length || data.games.length));
          setRankedPairs(suggestMatchups(pairs, data.standingsAfter));
          let upcoming = getBowlPicks(leagueId, data.league.season, week + 1);
          const suggested = suggestPicks(upcoming, recapLayout({ layout: saved?.model?.layout ?? leagueLayout(leagueId) }), suggestMatchups(pairs, data.standingsAfter));
          if (suggested) {
            upcoming = suggested;
            saveBowlPicks(leagueId, data.league.season, week + 1, upcoming);
          }
          setUpcomingPicks(upcoming);
          setResultPicks(resultPick);
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

          const fresh = {
            ...buildWeeklyRecapModel({
              layout: leagueLayout(leagueId),
              data,
              ledger: leagueMoney.ledger,
              playerNames,
              bowlResultLine: formatBowlResultLine("👑", resultPick.bowlOfWeek, names, data.games),
              honorableResultLine: formatBowlResultLine("🏆", resultPick.honorableBowl, names, data.games),
              upcomingBowlLines: formatUpcomingBowlBlock(upcoming.bowlOfWeek, week + 1, names, data.standingsAfter),
              upcomingHonorableLines: formatUpcomingHonorableBlock(upcoming.honorableBowl, week + 1, names),
            }),
            more: moreMatchupTexts(resultPick, upcoming, week + 1, names, data.games, data.standingsAfter),
          };
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
   * renameUpcoming below). Only the "upcoming" preview fields are
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
    if (week !== PRESEASON_WEEK && !recapData) return;
    // Before Week 1 there are no standings for the previews' PF/PA yet.
    const standings = week === PRESEASON_WEEK ? [] : (recapData?.standingsAfter ?? []);
    setModel((current) => {
      if (!current) return current;
      const more = { ...current.more };
      for (const n of MORE_MATCHUPS) {
        const lines = formatUpcomingBowlBlock(pickAt(picks, n), week + 1, teamNames, standings).join("\n");
        more[n] = { result: "", resultDetail: "", detail: "", ...more[n], lines };
      }
      return {
        ...current,
        upcomingBowlLines: formatUpcomingBowlBlock(picks.bowlOfWeek, week + 1, teamNames, standings).join("\n"),
        upcomingHonorableLines: formatUpcomingHonorableBlock(picks.honorableBowl, week + 1, teamNames).join("\n"),
        more,
      };
    });
  }

  /** One of next week's Matchups of the Week (1-based) got a team — writes back to the shared pick record and folds the new preview lines into the model via handlePicksSaved above. */
  function changeUpcomingTeam(n: number, slot: 0 | 1, rosterId: number | "") {
    if (!leagueId || !header || week === null) return;
    const pickWeek = week + 1;
    const current = upcomingPicks ?? getBowlPicks(leagueId, header.season, pickWeek);
    const pick = pickAt(current, n);
    const nextIds = [...pick.rosterIds];
    if (rosterId !== "") nextIds[slot] = rosterId;
    else nextIds.splice(slot, 1);
    const updated = withPickAt(current, n, { ...pick, rosterIds: nextIds.filter((id) => id !== undefined) });
    saveBowlPicks(leagueId, header.season, pickWeek, updated);
    handlePicksSaved(updated);
  }

  /**
   * Renaming one of this week's Bowls of the Week writes straight back to
   * the same week-keyed pick that was set as an "upcoming" pick on last
   * week's page (see saveBowlPicks/getBowlPicks) — so the name is never
   * duplicated per-section, and a league visiting last week's page again
   * would see the same updated name in its own preview box too.
   */
  function renameResult(n: number, name: string) {
    if (!leagueId || !header || !recapData || week === null) return;
    const current = getBowlPicks(leagueId, header.season, week);
    const updatedPick = { ...pickAt(current, n), name };
    const updated = withPickAt(current, n, updatedPick);
    saveBowlPicks(leagueId, header.season, week, updated);
    setResultPicks(updated);

    const matchup = resolveBowlMatchup(updatedPick, recapData.games);
    if (n === 1) setBowlMatchup(matchup);
    if (n === 2) setHonorableMatchup(matchup);

    const line = formatBowlResultLine(matchupTitle(n, false).emoji, updatedPick, teamNames, recapData.games);
    setModel((prev) => {
      if (!prev) return prev;
      if (n === 1) return { ...prev, bowlResult: line };
      if (n === 2) return { ...prev, honorableResult: line };
      const more = prev.more?.[n as MoreMatchup] ?? { result: "", resultDetail: "", lines: "", detail: "" };
      return { ...prev, more: { ...prev.more, [n]: { ...more, result: line } } };
    });
  }

  /**
   * Renaming one of next week's previews writes to the same pick record
   * handlePicksSaved above already knows how to fold back into the model —
   * reused as-is so a rename regenerates the preview lines identically to a
   * picker save.
   */
  function renameUpcoming(n: number, name: string) {
    if (!leagueId || !header || week === null) return;
    const pickWeek = week + 1;
    const current = upcomingPicks ?? getBowlPicks(leagueId, header.season, pickWeek);
    const updated = withPickAt(current, n, { ...pickAt(current, n), name });
    saveBowlPicks(leagueId, header.season, pickWeek, updated);
    handlePicksSaved(updated);
  }

  // Changing the recap's sections — adding, removing or moving one — changes this week's write-up and the
  // league's layout, which every week after starts from.
  const changeLayout = (next: RecapSectionKey[], added?: RecapSectionKey) => {
    if (!model) return;
    const layout = normalizeLayout(next);
    setModel({
      ...model,
      layout,
      // A section added back is in again, even if it was unchecked before it was removed.
      include: added ? { ...model.include, [added]: true } : model.include,
    });
    if (leagueId) saveRecapLayout(leagueId, layout);
  };
  const addSection = (key: RecapSectionKey) => {
    if (!model) return;
    const layout = recapLayout(model);
    // A new section goes last among the write-up's own, before next week's previews.
    const at = isUpcomingSection(key) ? layout.length : layout.findIndex((k) => isUpcomingSection(k));
    const next = [...layout];
    next.splice(at < 0 ? layout.length : at, 0, key);
    changeLayout(next, key);
    // A Matchup of the Week added for next week starts on the best of next week's games still free.
    if (isUpcomingSection(key) && leagueId && header && week !== null) {
      const current = upcomingPicks ?? getBowlPicks(leagueId, header.season, week + 1);
      const suggested = suggestPicks(current, normalizeLayout(next), rankedPairs);
      if (suggested) {
        saveBowlPicks(leagueId, header.season, week + 1, suggested);
        handlePicksSaved(suggested);
      }
    }
  };
  const removeSection = (key: RecapSectionKey) => {
    if (!model) return;
    changeLayout(recapLayout(model).filter((k) => k !== key));
  };
  const moveSection = (key: RecapSectionKey, by: -1 | 1) => {
    if (!model) return;
    const layout = recapLayout(model);
    const i = layout.indexOf(key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= layout.length || isUpcomingSection(layout[j]) !== isUpcomingSection(key)) return;
    const next = [...layout];
    [next[i], next[j]] = [next[j], next[i]];
    changeLayout(next);
  };

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
    moreMatchups: moreResults,
    morePreviews,
    teams: teamsById,
    recapData,
    ledger: money?.ledger ?? null,
    playerNames: highScorerNames,
  });

  // Loaded: the week's own data (or the preseason's header) in.
  const ready = Boolean(leagueId) && !error && week !== null && !!header && (isPreseason || !!recapData);
  /** Everything the editor (see RecapEditor) takes. */
  const editorProps = {
    model,
    onModelChange: setModel,
    plainBody,
    onPlainBodyChange: setPlainBody,
    freshModel,
    matchups: {
      resultPicks,
      upcomingPicks,
      results: { ...moreResults, 1: bowlMatchup, 2: honorableMatchup },
      onRenameResult: renameResult,
      onRenameUpcoming: renameUpcoming,
      onChangeUpcomingTeam: changeUpcomingTeam,
    },
    maxMatchups,
    teams: teamsById,
    teamOptions,
    recapData,
    ledger: money?.ledger ?? null,
    week: week ?? PRESEASON_WEEK,
    playerNames: highScorerNames,
    onRemoveSection: removeSection,
    onAddSection: addSection,
  };
  /** What the contents down the side (see RecapContents) take — null without the sectioned write-up. */
  const contentsProps = model
    ? {
        entries: recapContents(model, resultPicks),
        toAdd: sectionsToAdd(model, maxMatchups),
        upcomingLabel: `Upcoming week ${model.upcomingWeek}`,
        onMove: moveSection,
        onRemove: removeSection,
        onAdd: addSection,
      }
    : null;
  return { isPreseason, header, model, recapData, money, error, ready, actions, googleClientId, editorProps, contentsProps };
}
