"use client";

import { useState } from "react";
import { LeagueTeamOption } from "@/hooks/useLeagueTeams";
import { BowlGamePick, RecapBowlPicks, saveBowlPicks } from "@/lib/localStore";

function TeamSelect({
  value,
  onChange,
  options,
}: {
  value: number | "";
  onChange: (rosterId: number | "") => void;
  options: LeagueTeamOption[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
      className="w-full rounded-md border border-border bg-page px-2 py-1.5 text-sm text-ink-primary outline-none focus:border-series-1"
    >
      <option value="">— Select a team —</option>
      {options.map((t) => (
        <option key={t.rosterId} value={t.rosterId}>
          {t.teamName}
        </option>
      ))}
    </select>
  );
}

function BowlPickPanel({
  label,
  pick,
  options,
  onChange,
}: {
  label: string;
  pick: BowlGamePick;
  options: LeagueTeamOption[] | null;
  onChange: (pick: BowlGamePick) => void;
}) {
  function setSlot(i: 0 | 1, rosterId: number | "") {
    const next = [...pick.rosterIds];
    if (rosterId !== "") next[i] = rosterId;
    else next.splice(i, 1);
    onChange({ ...pick, rosterIds: next.filter((id) => id !== undefined) });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink-primary">{label}</h3>
      <input
        value={pick.name}
        onChange={(e) => onChange({ ...pick, name: e.target.value })}
        placeholder="Name this matchup…"
        className="w-full rounded-md border border-border bg-page px-3 py-1.5 text-sm text-ink-primary outline-none focus:border-series-1"
      />
      {options ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TeamSelect value={pick.rosterIds[0] ?? ""} options={options} onChange={(id) => setSlot(0, id)} />
          <TeamSelect value={pick.rosterIds[1] ?? ""} options={options} onChange={(id) => setSlot(1, id)} />
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Loading teams…</p>
      )}
    </div>
  );
}

export function BowlPicksEditor({
  leagueId,
  season,
  week,
  initialPicks,
  teamOptions,
  onSaved,
}: {
  leagueId: string;
  season: string;
  week: number;
  initialPicks: RecapBowlPicks;
  teamOptions: LeagueTeamOption[] | null;
  onSaved: (picks: RecapBowlPicks) => void;
}) {
  const [picks, setPicks] = useState(initialPicks);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    saveBowlPicks(leagueId, season, week, picks);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved(picks);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Upcoming Week {week} matchup picks
        </h2>
        <p className="mt-1 text-xs text-ink-secondary">
          Name the marquee matchup(s) and pick the two teams playing — save here and this week&rsquo;s
          write-up previews it, then next week&rsquo;s auto-fills who actually won.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <BowlPickPanel
          label="Bowl of the Week"
          pick={picks.bowlOfWeek}
          options={teamOptions}
          onChange={(bowlOfWeek) => setPicks((prev) => ({ ...prev, bowlOfWeek }))}
        />
        <BowlPickPanel
          label="Honorable Bowl of the Week"
          pick={picks.honorableBowl}
          options={teamOptions}
          onChange={(honorableBowl) => setPicks((prev) => ({ ...prev, honorableBowl }))}
        />
      </div>

      <div>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {saved ? "Saved!" : "Save picks & update write-up"}
        </button>
      </div>
    </div>
  );
}
