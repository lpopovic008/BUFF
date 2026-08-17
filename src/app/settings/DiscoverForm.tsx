"use client";

import { useActionState } from "react";
import { discoverLeagues } from "./actions";

const initialState: { error?: string } = {};

export function DiscoverForm({ defaultUsername, defaultSeason }: { defaultUsername: string; defaultSeason: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string }, formData: FormData) => discoverLeagues(formData),
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-medium text-ink-secondary">Sleeper username</span>
        <input
          name="username"
          defaultValue={defaultUsername}
          placeholder="e.g. lpopovic008"
          required
          className="rounded-md border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
        />
      </label>
      <label className="flex w-32 flex-col gap-1">
        <span className="text-sm font-medium text-ink-secondary">Season</span>
        <input
          name="season"
          defaultValue={defaultSeason}
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
      {state.error ? <p className="text-sm text-status-critical sm:basis-full">{state.error}</p> : null}
    </form>
  );
}
