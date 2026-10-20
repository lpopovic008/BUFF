"use client";

import { useState } from "react";
import { nflLogoUrl } from "@/lib/nfl-logos";
import { PlayerValue, shownGrade } from "@/lib/player-values";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { playerHeadshotUrl, playerPhotoUrl } from "@/lib/sleeper";

// KTC's team codes that differ from everyone else's.
const KTC_TEAM: Record<string, string> = { GBP: "GB", JAC: "JAX", KCC: "KC", LVR: "LV", NEP: "NE", NOS: "NO", SFO: "SF", TBB: "TB" };

/** A KTC player's team as the rest of the app writes it — null for a free agent or a draft pick. */
function teamOf(player: PlayerValue): string | null {
  return player.team && player.team !== "FA" ? (KTC_TEAM[player.team] ?? player.team) : null;
}

/** What's in the middle of a card: the player's photo — a defense's logo, a draft pick's year and round — or, with none to be had, their team's logo faintly. */
function CardFace({ player, playerId }: { player: PlayerValue; playerId: string | null }) {
  // The full-size photo, then the thumbnail, then none.
  const [tries, setTries] = useState(0);
  const team = teamOf(player);
  const pick = player.position === "RDP" ? /^(\d{4})\s+(.+)$/.exec(player.name) : null;
  if (pick) {
    return (
      <span className="flex flex-col items-center leading-none text-ink-primary">
        <span className="text-[0.6875rem] font-semibold text-ink-muted">{pick[1]}</span>
        <span className="mt-1 text-center text-lg font-bold">{pick[2]}</span>
      </span>
    );
  }
  if (playerId && player.position !== "DST" && tries < 2) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Sleeper's CDN, on a static export
      <img
        src={tries === 0 ? playerPhotoUrl(playerId) : playerHeadshotUrl(playerId)}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setTries((n) => n + 1)}
        className="aspect-square w-[78%] object-cover object-top"
      />
    );
  }
  return team ? (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG on a static export
    <img src={nflLogoUrl(team)} alt="" loading="lazy" draggable={false} className={`aspect-square w-[60%] object-contain ${player.position === "DST" ? "" : "opacity-25"}`} />
  ) : null;
}

/**
 * A player as a Madden card: their photo in the middle, their team top left, their position bottom
 * left, their grade (see valueGrade) bottom right on the app's plate, whole — its decimals, the tie splitter, on hover — and their name under it all.
 */
export function PlayerCard({ player, grade, rank, playerId }: { player: PlayerValue; grade: number; rank: number; playerId: string | null }) {  const team = teamOf(player);
  return (
    <li className="flex min-w-0 flex-col gap-1" title={`${player.name} · ${player.position}${team ? ` · ${team}` : ""} · ${grade.toFixed(2)}`}>
      <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden border border-border bg-surface-raised">
        {team ? (
          <span className="absolute left-1 top-1 border border-ink-primary px-1 text-[0.625rem] font-bold leading-tight text-ink-primary">{team}</span>
        ) : null}
        <span className="absolute right-1.5 top-1 text-[0.625rem] tabular-nums leading-tight text-ink-muted">{rank}</span>
        <CardFace player={player} playerId={playerId} />
        <span className={`absolute bottom-1 left-1.5 text-[0.75rem] font-bold leading-none ${POSITION_TEXT_COLOR[player.position] ?? "text-ink-secondary"}`}>
          {player.position}
        </span>
        <span className="absolute bottom-0 right-0 bg-[var(--map-tag)] px-1.5 py-0.5 text-lg font-bold leading-none tabular-nums text-[var(--map-tag-ink)]">
          {shownGrade(grade)}
        </span>
      </div>
      <span className="line-clamp-2 break-words text-center text-[0.75rem] font-semibold leading-tight text-ink-primary">{player.name}</span>
    </li>
  );
}
