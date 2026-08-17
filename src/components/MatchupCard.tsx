import { MatchupGame } from "@/lib/league-data";
import { formatPoints } from "@/lib/format";

function TeamRow({
  name,
  points,
  maxPoints,
  isWinner,
  decided,
}: {
  name: string;
  points: number;
  maxPoints: number;
  isWinner: boolean;
  decided: boolean;
}) {
  const widthPct = maxPoints > 0 ? Math.max(4, (points / maxPoints) * 100) : 4;
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-32 shrink-0 truncate text-sm ${
          decided && isWinner ? "font-semibold text-ink-primary" : "text-ink-secondary"
        }`}
        title={name}
      >
        {name}
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-page">
        <div
          className="h-full rounded-full bg-baseline"
          style={{
            width: `${widthPct}%`,
            background: decided && isWinner ? "var(--color-series-1)" : undefined,
          }}
        />
      </div>
      <div
        className={`w-14 shrink-0 text-right text-sm tabular-nums ${
          decided && isWinner ? "font-semibold text-ink-primary" : "text-ink-secondary"
        }`}
      >
        {formatPoints(points)}
      </div>
    </div>
  );
}

export function MatchupCard({ game }: { game: MatchupGame }) {
  if (game.teams.length === 1) {
    const team = game.teams[0];
    return (
      <div className="rounded-lg border border-border bg-surface-raised p-3">
        <TeamRow name={`${team.teamName} (bye)`} points={team.points} maxPoints={team.points || 1} isWinner={false} decided={false} />
      </div>
    );
  }

  const [a, b] = game.teams;
  const maxPoints = Math.max(a.points, b.points, 1);
  const decided = a.points !== b.points;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3">
      <TeamRow name={a.teamName} points={a.points} maxPoints={maxPoints} isWinner={a.points > b.points} decided={decided} />
      <TeamRow name={b.teamName} points={b.points} maxPoints={maxPoints} isWinner={b.points > a.points} decided={decided} />
    </div>
  );
}
