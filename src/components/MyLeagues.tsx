"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { MatchupRows } from "@/components/LeagueTicker";
import { useConfig } from "@/hooks/useConfig";
import { useDashboardMatchups } from "@/hooks/useDashboardMatchups";
import { useAsItStands, useSummariesAsItStands } from "@/hooks/useAsItStands";
import { getLeagueSummary, lastFinishedWeek, LeagueSummary, teamStandings } from "@/lib/league-data";
import { visibleLeagues } from "@/lib/localStore";
import { avatarUrl, getCurrentWeek } from "@/lib/sleeper";

/**
 * Every league you show, each under its own header plate — lit like a map
 * tag — with your matchup this week under it, the winner lit as on the
 * ticker. The league page opened without a league (the phone's Leagues tab);
 * the header and the matchup both open the league.
 */
export function MyLeagues() {
  const { config, loaded } = useConfig();
  const asItStands = useAsItStands();
  const ids = visibleLeagues(config.leagues)
    .map((l) => l.leagueId)
    .join(",");
  const [week, setWeek] = useState<number | null>(null);
  const [summaries, setSummaries] = useState<LeagueSummary[] | null>(null);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      const currentWeek = await getCurrentWeek();
      const loadedSummaries = await Promise.all((ids ? ids.split(",") : []).map((id) => getLeagueSummary(id, currentWeek)));
      if (cancelled) return;
      setWeek(currentWeek);
      setSummaries(loadedSummaries.filter((s): s is LeagueSummary => s !== null));
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, ids]);

  // Standings counting the week being played, when "as it stands" is on — as on the home page.
  const shown = useSummariesAsItStands(summaries);
  const targets = useMemo(
    () =>
      (summaries ?? []).flatMap((s) => {
        const me = s.standings.find((r) => r.ownerId === config.sleeperUserId);
        return me ? [{ leagueId: s.league.league_id, myRosterId: me.rosterId }] : [];
      }),
    [summaries, config.sleeperUserId]
  );
  const matchups = useDashboardMatchups(targets, week);

  if (!summaries) return <Card className="p-12 text-center text-sm text-ink-secondary">Loading your leagues…</Card>;
  if (summaries.length === 0) return <Card className="p-12 text-center text-sm text-ink-secondary">No leagues.</Card>;

  return (
    <div className="flex flex-col gap-3">
      {summaries.map((official, i) => {
        const summary = shown?.[i] ?? official;
        const leagueId = official.league.league_id;
        const href = `/league?id=${leagueId}`;
        const matchup = matchups[leagueId];
        const standings = teamStandings(summary);
        const logo = avatarUrl(official.league.avatar);
        // The winner once the week's official — or, with "as it stands" on, whoever's ahead now.
        const decided =
          !!matchup?.opponent && matchup.my.points !== matchup.opponent.points && (asItStands || (week != null && week <= lastFinishedWeek(official.league)));
        const myWin = decided && matchup!.my.points > matchup!.opponent!.points;
        return (
          <Card key={leagueId} className="overflow-hidden">
            <Link
              href={href}
              className="flex items-center gap-2 bg-[var(--title-plate)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[var(--map-tag-ink)] transition-opacity hover:opacity-90"
            >
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- Sleeper's avatar CDN on a static export
                <img src={logo} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
              ) : null}
              <span className="min-w-0 truncate">{official.league.name}</span>
            </Link>
            <Link href={href} className="block px-3 py-2 transition-colors hover:bg-page">
              {matchup ? (
                <MatchupRows
                  fitWidth
                  teams={[
                    { name: matchup.my.teamName, points: matchup.my.points, standing: standings.get(matchup.my.rosterId), mine: true, winning: decided && myWin },
                    {
                      name: matchup.opponent?.teamName ?? "Bye",
                      points: matchup.opponent ? matchup.opponent.points : null,
                      standing: matchup.opponent ? standings.get(matchup.opponent.rosterId) : undefined,
                      winning: decided && !myWin,
                    },
                  ]}
                />
              ) : (
                <p className="text-xs text-ink-secondary">{matchup === null ? "No matchup this week." : "Loading…"}</p>
              )}
            </Link>
          </Card>
        );
      })}
    </div>
  );
}
