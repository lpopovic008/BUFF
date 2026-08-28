"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MenuIcon } from "@/components/ui/Icon";
import rawSnapshot from "@/data/player-adp.json";
import { getDraftTargets, saveDraftTargets } from "@/lib/localStore";
import { AdpEntry, AdpSnapshot } from "@/lib/player-adp";
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

const snapshot = rawSnapshot as unknown as AdpSnapshot;

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

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function targetStyle(isTarget: boolean, color: string): CSSProperties {
  return isTarget ? { backgroundColor: hexToRgba(color, 0.28), borderColor: color } : {};
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
  // 1QB vs superflex) even though that player's cell moves. Persisted to
  // localStorage (buff:draft-targets) so tags survive a page refresh — see
  // src/lib/localStore.ts. Starts `null` ("not loaded yet") rather than
  // reading storage in the useState initializer: that initializer also
  // runs during static export's server render, where there's no window, so
  // it'd render an empty state there and then a different, real one on the
  // client — a hydration mismatch. Loading it in an effect instead (which
  // only ever runs client-side, after mount) avoids that, same pattern as
  // useConfig's own localStorage load.
  const [targets, setTargets] = useState<Set<string> | null>(null);
  useEffect(() => {
    // Wrapped like useConfig's own load effect — a bare setState call as a
    // direct effect-body statement trips the set-state-in-effect lint rule.
    (() => setTargets(new Set(getDraftTargets())))();
  }, []);
  useEffect(() => {
    if (targets === null) return; // still loading — don't clobber storage with nothing
    saveDraftTargets([...targets]);
  }, [targets]);
  // The team currently selected in the Draft Board, so its row can be
  // outlined in the Available Players grid — a scratch UI aid, not saved.
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);

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

  // [team-row][round-column] -> the Nth-ranked player, packed into the same
  // shape a real draft would fill: down a column (a "round"), then over to
  // the next one — reversing direction on a snake draft's back rounds, via
  // the same teamForPick/roundForPick pair as the board above. Built from
  // the full pool (not just the undrafted remainder) so a drafted player's
  // cell stays put — grayed out below — instead of every later player
  // shifting up to fill the gap.
  const poolGrid = useMemo(() => {
    const g: (AdpEntry | undefined)[][] = Array.from({ length: settings.teams }, () =>
      Array(settings.rounds).fill(undefined)
    );
    for (let idx = 0; idx < totalPicks && idx < pool.length; idx++) {
      const round = roundForPick(idx, settings.teams);
      const team = teamForPick(idx, settings.teams, settings.type);
      g[team - 1][round - 1] = pool[idx];
    }
    return g;
  }, [pool, settings.teams, settings.rounds, settings.type, totalPicks]);

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

  function toggleTarget(key: string) {
    setTargets((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handlePoolCellClick(player: AdpEntry) {
    const key = draftPoolKey(player);
    if (editMode) toggleTarget(key);
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
  const poolGridColumns = `repeat(${settings.rounds}, minmax(52px, 1fr))`;

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
            Teams, rounds, and order reset the board. Dynasty/Fantasy and 1QB/Superflex just re-rank the pool — real
            crowd Average Draft Position from actual Sleeper drafts (yafsb.com) — your picks stay put, and each
            list/format combination lays the grid below out in its own order.
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
                <div
                  className={`draft-grid-row${selectedTeam === r + 1 ? " team-selected" : ""}`}
                  style={{ gridTemplateColumns: poolGridColumns }}
                  key={r}
                >
                  {row.map((player, c) => {
                    if (!player) return <div className="draft-pool-cell empty" key={c} />;
                    const key = draftPoolKey(player);
                    const isTarget = targets?.has(key) ?? false;
                    const color = POSITION_ACCENT[player.position] ?? DEFAULT_ACCENT;
                    const isDrafted = draftedKeys.has(key);
                    return (
                      <button
                        key={c}
                        type="button"
                        className={`draft-pool-cell${isDrafted ? " drafted" : ""}`}
                        style={isDrafted ? undefined : targetStyle(isTarget, color)}
                        onClick={() => handlePoolCellClick(player)}
                        disabled={isDrafted || (!editMode && draftComplete)}
                        title={isDrafted ? `${player.name} — drafted` : editMode ? `Tag ${player.name}` : `Draft ${player.name}`}
                      >
                        <span className="draft-pool-cell-rank">{rankByKey.get(key)}</span>
                        <span className="draft-pool-cell-pos" style={{ color }}>
                          {player.position}
                        </span>
                        <span className="draft-pool-cell-name">{player.name}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="card-note">
            {editMode
              ? "Click a player to tag them, click again to untag. Colors match position. Targets are saved in this browser."
              : "Ranked by real average draft position from actual Sleeper drafts, laid out the way a draft would fill: down a round, then over to the next. Click a player to fill the current pick."}
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
                  <div
                    className={`draft-grid-team-header${selectedTeam === i + 1 ? " selected" : ""}`}
                    key={i}
                    onClick={() => setSelectedTeam((prev) => (prev === i + 1 ? null : i + 1))}
                    title={`${selectedTeam === i + 1 ? "Deselect" : "Select"} ${name} — outlines their row in Available Players`}
                  >
                    {/* The input fills the header, so its click IS the header's click —
                        no stopPropagation here, or the header's onClick (team select)
                        would never fire. A click both focuses the input for renaming
                        and toggles the team selection; that's a fine pairing since
                        selection is just a transient view aid. */}
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
