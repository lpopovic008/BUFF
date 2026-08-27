"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MenuIcon } from "@/components/ui/Icon";
import rawSnapshot from "@/data/player-values.json";
import { PlayerValue, PlayerValuesSnapshot } from "@/lib/player-values";
import {
  DEFAULT_DRAFT_SETTINGS,
  DraftSettings,
  MAX_ROUNDS,
  MAX_TEAMS,
  MIN_ROUNDS,
  MIN_TEAMS,
  draftPool,
  draftPoolKey,
  roundForPick,
  teamForPick,
} from "@/lib/draft-sim";
import "./warroom.css";

const snapshot = rawSnapshot as unknown as PlayerValuesSnapshot;

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"] as const;
type PositionFilter = (typeof POSITIONS)[number];

function defaultTeamNames(teams: number): string[] {
  return Array.from({ length: teams }, (_, i) => `Team ${i + 1}`);
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function DraftRoom() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settings, setSettings] = useState<DraftSettings>(DEFAULT_DRAFT_SETTINGS);
  const [posFilter, setPosFilter] = useState<PositionFilter>("ALL");
  const [search, setSearch] = useState("");

  const totalPicks = settings.teams * settings.rounds;
  // Teams/rounds/order reshape the whole board (pick count, snake pattern),
  // so those reset picks and team names; dynasty/fantasy and 1QB/superflex
  // just re-rank the same pool, so they leave an in-progress board alone.
  const boardKey = `${settings.teams}:${settings.rounds}:${settings.type}`;
  const [picks, setPicks] = useState<(string | null)[]>(() => Array(totalPicks).fill(null));
  const [teamNames, setTeamNames] = useState<string[]>(() => defaultTeamNames(settings.teams));
  const [syncedBoardKey, setSyncedBoardKey] = useState(boardKey);
  if (boardKey !== syncedBoardKey) {
    setSyncedBoardKey(boardKey);
    setPicks(Array(totalPicks).fill(null));
    setTeamNames(defaultTeamNames(settings.teams));
  }

  const pool = useMemo(
    () => draftPool(snapshot, settings.listType, settings.format),
    [settings.listType, settings.format]
  );
  const rankByKey = useMemo(() => new Map(pool.map((p, i) => [draftPoolKey(p), i + 1])), [pool]);
  const byKey = useMemo(() => new Map(pool.map((p) => [draftPoolKey(p), p])), [pool]);
  const draftedKeys = useMemo(() => new Set(picks.filter((p): p is string => p !== null)), [picks]);

  const currentPickIndex = picks.findIndex((p) => p === null);
  const draftComplete = currentPickIndex === -1;
  const onClockTeam = draftComplete ? null : teamForPick(currentPickIndex, settings.teams, settings.type);
  const onClockRound = draftComplete ? null : roundForPick(currentPickIndex, settings.teams);
  const onClockPickInRound = draftComplete ? null : (currentPickIndex % settings.teams) + 1;

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((p) => {
      if (draftedKeys.has(draftPoolKey(p))) return false;
      if (posFilter !== "ALL" && p.position !== posFilter) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pool, draftedKeys, posFilter, search]);

  // [round][team] -> overall pick index, precomputed from the tested
  // teamForPick/roundForPick pair rather than re-deriving the snake
  // reversal rule inline in JSX.
  const grid = useMemo(() => {
    const g: number[][] = Array.from({ length: settings.rounds }, () => Array(settings.teams).fill(-1));
    for (let idx = 0; idx < totalPicks; idx++) {
      const round = roundForPick(idx, settings.teams);
      const team = teamForPick(idx, settings.teams, settings.type);
      g[round - 1][team - 1] = idx;
    }
    return g;
  }, [settings.teams, settings.rounds, settings.type, totalPicks]);

  function updateSettings(patch: Partial<DraftSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  function draftPlayer(key: string) {
    if (draftComplete) return;
    setPicks((prev) => {
      const next = [...prev];
      next[currentPickIndex] = key;
      return next;
    });
  }

  function undoLastPick() {
    setPicks((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i] !== null) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  }

  function resetDraft() {
    setPicks(Array(totalPicks).fill(null));
  }

  function renameTeam(idx: number, name: string) {
    setTeamNames((prev) => {
      const next = [...prev];
      next[idx] = name;
      return next;
    });
  }

  const gridColumns = `40px repeat(${settings.teams}, minmax(96px, 1fr))`;

  return (
    <div className="warroom-console">
      <div className="wrap">
        <header className="console-head-top">
          <div className="console-head-left">
            <span className="badge">BUFF DRAFT ROOM</span>
          </div>
          <div className="console-head-center">
            <span className="week-badge">
              {draftComplete ? "DRAFT COMPLETE" : `RD ${onClockRound} · PICK ${currentPickIndex + 1}/${totalPicks}`}
            </span>
          </div>
          <div className="console-menu">
            <button
              className="console-menu-btn"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MenuIcon />
            </button>
            {menuOpen ? (
              <nav className="console-menu-dropdown">
                <Link href="/" onClick={() => setMenuOpen(false)}>
                  War Room
                </Link>
                <Link href="/values" onClick={() => setMenuOpen(false)}>
                  Values
                </Link>
                <Link href="/settings" onClick={() => setMenuOpen(false)}>
                  Settings
                </Link>
              </nav>
            ) : null}
          </div>
        </header>

        <article className="card" style={{ marginBottom: 12 }}>
          <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
          <div className="card-head">
            <div className="card-head-left">
              <span className="card-index">DFT-00</span>
              <span className="card-title">Draft Settings</span>
            </div>
          </div>
          <div className="draft-settings-row">
            <div className="draft-field">
              <span className="draft-field-label">TEAMS</span>
              <input
                type="number"
                className="draft-input"
                min={MIN_TEAMS}
                max={MAX_TEAMS}
                value={settings.teams}
                onChange={(e) => updateSettings({ teams: clampInt(e.target.value, MIN_TEAMS, MAX_TEAMS, settings.teams) })}
              />
            </div>
            <div className="draft-field">
              <span className="draft-field-label">ROUNDS</span>
              <input
                type="number"
                className="draft-input"
                min={MIN_ROUNDS}
                max={MAX_ROUNDS}
                value={settings.rounds}
                onChange={(e) => updateSettings({ rounds: clampInt(e.target.value, MIN_ROUNDS, MAX_ROUNDS, settings.rounds) })}
              />
            </div>
            <div className="draft-field">
              <span className="draft-field-label">ORDER</span>
              <div className="draft-toggle-group">
                <button className={`ctrl-btn${settings.type === "snake" ? " active" : ""}`} onClick={() => updateSettings({ type: "snake" })}>
                  SNAKE
                </button>
                <button className={`ctrl-btn${settings.type === "linear" ? " active" : ""}`} onClick={() => updateSettings({ type: "linear" })}>
                  LINEAR
                </button>
              </div>
            </div>
            <div className="draft-field">
              <span className="draft-field-label">LIST</span>
              <div className="draft-toggle-group">
                <button className={`ctrl-btn${settings.listType === "dynasty" ? " active" : ""}`} onClick={() => updateSettings({ listType: "dynasty" })}>
                  DYNASTY
                </button>
                <button className={`ctrl-btn${settings.listType === "fantasy" ? " active" : ""}`} onClick={() => updateSettings({ listType: "fantasy" })}>
                  FANTASY
                </button>
              </div>
            </div>
            <div className="draft-field">
              <span className="draft-field-label">FORMAT</span>
              <div className="draft-toggle-group">
                <button className={`ctrl-btn${settings.format === "oneQB" ? " active" : ""}`} onClick={() => updateSettings({ format: "oneQB" })}>
                  1QB
                </button>
                <button className={`ctrl-btn${settings.format === "superflex" ? " active" : ""}`} onClick={() => updateSettings({ format: "superflex" })}>
                  SUPERFLEX
                </button>
              </div>
            </div>
            <div className="draft-field">
              <span className="draft-field-label">&nbsp;</span>
              <div className="draft-toggle-group">
                <button className="ctrl-btn" onClick={undoLastPick} disabled={currentPickIndex === 0}>
                  UNDO PICK
                </button>
                <button className="ctrl-btn" onClick={resetDraft} disabled={picks.every((p) => p === null)}>
                  RESET DRAFT
                </button>
              </div>
            </div>
          </div>
          <p className="card-note">
            Teams, rounds, and order reset the board. Dynasty/Fantasy and 1QB/Superflex just re-rank the pool by KTC
            value — the same values the Values page shows — your picks stay put.
          </p>
        </article>

        <div className="draft-clock">
          <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
          <div className="clock-left">
            <span className="clock-eyebrow">ON THE CLOCK</span>
            <span className="clock-caption">
              {draftComplete
                ? "Every slot is filled."
                : `${teamNames[onClockTeam! - 1]} — Round ${onClockRound}, Pick ${onClockPickInRound}`}
            </span>
          </div>
          <span className={`draft-clock-value${draftComplete ? " draft-clock-done" : ""}`}>
            {draftComplete ? "COMPLETE" : `${currentPickIndex + 1} / ${totalPicks}`}
          </span>
        </div>

        <div className="draft-layout">
          <article className="card draft-pool-card">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">DFT-01</span>
                <span className="card-title">Available Players</span>
              </div>
              <div className="card-flags">
                <span className="flag cmp">{available.length} LEFT</span>
              </div>
            </div>
            <div className="draft-pos-tabs">
              {POSITIONS.map((pos) => (
                <button key={pos} className={`ctrl-btn${posFilter === pos ? " active" : ""}`} onClick={() => setPosFilter(pos)}>
                  {pos}
                </button>
              ))}
            </div>
            <input
              className="draft-search"
              placeholder="Search players…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="draft-pool">
              {available.length === 0 ? (
                <div className="draft-pool-empty">No players match.</div>
              ) : (
                available.map((p: PlayerValue) => {
                  const key = draftPoolKey(p);
                  return (
                    <div className="draft-pool-row" key={key}>
                      <span className="draft-pool-rank">{rankByKey.get(key)}</span>
                      <span className="draft-pool-name">
                        {p.name}
                        <span className="draft-pool-meta">
                          {p.position}
                          {p.team ? ` · ${p.team}` : ""}
                        </span>
                      </span>
                      <button className="draft-pool-btn" onClick={() => draftPlayer(key)} disabled={draftComplete}>
                        DRAFT
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <p className="card-note">Ranked by KTC value for the selected list/format.</p>
          </article>

          <article className="card draft-board-card">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">DFT-02</span>
                <span className="card-title">Draft Board</span>
              </div>
              <div className="card-flags">
                <span className="flag live">{settings.type === "snake" ? "SNAKE" : "LINEAR"}</span>
              </div>
            </div>
            <div className="draft-grid-wrap">
              <div className="draft-grid">
                <div className="draft-grid-row" style={{ gridTemplateColumns: gridColumns }}>
                  <span />
                  {teamNames.map((name, i) => (
                    <div className="draft-grid-team-header" key={i}>
                      <input
                        className="draft-grid-team-name"
                        value={name}
                        onChange={(e) => renameTeam(i, e.target.value)}
                        aria-label={`Team ${i + 1} name`}
                      />
                    </div>
                  ))}
                </div>
                {grid.map((row, r) => (
                  <div className="draft-grid-row" style={{ gridTemplateColumns: gridColumns }} key={r}>
                    <span className="draft-grid-round-label">{r + 1}</span>
                    {row.map((pickIdx, t) => {
                      const key = picks[pickIdx];
                      const player = key ? byKey.get(key) : null;
                      const isOnClock = pickIdx === currentPickIndex;
                      return (
                        <div className={`draft-grid-cell${player ? " filled" : ""}${isOnClock ? " onclock" : ""}`} key={t}>
                          <span className="draft-grid-pick-no">
                            {r + 1}.{String(t + 1).padStart(2, "0")}
                          </span>
                          {player ? (
                            <span className="draft-grid-player">
                              {player.name} · {player.position}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <p className="card-note">Columns are draft slots — click a player on the left to fill the current pick.</p>
          </article>
        </div>
      </div>
    </div>
  );
}
