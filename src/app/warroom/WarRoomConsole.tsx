"use client";

import { useEffect, useMemo, useState } from "react";
import { HeadToHeadRecord, WarRoomData, WarRoomManager } from "@/lib/warroom-data";
import {
  circlePoints,
  clamp,
  formClass,
  gaugeDeg,
  heartbeatTile,
  jitterCityDots,
  ledClass,
  momentumPoints,
  radarAxisPoint,
  radarPoints,
  tileToPoints,
  vitalsColorVar,
} from "@/lib/warroom-math";
import { TEAM_CITIES, US_MAP_VIEWBOX, US_OUTLINE_PATH, US_STATE_LINES_PATH } from "@/lib/warroom-team-cities";
import "./warroom.css";

const RADAR_LABELS = ["QB", "RB", "WR", "TE"] as const;

// Typical recurring NFL kickoff slots, read in the viewer's local time as a
// stand-in for Eastern — Sleeper's API has no per-game schedule to read real
// kickoff times from, so this is deliberately an approximation (same as the
// original design note), not a fetch of this week's actual game times.
const WINDOW_DEFS = [
  { weekday: 4, hour: 20, minute: 15, label: "THURSDAY NIGHT" },
  { weekday: 0, hour: 13, minute: 0, label: "EARLY WINDOW" },
  { weekday: 0, hour: 16, minute: 5, label: "AFTERNOON WINDOW" },
  { weekday: 0, hour: 20, minute: 20, label: "SUNDAY NIGHT" },
  { weekday: 1, hour: 20, minute: 15, label: "MONDAY NIGHT" },
];

function nextOccurrence(from: Date, weekday: number, hour: number, minute: number): number {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 7);
  return d.getTime();
}

function buildWindows(mountedAt: Date): { label: string; at: number }[] {
  const windows: { label: string; at: number }[] = [];
  for (let week = 0; week < 2; week++) {
    for (const w of WINDOW_DEFS) {
      const base = new Date(mountedAt.getTime() + week * 7 * 86400000);
      windows.push({ label: w.label, at: nextOccurrence(base, w.weekday, w.hour, w.minute) });
    }
  }
  return windows.sort((a, b) => a.at - b.at);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function GaugeDial({ label, youVal, cmpVal }: { label: string; youVal: number; cmpVal: number }) {
  return (
    <div className="gauge">
      <svg className="gauge-svg" viewBox="0 0 120 120" aria-hidden="true">
        <circle
          className="gauge-track"
          cx="60"
          cy="60"
          r="46"
          strokeDasharray="216.7 72.3"
          transform="rotate(135 60 60)"
        />
        <line
          className="gauge-needle cmp"
          x1="60"
          y1="60"
          x2="60"
          y2="24"
          transform={`rotate(${gaugeDeg(cmpVal)} 60 60)`}
        />
        <line
          className="gauge-needle you"
          x1="60"
          y1="60"
          x2="60"
          y2="20"
          transform={`rotate(${gaugeDeg(youVal)} 60 60)`}
        />
        <circle className="gauge-hub" cx="60" cy="60" r="4" />
      </svg>
      <div className="gauge-value">
        {youVal}
        <span style={{ color: "var(--ink-dim)", fontSize: "9px" }}>%</span>
      </div>
      <div className="gauge-label">{label}</div>
    </div>
  );
}

function headToHeadReadout(you: WarRoomManager, selected: WarRoomManager): string {
  const rec = you.headToHead.get(selected.rosterId);
  const name = selected.name.toUpperCase();
  if (!rec || (rec.wins === 0 && rec.losses === 0)) return `YOU & ${name}: HAVEN'T PLAYED YET`;
  if (rec.wins > rec.losses) return `YOU LEAD ${name} ${rec.wins}-${rec.losses}`;
  if (rec.losses > rec.wins) return `${name} LEADS YOU ${rec.losses}-${rec.wins}`;
  return `YOU & ${name}: TIED ${rec.wins}-${rec.losses}`;
}

/** "VS YOU: 3-2" from the selected manager's own win-loss record against you. */
function vsYouTag(you: WarRoomManager, selected: WarRoomManager): string {
  const rec = selected.headToHead.get(you.rosterId);
  if (!rec || (rec.wins === 0 && rec.losses === 0)) return "VS YOU: 0-0";
  return `VS YOU: ${rec.wins}-${rec.losses}`;
}

export function WarRoomConsole({ data }: { data: WarRoomData }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [ledShowingYou, setLedShowingYou] = useState(true);
  // Deferred to an effect (rather than a lazy initializer) so the initial
  // static-export prerender and the first client render agree on markup —
  // Date.now() only runs after mount, once we're client-side for good.
  const [now, setNow] = useState<number | null>(null);
  const windows = useMemo(() => buildWindows(new Date()), []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { you, others } = data;
  const selected = others[selectedIdx % Math.max(1, others.length)] ?? you;

  if (others.length === 0) {
    return (
      <div className="warroom-console">
        <div className="wrap">
          <p className="card-note">Need at least one other team in the league to populate the War Room.</p>
        </div>
      </div>
    );
  }

  const allManagers = [you, ...others];
  const scoreboardMax = Math.max(1, ...allManagers.map((m) => m.livePoints));
  const ledList = ledShowingYou ? you.lineup : selected.lineup;
  const heatWeekCount = you.seasonForm.length;

  let wIndex = 0;
  if (now != null) {
    const idx = windows.findIndex((w) => w.at > now);
    wIndex = idx === -1 ? 0 : idx;
  }
  const remain = now != null ? Math.max(0, windows[wIndex].at - now) : 0;
  const clockStr = `${pad(Math.floor(remain / 86400000))}:${pad(Math.floor(remain / 3600000) % 24)}:${pad(
    Math.floor(remain / 60000) % 60
  )}:${pad(Math.floor(remain / 1000) % 60)}`;

  const territoryYouDots = jitterCityDots(
    you.lineup.filter((p) => p.playerId),
    TEAM_CITIES
  );
  const territoryCmpDots = jitterCityDots(
    selected.lineup.filter((p) => p.playerId),
    TEAM_CITIES
  );

  const webNodes = circlePoints(allManagers.length, 75, 75, 56);
  const webMaxWins = Math.max(1, ...allManagers.map((m) => m.wins));
  const webEdges: { a: number; b: number; margin: number; involvesYou: boolean; involvesSel: boolean }[] = [];
  for (let i = 0; i < allManagers.length; i++) {
    for (let j = i + 1; j < allManagers.length; j++) {
      const rec: HeadToHeadRecord | undefined = allManagers[i].headToHead.get(allManagers[j].rosterId);
      if (!rec || rec.wins === rec.losses) continue;
      const [winnerIdx, loserIdx] = rec.wins > rec.losses ? [i, j] : [j, i];
      webEdges.push({
        a: winnerIdx,
        b: loserIdx,
        margin: Math.abs(rec.lastMargin ?? 0),
        involvesYou: winnerIdx === 0 || loserIdx === 0,
        involvesSel: winnerIdx === selectedIdx + 1 || loserIdx === selectedIdx + 1,
      });
    }
  }

  return (
    <div className="warroom-console">
      <div className="wrap">
        <header className="console-head-top">
          <span className="badge">BUFF WAR ROOM</span>
          <span className="status-strip">
            {data.leagueName.toUpperCase()} · WEEK <strong>{data.week}</strong>
          </span>
        </header>

        <div className="clock-banner">
          <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
          <div className="clock-left">
            <span className="clock-eyebrow">IDT-02 · MISSION CLOCK</span>
            <span className="clock-caption">NEXT: {windows[wIndex]?.label ?? "—"}</span>
          </div>
          <div className="clock-value">{now == null ? "--:--:--:--" : clockStr}</div>
          <div className="clock-windows">
            {windows.slice(0, 5).map((w, i) => (
              <span key={i} className={`clock-dot${i === wIndex ? " current" : ""}${i < wIndex ? " passed" : ""}`} />
            ))}
          </div>
        </div>

        <div className="console-body">
          <div className="left-wall">
            <article className="card">
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              <div className="card-head">
                <div className="card-head-left">
                  <span className="card-index">IDT-01</span>
                  <span className="card-title">Manager Dossier</span>
                </div>
                <div className="card-flags"><span className="flag cmp">↔ DRIVES COMPARE</span></div>
              </div>
              <div className="dossier-panes">
                <div className="dossier-pane you">
                  <div className="dossier-photo">{you.initial}</div>
                  <div className="dossier-info">
                    <span className="name">{you.name}</span>
                    <span>{you.wins}-{you.losses}{you.ties ? `-${you.ties}` : ""}</span>
                    <span className="dossier-tag you">YOU · ALWAYS SHOWN</span>
                  </div>
                </div>
                <div className="dossier-pane cmp">
                  <div className="dossier-photo">{selected.initial}</div>
                  <div className="dossier-info">
                    <span className="name">{selected.name}</span>
                    <span>{selected.wins}-{selected.losses}{selected.ties ? `-${selected.ties}` : ""}</span>
                    <span className="dossier-tag cmp">{vsYouTag(you, selected)}</span>
                  </div>
                </div>
              </div>
              <div className="dossier-controls">
                <span className="flip-label">FLIP THROUGH MANAGERS</span>
                <div className="ctrl-row">
                  <button
                    className="ctrl-btn"
                    onClick={() => setSelectedIdx((i) => (i - 1 + others.length) % others.length)}
                  >
                    ‹ PREV
                  </button>
                  <button
                    className="ctrl-btn"
                    onClick={() => setSelectedIdx((i) => (i + 1) % others.length)}
                  >
                    NEXT ›
                  </button>
                </div>
              </div>
              <p className="card-note">
                Your stats stay on screen always. Whoever you flip to becomes the cyan overlay everywhere below marked
                ↔ COMPARES.
              </p>
            </article>

            <article className="card">
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              <div className="card-head">
                <div className="card-head-left">
                  <span className="card-index">SIG-01</span>
                  <span className="card-title">Live Performance</span>
                </div>
                <div className="card-flags"><span className="flag live">LIVE</span><span className="flag cmp">↔ COMPARES</span></div>
              </div>
              <div className="gauges">
                <GaugeDial label="VS PACE" youVal={you.vsPaceGauge} cmpVal={selected.vsPaceGauge} />
                <GaugeDial label="WIN CHANCE" youVal={you.winChance} cmpVal={selected.winChance} />
                <GaugeDial label="TOP SCORER" youVal={you.topScorerChance} cmpVal={selected.topScorerChance} />
              </div>
              <p className="card-note">
                Live points against your own season-average pace, an estimated live win chance from the current
                matchup margin, and estimated odds of leading the whole league in scoring this week.
              </p>
            </article>

            <article className="card">
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              <div className="card-head">
                <div className="card-head-left">
                  <span className="card-index">IDT-03</span>
                  <span className="card-title">Lineup Status</span>
                </div>
                <div className="card-flags"><span className="flag live">LIVE</span><span className="flag cmp">↔ TOGGLES</span></div>
              </div>
              <div className="led-toggle">
                <button className={`ctrl-btn${ledShowingYou ? " active" : ""}`} onClick={() => setLedShowingYou(true)}>
                  MINE
                </button>
                <button className={`ctrl-btn${!ledShowingYou ? " active" : ""}`} onClick={() => setLedShowingYou(false)}>
                  THEIRS
                </button>
              </div>
              <div className="led-rows">
                {ledList.map((row, i) => (
                  <div className="led-row" key={i}>
                    <span className={`led-dot ${ledClass(row.seasonAvg, row.actual)}`} />
                    <span className="led-slot">{row.slot}</span>
                    <span className="led-name">{row.name}</span>
                    <span className="led-nums">{row.seasonAvg.toFixed(1)}</span>
                    <span className="led-nums"><strong>{row.actual.toFixed(1)}</strong></span>
                  </div>
                ))}
              </div>
              <p className="card-note">Green = beating their own season pace, amber = on pace, red = falling short.</p>
            </article>
          </div>

          <div className="main-area">
            <article className="card span-9">
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              <div className="card-head">
                <div className="card-head-left">
                  <span className="card-index">VIT-04</span>
                  <span className="card-title">Live Momentum</span>
                </div>
                <div className="card-flags"><span className="flag live">LIVE</span><span className="flag cmp">↔ COMPARES</span></div>
              </div>
              <svg className="momentum-svg" viewBox="0 0 620 140" preserveAspectRatio="none" aria-hidden="true">
                <line className="momentum-zero" x1="0" y1="70" x2="620" y2="70" />
                <polyline className="momentum-cmp" points={momentumPoints(selected.momentum, 620, 140, 3.0)} />
                <polyline
                  className={`momentum-you${you.momentum.at(-1)! < 0 ? " losing" : ""}`}
                  points={momentumPoints(you.momentum, 620, 140, 3.0)}
                />
                <circle
                  className={`momentum-dot${you.momentum.at(-1)! < 0 ? " losing" : ""}`}
                  r="4.5"
                  cx="620"
                  cy={70 - you.momentum.at(-1)! * 3.0}
                />
              </svg>
              <div className="momentum-legend">
                <span className="you">YOU — point differential vs your opponent</span>
                <span className="cmp">{selected.name.toUpperCase()} — point differential vs their opponent</span>
              </div>
              <p className="card-note">
                A straight line from kickoff (0) to the current margin — Sleeper has no historical intra-week
                snapshots to trace the real path. Above the line = winning, below = losing.
              </p>
            </article>

            <article className="card span-5">
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              <div className="card-head">
                <div className="card-head-left">
                  <span className="card-index">VIT-02</span>
                  <span className="card-title">Live Scoreboard</span>
                </div>
                <div className="card-flags"><span className="flag live">LIVE</span><span className="flag cmp">↔ HIGHLIGHTS</span></div>
              </div>
              <div className="scoreboard">
                {allManagers.map((m, i) => {
                  const isYou = i === 0;
                  const isSel = !isYou && i - 1 === selectedIdx;
                  return (
                    <div className={`score-col${isYou ? " you" : ""}${isSel ? " selected" : ""}`} key={m.rosterId}>
                      <div className="score-bar" style={{ height: `${(m.livePoints / scoreboardMax) * 100}%` }} />
                      <div className="score-val">{m.livePoints.toFixed(1)}</div>
                      <div className="score-name">{isYou ? "YOU" : m.name}</div>
                    </div>
                  );
                })}
              </div>
              <p className="card-note">Every team&rsquo;s current point total. Cyan outline marks whoever&rsquo;s selected in the Dossier.</p>
            </article>

            <article className="card span-4">
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              <div className="card-head">
                <div className="card-head-left">
                  <span className="card-index">VIT-03</span>
                  <span className="card-title">Transaction Feed</span>
                </div>
                <div className="card-flags"><span className="flag live">LIVE</span></div>
              </div>
              <div className="terminal">
                {data.transactionSummaries.length === 0 ? (
                  <div>No moves logged yet this week<span className="cursor" /></div>
                ) : (
                  data.transactionSummaries.slice(0, 6).map((line, i) => <div key={i}>{line}</div>)
                )}
              </div>
              <p className="card-note">Real waiver, free-agent, and trade activity from this week — Sleeper has no play-by-play feed to read live scoring plays from.</p>
            </article>

            <article className="card span-4">
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              <div className="card-head">
                <div className="card-head-left">
                  <span className="card-index">SIG-04</span>
                  <span className="card-title">Threat Sweep</span>
                </div>
                <div className="card-flags"><span className="flag live">LIVE</span></div>
              </div>
              <svg className="sonar-svg" viewBox="0 0 140 140" aria-hidden="true">
                <circle className="sonar-ring" cx="70" cy="70" r="20" />
                <circle className="sonar-ring" cx="70" cy="70" r="38" />
                <circle className="sonar-ring" cx="70" cy="70" r="55" />
                <line className="sonar-ring" x1="15" y1="70" x2="125" y2="70" />
                <line className="sonar-ring" x1="70" y1="15" x2="70" y2="125" />
                <g className="sonar-sweep-group">
                  <path d="M70,70 L70,15 A55,55 0 0,1 105.4,27.9 Z" fill="url(#sweepFade)" />
                </g>
                <defs>
                  <linearGradient id="sweepFade" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#4dd2c9" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#4dd2c9" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {data.sonarBlips.map((b, i) => {
                  const angle = (-70 + i * 55) * (Math.PI / 180);
                  const r = clamp(18 + b.margin * 2.2, 15, 58);
                  const x = 70 + r * Math.cos(angle);
                  const y = 70 + r * Math.sin(angle);
                  return (
                    <g key={i}>
                      <circle className="sonar-blip" cx={x} cy={y} r={clamp(3.5 - b.margin * 0.08, 1.5, 3.5)}>
                        <title>{`${b.label} — margin ${b.margin.toFixed(1)}`}</title>
                      </circle>
                      <text className="sonar-blip-label" x={x + 4} y={y - 2}>{b.margin.toFixed(1)}</text>
                    </g>
                  );
                })}
              </svg>
              <p className="card-note">League-wide radar for this week&rsquo;s closest live games — blips are current margins, in points.</p>
            </article>

            <article className="card span-5">
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              <div className="card-head">
                <div className="card-head-left">
                  <span className="card-index">SIG-02</span>
                  <span className="card-title">Positional Value</span>
                </div>
                <div className="card-flags"><span className="flag cmp">↔ COMPARES</span></div>
              </div>
              <svg className="radar-svg" viewBox="0 0 140 140" aria-hidden="true">
                <polygon className="radar-ring" points={radarPoints([100, 100, 100, 100], 55, 70, 70)} />
                <polygon className="radar-ring" points={radarPoints([50, 50, 50, 50], 55, 70, 70)} />
                {RADAR_LABELS.map((_, i) => {
                  const [x, y] = radarAxisPoint(55, 70, 70, i);
                  return <line key={i} className="radar-axis" x1="70" y1="70" x2={x} y2={y} />;
                })}
                <polygon
                  className="radar-fill cmp"
                  points={radarPoints(RADAR_LABELS.map((p) => selected.radar[p]), 55, 70, 70)}
                />
                <polygon
                  className="radar-fill you"
                  points={radarPoints(RADAR_LABELS.map((p) => you.radar[p]), 55, 70, 70)}
                />
                {RADAR_LABELS.map((label, i) => {
                  const [x, y] = radarAxisPoint(65, 70, 70, i);
                  return (
                    <text key={label} className="radar-label" x={x} y={y}>
                      {label}
                    </text>
                  );
                })}
              </svg>
              <p className="card-note">
                League percentile by position, from KTC values. Solid amber is your roster; dashed cyan overlays
                whoever&rsquo;s selected.
              </p>
            </article>

            <article className="card span-9">
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              <div className="card-head">
                <div className="card-head-left">
                  <span className="card-index">TER-01</span>
                  <span className="card-title">Territory Map</span>
                </div>
                <div className="card-flags"><span className="flag cmp">↔ COMPARES</span></div>
              </div>
              <svg className="usmap-svg" viewBox={US_MAP_VIEWBOX} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <path className="usmap-outline" d={US_OUTLINE_PATH} />
                <path className="usmap-state-line" d={US_STATE_LINES_PATH} />
                <g>
                  {territoryCmpDots.map((p, i) => (
                    <circle key={i} className="usmap-dot cmp" cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={3}>
                      <title>{`${p.name} — ${p.city}`}</title>
                    </circle>
                  ))}
                </g>
                <g>
                  {territoryYouDots.map((p, i) => (
                    <circle key={i} className="usmap-dot you" cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={3.5}>
                      <title>{`${p.name} — ${p.city}`}</title>
                    </circle>
                  ))}
                </g>
              </svg>
              <div className="usmap-legend">
                <span className="you">Your players&rsquo; game cities this week</span>
                <span className="cmp">{selected.name}&rsquo;s players&rsquo; game cities</span>
              </div>
              <p className="card-note">Hover a dot for the player and city. Outline and state borders traced from real U.S. Census Bureau boundary data.</p>
            </article>

            <article className="card span-4">
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              <div className="card-head">
                <div className="card-head-left">
                  <span className="card-index">SIG-03</span>
                  <span className="card-title">Head-to-Head Web</span>
                </div>
                <div className="card-flags"><span className="flag cmp">↔ HIGHLIGHTS</span></div>
              </div>
              <svg className="web-svg" viewBox="0 0 150 150" aria-hidden="true">
                <defs>
                  <marker id="arrowNeutral" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--node-neutral)" />
                  </marker>
                  <marker id="arrowActive" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--cyan)" />
                  </marker>
                </defs>
                <g>
                  {webEdges.map((e, i) => {
                    const active = e.involvesYou && e.involvesSel;
                    return (
                      <line
                        key={i}
                        x1={webNodes[e.a].x}
                        y1={webNodes[e.a].y}
                        x2={webNodes[e.b].x}
                        y2={webNodes[e.b].y}
                        strokeWidth={0.9 + Math.min(e.margin / 26, 1) * 1.8}
                        className={`web-edge${active ? " active" : ""}`}
                        markerEnd={active ? "url(#arrowActive)" : "url(#arrowNeutral)"}
                        opacity={e.involvesYou || e.involvesSel ? 1 : 0.35}
                      >
                        <title>{`${allManagers[e.a].name} beat ${allManagers[e.b].name} by ${e.margin.toFixed(1)}`}</title>
                      </line>
                    );
                  })}
                </g>
                <g>
                  {webNodes.map((p, i) => {
                    let cls = "web-node";
                    if (i === 0) cls += " you";
                    else if (i === selectedIdx + 1) cls += " active";
                    return (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={4 + (allManagers[i].wins / webMaxWins) * 7}
                        className={cls}
                      >
                        <title>{`${allManagers[i].name} — ${allManagers[i].wins} win${allManagers[i].wins !== 1 ? "s" : ""} this season`}</title>
                      </circle>
                    );
                  })}
                </g>
              </svg>
              <div className="rivalry-readout">{headToHeadReadout(you, selected)}</div>
              <p className="card-note">
                Every result played this season, arrow pointing loser-ward. Bigger dot = more wins. Your head-to-head
                with whoever&rsquo;s selected highlights in cyan.
              </p>
            </article>

            <article className="card span-5">
              <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
              <div className="card-head">
                <div className="card-head-left">
                  <span className="card-index">TER-02</span>
                  <span className="card-title">Season Form</span>
                </div>
                <div className="card-flags"><span className="flag cmp">↔ HIGHLIGHTS</span></div>
              </div>
              <div className="heat-wrap">
                <div className="heat-weeks" style={{ gridTemplateColumns: `58px repeat(${heatWeekCount}, 1fr)` }}>
                  <span />
                  {Array.from({ length: heatWeekCount }, (_, i) => (
                    <span key={i}>W{i + 1}</span>
                  ))}
                </div>
                <div>
                  {allManagers.map((m, i) => {
                    const isYou = i === 0;
                    const isSel = !isYou && i - 1 === selectedIdx;
                    return (
                      <div
                        key={m.rosterId}
                        className={`heat-row${isYou ? " you" : ""}${isSel ? " selected" : ""}`}
                        style={{ gridTemplateColumns: `58px repeat(${heatWeekCount}, 1fr)` }}
                      >
                        <span className="heat-name">{isYou ? "YOU" : m.name}</span>
                        {m.seasonForm.map((pct, w) => (
                          <div key={w} className={`heat-cell ${formClass(pct)}`} title={`${pct}%`} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="card-note">Cumulative win% through each completed week — a slow trend line, not a noisy one, since one result only nudges the average.</p>
            </article>
          </div>
        </div>

        <article className="card vitals-bay" style={{ marginTop: "12px" }}>
          <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
          <div className="card-head">
            <div className="card-head-left">
              <span className="card-index">VIT-01</span>
              <span className="card-title">League Vitals</span>
            </div>
            <div className="card-flags"><span className="flag live">LIVE</span></div>
          </div>
          <div className="vitals-strip-row">
            {allManagers.map((m, i) => {
              const isYou = i === 0;
              const isSel = !isYou && i - 1 === selectedIdx;
              const color = vitalsColorVar(m.winChance);
              const tile = heartbeatTile(m.winChance, 100);
              return (
                <div className={`vitals-strip${isYou ? " you" : ""}${isSel ? " selected" : ""}`} key={m.rosterId}>
                  <span className="vitals-name">{isYou ? "YOU" : m.name}</span>
                  <svg className="vitals-svg-el" viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden="true">
                    <g className="vitals-scroll">
                      <polyline
                        points={tileToPoints(tile, 0)}
                        fill="none"
                        stroke={color}
                        strokeWidth="1.75"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      <polyline
                        points={tileToPoints(tile, 100)}
                        fill="none"
                        stroke={color}
                        strokeWidth="1.75"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </g>
                  </svg>
                  <span className="vitals-pct" style={{ color }}>{m.winChance}%</span>
                </div>
              );
            })}
          </div>
          <p className="card-note">Every team&rsquo;s estimated live win chance, from the current matchup margin — more frequent, taller bumps mean a higher estimate.</p>
        </article>
      </div>
    </div>
  );
}
