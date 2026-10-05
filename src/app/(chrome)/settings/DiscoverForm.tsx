"use client";

import { useState } from "react";
import { discoverAndSaveLeagues, UserNotFoundError } from "@/lib/discover";
import { IconButton } from "@/components/ui/IconButton";
import { SearchIcon } from "@/components/ui/Icon";

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
      await discoverAndSaveLeagues(username.trim(), season.trim());
      onDiscovered();
    } catch (err) {
      setError(
        err instanceof UserNotFoundError
          ? err.message
          : "Couldn't reach Sleeper's API. Check your connection and try again."
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium text-ink-secondary">Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          
          required
          className="w-full min-w-0 border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
        />
      </label>
      <label className="flex w-20 flex-col gap-1 sm:w-32">
        <span className="text-sm font-medium text-ink-secondary">Season</span>
        <input
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          placeholder="2026"
          required
          className="w-full min-w-0 border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
        />
      </label>
      <IconButton
        icon={<SearchIcon />}
        label={isPending ? "Finding leagues…" : "Find leagues"}
        type="submit"
        disabled={isPending}
        variant="primary"
      />
      {error ? <p className="basis-full text-sm text-status-critical">{error}</p> : null}
    </form>
  );
}
