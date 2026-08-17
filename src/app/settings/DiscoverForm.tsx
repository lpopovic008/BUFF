"use client";

import { useState } from "react";
import { getUserByUsername, getUserLeagues, getLeagueUsers } from "@/lib/sleeper";
import { getConfig, saveConfig, TrackedLeague } from "@/lib/localStore";

export function DiscoverForm({
  defaultUsername,
  defaultSeason,
  onDiscovered,
}: {
  defaultUsername: string;
  defaultSeason: string;
  onDiscovered: () => void;
}) {
  const [username, setUsername] = useState(defaultUsername);
  const [season, setSeason] = useState(defaultSeason);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !season.trim()) {
      setError("Username and season are required.");
      return;
    }
    setIsPending(true);
    setError(null);
    try {
      const user = await getUserByUsername(username.trim());
      if (!user) {
        setError(`No Sleeper user found for "${username}".`);
        return;
      }

      const sleeperLeagues = await getUserLeagues(user.user_id, season.trim());
      const existingById = new Map(getConfig().leagues.map((l) => [l.leagueId, l]));
      const discovered: TrackedLeague[] = [];
      for (const league of sleeperLeagues) {
        const existing = existingById.get(league.league_id);
        if (existing) {
          discovered.push(existing);
          continue;
        }
        const leagueUsers = await getLeagueUsers(league.league_id);
        const me = leagueUsers.find((u) => u.user_id === user.user_id);
        discovered.push({
          leagueId: league.league_id,
          nickname: league.name,
          isCommish: Boolean(me?.is_owner),
        });
      }

      saveConfig({
        sleeperUsername: username.trim(),
        sleeperUserId: user.user_id,
        season: season.trim(),
        leagues: discovered,
      });
      onDiscovered();
    } catch {
      setError("Couldn't reach Sleeper's API. Check your connection and try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-medium text-ink-secondary">Sleeper username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. lpopovic008"
          required
          className="rounded-md border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
        />
      </label>
      <label className="flex w-32 flex-col gap-1">
        <span className="text-sm font-medium text-ink-secondary">Season</span>
        <input
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          placeholder="2026"
          required
          className="rounded-md border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Discovering…" : "Discover leagues"}
      </button>
      {error ? <p className="text-sm text-status-critical sm:basis-full">{error}</p> : null}
    </form>
  );
}
