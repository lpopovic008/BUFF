"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import rawSnapshot from "@/data/player-values.json";
import { PlayerValue, PlayerValuesSnapshot } from "@/lib/player-values";

const snapshot = rawSnapshot as PlayerValuesSnapshot;

type Format = "dynasty" | "fantasy";
const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "PICK"] as const;
type PositionFilter = (typeof POSITIONS)[number];

function formatUpdated(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function ValueTable({ players, maxValue }: { players: PlayerValue[]; maxValue: number }) {
  if (players.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-secondary">No players match.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-grid text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="py-2 pr-3 font-medium">Rank</th>
            <th className="py-2 pr-3 font-medium">Player</th>
            <th className="py-2 pr-3 font-medium">Pos</th>
            <th className="py-2 pr-3 text-right font-medium">Age</th>
            <th className="py-2 pr-3 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={`${p.rank}-${p.name}`} className="border-b border-grid last:border-0">
              <td className="py-2 pr-3 tabular-nums text-ink-secondary">{p.rank}</td>
              <td className="py-2 pr-3 font-medium text-ink-primary">
                {p.name}
                {p.team ? <span className="ml-1.5 text-xs font-normal text-ink-muted">{p.team}</span> : null}
              </td>
              <td className="py-2 pr-3 text-ink-secondary">{p.position}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">{p.age ?? "—"}</td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-page">
                    <div
                      className="h-full rounded-full bg-series-1"
                      style={{ width: `${Math.max(2, (p.value / maxValue) * 100)}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-ink-secondary">{p.value}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ValuesPage() {
  const [format, setFormat] = useState<Format>("dynasty");
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [query, setQuery] = useState("");

  const fullList = format === "dynasty" ? snapshot.dynasty : snapshot.fantasy;
  const maxValue = useMemo(() => Math.max(1, ...fullList.map((p) => p.value)), [fullList]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fullList.filter((p) => {
      if (position !== "ALL" && p.position !== position) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [fullList, position, query]);

  const hasData = snapshot.updatedAt !== null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Player values</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Keep/trade/cut trade values from KeepTradeCut, for dynasty and redraft.
        </p>
      </div>

      {!hasData ? (
        <Card className="p-8 text-center text-sm text-ink-secondary">
          Values haven&rsquo;t been fetched yet. This page fills in automatically once the daily
          player-values workflow runs — no action needed.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Players tracked" value={String(fullList.length)} />
            <StatTile
              label={`Top ${format === "dynasty" ? "dynasty" : "redraft"} asset`}
              value={fullList[0]?.name ?? "—"}
            />
            <StatTile label="Format" value={format === "dynasty" ? "Dynasty" : "Fantasy"} />
            <StatTile label="Updated" value={formatUpdated(snapshot.updatedAt)} />
          </div>

          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-md border border-border p-0.5">
                {(["dynasty", "fantasy"] as Format[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                      format === f
                        ? "bg-series-1 text-white"
                        : "text-ink-secondary hover:bg-page"
                    }`}
                  >
                    {f === "dynasty" ? "Dynasty" : "Fantasy"}
                  </button>
                ))}
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a player…"
                className="w-full max-w-[220px] rounded-md border border-border bg-page px-3 py-1.5 text-sm text-ink-primary outline-none focus:border-series-1"
              />
            </div>

            <div className="mb-4 flex flex-wrap gap-1.5">
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPosition(pos)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    position === pos
                      ? "border-series-1 bg-series-1/10 text-series-1"
                      : "border-border text-ink-secondary hover:bg-page"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>

            <ValueTable players={filtered.slice(0, 300)} maxValue={maxValue} />
            {filtered.length > 300 ? (
              <p className="mt-3 text-xs text-ink-muted">
                Showing the top 300 of {filtered.length} matches — narrow your search to see more.
              </p>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}
