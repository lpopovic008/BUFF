"use client";

import { CSSProperties, useMemo, useState } from "react";
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

// The same position colors already designated in src/lib/position-colors.ts
// (its dark-mode values) — hardcoded here as hex since the War Room theme
// is always-dark and needs a literal color for inline styles rather than
// Tailwind's --series-N custom properties, which only exist in the site's
// light-themed CSS scope.
const POSITION_ACCENT: Record<string, string> = {
  QB: "#e66767",
  RB: "#008300",
  WR: "#3987e5",
  TE: "#c98500",
};
const DEFAULT_ACCENT = "#93ac9e";

type FavoriteState = "none" | "highlight" | "border";

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function favoriteStyle(fav: FavoriteState, color: string): CSSProperties {
  if (fav === "highlight") return { backgroundColor: hexToRgba(color, 0.28), borderColor: color };
  if (fav === "border") return { borderColor: color, borderWidth: 2 };
  return {};
}

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
  const [editMode, setEditMode] = useState(false);
  // Which players are tagged as targets — keyed by player identity, not
  // grid position, so a tag survives a mode switch (dynasty vs fantasy,
  // 1QB vs superflex) even though that player's cell moves.
  const [favorites, setFavorites] = useState<Record<string, FavoriteState>>({});

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
  const available = useMemo(
    () => pool.filter((p) => !draftedKeys.has(draftPoolKey(p))),
    [pool, draftedKeys]
  );

  const currentPickIndex = picks.findIndex((p) => p === null);
  const draftComplete = currentPickIndex === -1;
  const onClockTeam = draftComplete ? null : teamForPick(currentPickIndex, settings.teams, settings.type);
  const onClockRound = draftComplete ? null : roundForPick(currentPickIndex, settings.teams);
  const onClockPickInRound = draftComplete ? null : (currentPickIndex % settings.teams) + 1;

  // [round][team] -> overall pick index, precomputed from the tested
  // teamForPick/roundForPick pair rather than re-deriving the snake
  // reversal rule inline in JSX. Drives the Draft Board grid below.
  const boardGrid = useMemo(() => {
    const g: number[][] = Array.from({ length: settings.rounds }, () => Array(settings.teams).fill(-1));
    for (let idx = 0; idx < totalPicks; idx++) {
      const round = roundForPick(idx, settings.teams);
      const team = teamForPick(idx, settings.teams, settings.type);
      g[round - 1][team - 1] = idx;
    }
    return g;
  }, [settings.teams, settings.rounds, settings.type, totalPicks]);

  // [team-row][round-column] -> the Nth remaining player, packed into the
  // same shape a real draft would fill: down a column (a "round"), then
  // over to the next one — reversing direction on a snake draft's back
  // rounds, via the same teamForPick/roundForPick pair as the board above.
  const poolGrid = useMemo(() => {
    const g: (PlayerValue | undefined)[][] = Array.from({ length: settings.teams }, () =>
      Array(settings.rounds).fill(undefined)
    );
    for (let idx = 0; idx < totalPicks && idx < available.length; idx++) {
      const round = roundForPick(idx, settings.teams);
      const team = teamForPick(idx, settings.teams, settings.type);
      g[team - 1][round - 1] = available[idx];
    }
    return g;
  }, [available, settings.teams, settings.rounds, settings.type, totalPicks]);

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

  function cycleFavorite(key: string) {
    setFavorites((prev) => {
      const current = prev[key] ?? "none";
      const next: FavoriteState = current === "none" ? "highlight" : current === "highlight" ? "border" : "none";
      return { ...prev, [key]: next };
    });
  }

  function handlePoolCellClick(player: PlayerValue) {
    const key = draftPoolKey(player);
    if (editMode) cycleFavorite(key);
    else draftPlayer(key);
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

  const boardGridColumns = `40px repeat(${settings.teams}, minmax(96px, 1fr))`;
  const poolGridColumns = `repeat(${settings.rounds}, minmax(70px, 1fr))`;

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
            value — the same values the Values page shows — your picks stay put, and each list/format combination
            lays the grid below out in its own order.
          </p>
        </article>

        <article className="card" style={{ marginBottom: 12 }}>
          <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
          <div className="card-head">
            <div className="card-head-left">
              <span className="card-index">DFT-01</span>
              <span className="card-title">Available Players</span>
            </div>
            <div className="card-flags">
              <button className={`ctrl-btn${editMode ? " active" : ""}`} onClick={() => setEditMode((v) => !v)}>
                {editMode ? "EDITING TARGETS" : "MARK TARGETS"}
              </button>
              <span className="flag cmp">{available.length} LEFT</span>
            </div>
          </div>
          <div className="draft-grid-wrap">
            <div className="draft-grid">
              <div className="draft-grid-row" style={{ gridTemplateColumns: poolGridColumns }}>
                {Array.from({ length: settings.rounds }, (_, i) => (
                  <div className="draft-grid-team-header" key={i}>
                    R{i + 1}
                  </div>
                ))}
              </div>
              {poolGrid.map((row, r) => (
                <div className="draft-grid-row" style={{ gridTemplateColumns: poolGridColumns }} key={r}>
                  {row.map((player, c) => {
                    if (!player) return <div className="draft-pool-cell empty" key={c} />;
                    const key = draftPoolKey(player);
                    const fav = favorites[key] ?? "none";
                    const color = POSITION_ACCENT[player.position] ?? DEFAULT_ACCENT;
                    return (
                      <button
                        key={c}
                        type="button"
                        className="draft-pool-cell"
                        style={favoriteStyle(fav, color)}
                        onClick={() => handlePoolCellClick(player)}
                        disabled={!editMode && draftComplete}
                        title={editMode ? `Tag ${player.name}` : `Draft ${player.name}`}
                      >
                        <span className="draft-pool-cell-rank">{rankByKey.get(key)}</span>
                        <span className="draft-pool-cell-name">{player.name}</span>
                        <span className="draft-pool-cell-pos" style={{ color }}>
                          {player.position}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="card-note">
            {editMode
              ? "Click a player to tag them — once highlights, twice outlines, a third clears it. Colors match position."
              : "Ranked by KTC value, laid out the way a real draft would fill: down a round, then over to the next. Click a player to fill the current pick."}
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

        <article className="card">
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
              <div className="draft-grid-row" style={{ gridTemplateColumns: boardGridColumns }}>
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
              {boardGrid.map((row, r) => (
                <div className="draft-grid-row" style={{ gridTemplateColumns: boardGridColumns }} key={r}>
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
          <p className="card-note">Columns are draft slots — click a player above to fill the current pick.</p>
        </article>
      </div>
    </div>
  );
}
