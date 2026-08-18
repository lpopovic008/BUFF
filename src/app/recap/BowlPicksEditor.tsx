"use client";

import { useState } from "react";
import { RosterPlayerOption } from "@/hooks/useLeagueRosterPlayers";
import { BowlGamePick, RecapBowlPicks, saveBowlPicks } from "@/lib/localStore";

const PLAYER_SLOTS = [0, 1];

function PlayerSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (playerId: string) => void;
  options: RosterPlayerOption[];
}) {
  const byTeam = new Map<string, RosterPlayerOption[]>();
  for (const opt of options) {
    const list = byTeam.get(opt.teamName) ?? [];
    list.push(opt);
    byTeam.set(opt.teamName, list);
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-page px-2 py-1.5 text-sm text-ink-primary outline-none focus:border-series-1"
    >
      <option value="">— Select a player —</option>
      {Array.from(byTeam.entries()).map(([teamName, players]) => (
        <optgroup key={teamName} label={teamName}>
          {players.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name} ({p.position})
            </option>
          ))}
        </optgroup>
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
  options: RosterPlayerOption[] | null;
  onChange: (pick: BowlGamePick) => void;
}) {
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
          {PLAYER_SLOTS.map((i) => (
            <PlayerSelect
              key={i}
              value={pick.playerIds[i] ?? ""}
              options={options}
              onChange={(playerId) => {
                const next = [...pick.playerIds];
                if (playerId) next[i] = playerId;
                else next.splice(i, 1);
                onChange({ ...pick, playerIds: next.filter(Boolean) });
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Loading roster…</p>
      )}
    </div>
  );
}

export function BowlPicksEditor({
  leagueId,
  season,
  week,
  initialPicks,
  playerOptions,
  onSaved,
}: {
  leagueId: string;
  season: string;
  week: number;
  initialPicks: RecapBowlPicks;
  playerOptions: RosterPlayerOption[] | null;
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
          Name the marquee matchup(s) and pick one player from each side, just so the app knows which two
          teams are playing — save here and this week&rsquo;s write-up previews it, then next week&rsquo;s
          auto-fills who actually won.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <BowlPickPanel
          label="Bowl of the Week"
          pick={picks.bowlOfWeek}
          options={playerOptions}
          onChange={(bowlOfWeek) => setPicks((prev) => ({ ...prev, bowlOfWeek }))}
        />
        <BowlPickPanel
          label="Honorable Bowl of the Week"
          pick={picks.honorableBowl}
          options={playerOptions}
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
