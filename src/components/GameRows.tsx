"use client";

// A game's player rows in the starters list: while its time block is live, in order of their totals. As someone's
// points change, the numbers and order just update.

import { GroupedStarter } from "@/lib/my-starters";

/** A game's player rows — with `sortByPoints` (a game in a live time block), most points first. */
export function GameRows({
  players,
  sortByPoints,
  render,
}: {
  players: GroupedStarter[];
  sortByPoints: boolean;
  render: (player: GroupedStarter) => React.ReactNode;
}) {
  const ordered = sortByPoints
    ? players
        .map((p, i) => ({ p, i }))
        .sort((a, b) => (b.p.points ?? 0) - (a.p.points ?? 0) || a.i - b.i)
        .map(({ p }) => p)
    : players;
  return (
    <div className="relative flex flex-col">
      {ordered.map((player) => (
        <div key={player.playerId} data-player-id={player.playerId} className="relative">
          {render(player)}
        </div>
      ))}
    </div>
  );
}
