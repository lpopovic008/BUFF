"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import "./recap-neon.css";
import {
  RecapModel,
  RECAP_SECTIONS,
  RecapSectionKey,
  ExtraSectionKey,
  isExtraSection,
  isUpcomingSection,
  recapLayout,
  isSectionIncluded,
  isDetailShown,
  WHO_WILL_PREVAIL,
  GOOD_LUCK_TO_ALL,
  upcomingWeekLabel,
  DETAIL_FIELD,
  matchupNumber,
  matchupTitle,
  MoreMatchup,
  resultMatchupKey,
  upcomingMatchupKey,
  sectionTitle,
  TitledSection,
} from "@/lib/recap-model";
import { BowlMatchupResult } from "@/lib/bowl-narrative";
import { BowlGamePick, pickAt, RecapBowlPicks } from "@/lib/localStore";
import { LeagueTeamOption } from "@/hooks/useLeagueTeams";
import { WeekRecapData } from "@/lib/league-data";
import { PayoutLedger } from "@/lib/payouts";
import { recapDisplayFont } from "@/lib/fonts";
import { generateAiRecap } from "@/lib/recap-ai";
import { formatPoints } from "@/lib/format";
import { droppedMatchup, isMatchupDrag } from "@/lib/matchup-drag";
import {
  GraphicTeam,
  decidedMatchupFor,
  winnersForGraphic,
  highScorerForGraphic,
  lastWeekForGraphic,
  standingsForGraphic,
  recordsStandingsForGraphic,
} from "@/lib/recap-graphic-data";

type FieldKey = keyof RecapModel;

/** Initials fallback — same rule the canvas graphic uses (recap-graphic.ts's initialsFor): a bracket placeholder has nothing sensible to take a letter from. */
function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.startsWith("[")) return "?";
  return trimmed.charAt(0).toUpperCase();
}

/** A team/player logo or photo — a real `<img>` when there's a URL (no canvas/CORS concerns here, this never gets exported as a bitmap), initials otherwise. `ring` matches the graphic's gradient-ring winner treatment; `dim` its 50%-alpha loser treatment. */
function Avatar({
  url,
  name,
  ring = false,
  dim = false,
  small = false,
}: {
  url: string | null;
  name: string;
  ring?: boolean;
  dim?: boolean;
  small?: boolean;
}) {
  const cls = ["rn-avatar", ring ? "rn-ring" : "", dim ? "rn-dim" : "", small ? "rn-avatar-sm" : ""].filter(Boolean).join(" ");
  return <div className={cls}>{url ? <img src={url} alt="" /> : initialsFor(name)}</div>;
}

/** The write-up's own title — always a visible input box, not a plain heading, matching every other editable field's affordance. */
function TitleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Give this write-up a title…"
      className="rn-title-input"
    />
  );
}

/** A section card's title: emoji bookending a solid-cyan label, matching recap-graphic.ts's sectionHeader(). */
function SectionHeader({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="rn-section-header">
      <span>{emoji}</span>
      <span className="rn-label">{label}</span>
      <span>{emoji}</span>
    </div>
  );
}

/** Freeform commentary — always a visible textarea, sized/weighted/colored exactly like the graphic's own Detail text (bright bold white), so what you type here is what the picture will show. */
function DetailField({ value, onChange, placeholder = "Add a detail…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="rn-detail-textarea"
    />
  );
}

/** A textarea as tall as what's written in it — a line more for every line typed, a line less for every one taken out. */
function GrowingTextarea({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={1} className={className} />;
}

/** In the League Room, a section's own Details: a grey line under what it shows, growing with what's written in it. */
function RoomDetails({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <GrowingTextarea value={value} onChange={onChange} placeholder="Add details…" className="rn-room-details" />;
}

/** In the League Room, a section's title: its emoji, and its name in bigger, bolder type — to rename it, typed over. */
function RoomTitle({ emoji, value, placeholder, onChange }: { emoji: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div className="rn-room-title">
      <span aria-hidden>{emoji}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Section title" />
    </div>
  );
}

/** The bowl/cup a matchup is named after — always a visible input box (not hidden behind a double-click), styled in the same display font/size the graphic's own poster title uses. Writes back to the shared pick this box's data came from (see recap/page.tsx), so every other box built from that same pick — this week's result, or a future week's preview of it — picks up the new name too. */
function BowlNameInput({ value, placeholder, onRename }: { value: string; placeholder: string; onRename: (name: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onRename(e.target.value)}
      placeholder={placeholder}
      className={`${recapDisplayFont.className} rn-bowl-name-input`}
    />
  );
}

/** Picks which team fills one slot of an upcoming matchup — a real dropdown (already a proper editable control), with a small logo preview matching the graphic's team columns. */
function TeamSelect({
  value,
  onChange,
  options,
}: {
  value: number | "";
  onChange: (rosterId: number | "") => void;
  options: LeagueTeamOption[];
}) {
  const picked = typeof value === "number" ? options.find((o) => o.rosterId === value) : undefined;
  return (
    <div className="rn-team-col">
      <Avatar url={picked?.avatar ?? null} name={picked?.teamName ?? "?"} />
      <select value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")} className="rn-team-select">
        <option value="">— Select a team —</option>
        {options.map((t) => (
          <option key={t.rosterId} value={t.rosterId}>
            {t.teamName}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Bowl of the Week / Honorable Mention as decided — winner bright with a ring, loser dimmed, the same "W  defeated  L" wording the graphic draws, computed live from whoever's actually ahead right now rather than hand-typed. */
function DecidedMatchupBody({ matchup, teams }: { matchup: BowlMatchupResult | null; teams: Record<number, GraphicTeam> }) {
  const winner = matchup ? teams[matchup.winnerRosterId] : undefined;
  const loser = matchup ? teams[matchup.loserRosterId] : undefined;
  return (
    <div className="rn-team-row">
      <div className="rn-team-col">
        <Avatar url={winner?.avatar ?? null} name={winner?.name ?? "?"} ring />
        <span className="rn-team-name">{winner?.name ?? "[Team 1]"}</span>
      </div>
      <div className="rn-result-line" style={{ alignSelf: "center", marginTop: 0 }}>
        <span className="rn-w">W</span>
        <span className="rn-vs-text">defeated</span>
        <span className="rn-l">L</span>
      </div>
      <div className="rn-team-col">
        <Avatar url={loser?.avatar ?? null} name={loser?.name ?? "?"} dim />
        <span className="rn-team-name rn-muted">{loser?.name ?? "[Team 2]"}</span>
      </div>
    </div>
  );
}

/** The two teams playing an upcoming matchup — not decided yet, so no winner/loser, just who's in it. Bound to the raw pick (not a resolved preview, which is null until both a name and two teams exist) so a team already picked shows up immediately, even before a bowl name has been typed. Picking a team here writes straight back to the shared bowl pick (see recap/page.tsx), same as renaming the header above it. */
function PreviewMatchupBody({
  pick,
  teamOptions,
  onChangeTeam,
  stats,
}: {
  pick: BowlGamePick | null;
  teamOptions: LeagueTeamOption[] | null;
  onChangeTeam: (slot: 0 | 1, rosterId: number | "") => void;
  /** Each team's points for and against, and the two's record against each other (see RecapMatchups' teamStats). */
  stats?: RecapMatchups["teamStats"];
}) {
  if (!teamOptions) {
    return <p className="rn-caption">Loading teams…</p>;
  }
  const rosterIds = pick?.rosterIds ?? [];
  const [a, b] = [rosterIds[0], rosterIds[1]];
  // Under each team picked, its PF and PA; under the VS, once both are, their record against each other, the left
  // team's first.
  const points = (id: number | undefined) => {
    const of = id !== undefined ? stats?.of(id) : null;
    return of ? (
      <span className="rn-team-stats">
        PF {formatPoints(of.pointsFor)} · PA {formatPoints(of.pointsAgainst)}
      </span>
    ) : null;
  };
  const between = a !== undefined && b !== undefined ? stats?.between(a, b) : null;
  return (
    <div className="rn-team-row">
      <div className="rn-team-pick">
        <TeamSelect value={a ?? ""} options={teamOptions} onChange={(id) => onChangeTeam(0, id)} />
        {points(a)}
      </div>
      <span className="rn-vs-col">
        <span className="rn-vs">VS</span>
        {between ? (
          <span className="rn-alltime" title="Their all-time record against each other">
            All-time {between.wins}–{between.losses}
          </span>
        ) : null}
      </span>
      <div className="rn-team-pick">
        <TeamSelect value={b ?? ""} options={teamOptions} onChange={(id) => onChangeTeam(1, id)} />
        {points(b)}
      </div>
    </div>
  );
}

/** Live data shared by the four computed, never-hand-edited sections below — the same source (recap-graphic-data.ts) the exported graphic itself draws from, so this on-screen preview and the picture you copy can never quietly disagree. */
interface LiveWeekData {
  recapData: WeekRecapData | null;
  ledger: PayoutLedger | null;
  week: number;
  teams: Record<number, GraphicTeam>;
}

/** "🏆 High Scorer 🏆": the top-3 teams staggered into a podium on the left (1st highest, 2nd a step lower, 3rd lower still, gold/silver/bronze rank labels, points instead of name beneath each logo) and the winning team's top-3 players triangled on the right — the same layout and the same live data as the graphic's own podium. */
function HighScorerBody({ recapData, ledger, week, teams, playerNames }: LiveWeekData & { playerNames: Record<string, string> }) {
  const data = highScorerForGraphic(recapData, ledger, week, teams, playerNames, "");
  if (!data) {
    return <p className="rn-caption">Calculated from live scores once games are underway — not editable.</p>;
  }
  const ordered = [...data.runnersUp].reverse();
  ordered.push({ team: data.team, points: data.points });
  const rankClass = ["rn-bronze", "rn-silver", "rn-gold"];
  const rankLabel = ["3RD", "2ND", "1ST"];
  const rankRow = ["rn-rank-3", "rn-rank-2", ""];
  const players = [0, 1, 2].map((i) => data.topPlayers[i] ?? { name: "?", points: "–", photoUrl: null });
  return (
    <div className="rn-podium">
      <div className="rn-podium-teams">
        {ordered.map((entry, i) => (
          <div key={i} className={`rn-podium-team ${rankRow[i]}`}>
            <span className={`rn-rank-label ${rankClass[i]}`}>{rankLabel[i]}</span>
            <Avatar url={entry.team.avatarUrl} name={entry.team.name} ring={i === 2} small={i !== 2} dim={i !== 2} />
            <span className={i === 2 ? "rn-points-label rn-top" : "rn-points-label"}>{entry.points}</span>
          </div>
        ))}
      </div>
      <div className="rn-player-triangle">
        <div className="rn-player">
          <span className="rn-player-score">{players[0].points}</span>
          <Avatar url={players[0].photoUrl} name={players[0].name} />
        </div>
        <div className="rn-player-bottom-row">
          <div className="rn-player">
            <span className="rn-player-score">{players[1].points}</span>
            <Avatar url={players[1].photoUrl} name={players[1].name} small />
          </div>
          <div className="rn-player">
            <span className="rn-player-score">{players[2].points}</span>
            <Avatar url={players[2].photoUrl} name={players[2].name} small />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The auto-generated "X outperformed the league..." sentence — computed live (see recap-graphic-data.ts), same bright bold treatment as Detail text, never hand-typed. */
function HighScorerSentence({ recapData, ledger, week, teams, playerNames }: LiveWeekData & { playerNames: Record<string, string> }) {
  const data = highScorerForGraphic(recapData, ledger, week, teams, playerNames, "");
  if (!data) return null;
  return <p className="rn-sentence">{data.sentence}</p>;
}

/** Who's getting paid this week — avatar, dollar amount, username, margin of victory — same data and layout as the graphic's Winners row. */
function WinnersBody({ recapData, ledger, week, teams }: LiveWeekData) {
  const rows = winnersForGraphic(recapData, ledger, week, teams);
  if (!rows || rows.length === 0) {
    return <p className="rn-caption">Calculated from live scores once a matchup resolves — not editable.</p>;
  }
  return (
    <div className="rn-winners-row">
      {rows.map((r, i) => (
        <div key={i} className="rn-winner">
          <span className="rn-winner-amount">{r.amountLabel}</span>
          <Avatar url={r.avatarUrl} name={r.name} ring={r.highlight} />
          <span className="rn-team-name">{r.name}</span>
          {r.marginLabel ? <span className="rn-winner-margin">{r.marginLabel}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Every team's result this week — name, score, a proportional background bar (the bar's own "0" always starts past the longest name shown here, same fix as the graphic), win/loss — same data as the graphic's Last Week table. */
function LastWeekBody({ recapData, ledger, week, teams }: LiveWeekData) {
  const rows = lastWeekForGraphic(recapData, ledger, week, teams);
  if (!rows || rows.length === 0) {
    return <p className="rn-caption">Calculated from live scores once games are underway — not editable.</p>;
  }
  const points = rows.map((r) => r.points);
  const max = Math.max(...points);
  const min = Math.min(...points);
  return (
    <div className="rn-lastweek-rows">
      {rows.map((r, i) => {
        const pct = max === min ? 100 : 30 + ((r.points - min) / (max - min)) * 70;
        return (
          <div key={i} className="rn-lastweek-row">
            <div className="rn-lastweek-bar" style={{ width: `${pct}%` }} />
            <span className="rn-lastweek-name">{r.name}</span>
            <span className="rn-lastweek-points">{r.pointsLabel}</span>
            <span className={`rn-lastweek-result ${r.won ? "rn-w" : "rn-l"}`}>{r.won ? "W" : "L"}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Running earnings through this write-up's own week — a stack of bills per team, taller for whoever's made more, same as the graphic's Standings section. */
function StandingsBody({ recapData, ledger, week, teams }: LiveWeekData) {
  const rows = standingsForGraphic(recapData, ledger, week, teams);
  if (!rows || rows.length === 0) {
    return <p className="rn-caption">Calculated from live earnings once there&rsquo;s payout data — not editable.</p>;
  }
  const maxAmount = Math.max(...rows.map((r) => r.amount), 0);
  const unit = Math.max(15, Math.ceil(maxAmount / 16 / 15) * 15);
  return (
    <div className="rn-standings-row">
      {rows.map((r, i) => {
        const count = r.amount > 0 ? Math.max(1, Math.round(r.amount / unit)) : 0;
        return (
          <div key={i} className="rn-standing">
            <span className="rn-standing-amount">{r.amountLabel}</span>
            <div className="rn-bill-stack">
              {Array.from({ length: count }).map((_, b) => (
                <div key={b} className="rn-bill">
                  $
                </div>
              ))}
            </div>
            <span className="rn-standing-name">{r.name}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Every team's season win-loss record, ranked best to worst — logo on the left of the team name, the record held tight to the right edge, one row per team — same data and layout as the graphic's Season Standings section. */
function RecordsStandingsBody({ recapData, teams }: { recapData: WeekRecapData | null; teams: Record<number, GraphicTeam> }) {
  const rows = recordsStandingsForGraphic(recapData, teams);
  if (!rows || rows.length === 0) {
    return <p className="rn-caption">Calculated from live standings once games are underway — not editable.</p>;
  }
  return (
    <div className="rn-records-rows">
      {rows.map((r, i) => (
        <div key={i} className="rn-records-row">
          <Avatar url={r.avatarUrl} name={r.name} small />
          <span className="rn-records-name">{r.name}</span>
          <span className="rn-records-record">{r.record}</span>
        </div>
      ))}
    </div>
  );
}

/** One line per real matchup this week, in the same "W def. L 128.4-101.2" shape the backend's prompt expects — byes (a game with only one team) are skipped since there's nothing to narrate. */
function buildMatchupLines(recapData: WeekRecapData): string[] {
  return recapData.games
    .filter((g) => g.teams.length === 2)
    .map((g) => {
      const [a, b] = g.teams;
      const fmt = (n: number) => n.toFixed(1);
      if (a.points === b.points) return `${a.teamName} tied ${b.teamName} ${fmt(a.points)}-${fmt(b.points)}`;
      const [winner, loser] = a.points > b.points ? [a, b] : [b, a];
      return `${winner.teamName} def. ${loser.teamName} ${fmt(winner.points)}-${fmt(loser.points)}`;
    });
}

/**
 * The AI-written lede — a textarea the commish can freely edit (nothing here
 * is ever silently overwritten), plus a button that calls the deployed
 * backend for a first draft. Facts are sourced from the same live data the
 * mechanical sections above already computed (recapData's matchups, the High
 * Scorer sentence, the Season Standings leader) rather than re-deriving
 * anything — see src/lib/recap-ai.ts for the actual request.
 */
function AiRecapBody({
  value,
  onChange,
  recapData,
  week,
  highScorer,
  standingsLeader,
}: {
  value: string;
  onChange: (v: string) => void;
  recapData: WeekRecapData | null;
  week: number;
  highScorer: string;
  standingsLeader: string;
}) {
  const [status, setStatus] = useState<"idle" | "generating" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!recapData) return;
    setStatus("generating");
    setError(null);
    try {
      const text = await generateAiRecap({
        leagueName: recapData.league.name,
        week,
        matchups: buildMatchupLines(recapData),
        highScorer,
        standingsLeader: standingsLeader.split("\n")[0] ?? "",
      });
      onChange(text);
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <div className="rn-ai-body flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='Click "Generate with AI" for a first draft, or write your own lede here…'
        rows={3}
        className="rn-detail-textarea"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!recapData || status === "generating"}
          className="rn-generate-button"
        >
          {status === "generating" ? "Generating…" : "✨ Generate with AI"}
        </button>
        {!recapData ? <span className="rn-caption">Available once this week&rsquo;s matchups are in.</span> : null}
        {status === "error" && error ? <span className="rn-generate-error">{error}</span> : null}
      </div>
    </div>
  );
}

/** Every section by name — the one it's been given in `model`, if any (see sectionTitle) — a Matchup of the Week's
 * result ("Bowl of the Week #2") told apart from its preview ("Matchup of the Week #2"). */
export function sectionName(key: RecapSectionKey, model: RecapModel | null = null): { emoji: string; label: string } {
  const n = matchupNumber(key);
  if (n !== null) return matchupTitle(n, isUpcomingSection(key));
  return sectionTitle(model, key as TitledSection);
}

/** The sections a recap doesn't have that it could: every one but the Matchups of the Week past the league's number of games. */
export function addableSections(layout: RecapSectionKey[], maxMatchups: number): RecapSectionKey[] {
  return RECAP_SECTIONS.map((s) => s.key as RecapSectionKey).filter((k) => !layout.includes(k) && (matchupNumber(k) ?? 0) <= maxMatchups);
}

/** The Matchups of the Week the editor works with: this week's picks (made last week) and how they turned out, next week's picks, and what renaming one or picking its teams does. */
export interface RecapMatchups {
  resultPicks: RecapBowlPicks | null;
  upcomingPicks: RecapBowlPicks | null;
  /** How each of this week's picks turned out, by number (1-based) — null until it's scored. */
  results: Record<number, BowlMatchupResult | null>;
  onRenameResult: (n: number, name: string) => void;
  onRenameUpcoming: (n: number, name: string) => void;
  onChangeUpcomingTeam: (n: number, slot: 0 | 1, rosterId: number | "") => void;
  /** Both of an upcoming matchup's teams at once (a matchup dropped on it). */
  onSetUpcomingTeams?: (n: number, rosterIds: number[]) => void;
  /** A team's points for and against so far, and two teams' all-time record against each other (the first's wins
   * first) — null where there's none to give. */
  teamStats?: {
    of: (rosterId: number) => { pointsFor: number; pointsAgainst: number } | null;
    between: (a: number, b: number) => { wins: number; losses: number } | null;
  };
}

/** An added section's body: its text, a draft written from the week's data (or, for notes, blank), free to edit. */
function ExtraBody({ value, onChange, section }: { value: string; onChange: (v: string) => void; section: ExtraSectionKey }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={section === "commishNotes" ? "Anything else the league should hear this week…" : "Write this section…"}
      rows={Math.max(2, value.split("\n").length)}
      className="rn-detail-textarea"
    />
  );
}

/** A section as the write-up's own words (the League Room's, see `text`): its lines as they're written, each pair of a
 * name and its points (`pairs`) on one line. */
function TextLines({ value, pairs = false }: { value: string; pairs?: boolean }) {
  const lines = value.split("\n").filter((l) => l.trim() !== "");
  const shown = pairs ? Array.from({ length: Math.ceil(lines.length / 2) }, (_, i) => lines.slice(2 * i, 2 * i + 2).join("  ")) : lines;
  return <p className="rn-text">{shown.join("\n")}</p>;
}

/**
 * How the sections are laid out: in the League Room (`room`), each its title, what it shows and its Details line one
 * under another, the Details always there to write in; and whether each has its own buttons (`controls`: leave it out,
 * take it out) — not where the contents beside it has them.
 */
const SectionMode = createContext({ room: false, controls: true });

/** Every section's shared shell: a translucent card matching the graphic's own, an include/exclude checkbox pinned to the top-right corner (unchecked greys the whole box out and leaves it out of both the copied text and the graphic), and a "+"/"–" button pinned to the bottom-right that shows or hides `detail`. `poster` switches to the wider-padded gradient-tinted card the two decided/preview matchups use in the graphic. */
function SectionBox({
  section,
  included,
  onToggleIncluded,
  header,
  children,
  detail,
  detailShown = false,
  onToggleDetail,
  onRemove,
  poster = false,
  onDropTeams,
}: {
  /** Which section this is — the contents list down the side finds it by this. */
  section: RecapSectionKey;
  included: boolean;
  onToggleIncluded: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  /** Its optional commentary box, behind the "+" — none for a section that's one block of text already. */
  detail?: React.ReactNode;
  detailShown?: boolean;
  onToggleDetail?: () => void;
  /** Takes it out of the layout — this week's and every week's after (it can be added back from the contents). */
  onRemove?: () => void;
  poster?: boolean;
  /** A matchup dropped on it (see matchup-drag.ts): its two teams. */
  onDropTeams?: (rosterIds: number[]) => void;
}) {
  const [over, setOver] = useState(false);
  const { room, controls } = useContext(SectionMode);
  const drop = onDropTeams
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!isMatchupDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        },
        onDrop: (e: React.DragEvent) => {
          if (!isMatchupDrag(e)) return;
          e.preventDefault();
          setOver(false);
          const ids = droppedMatchup(e);
          if (ids.length > 0) onDropTeams(ids);
        },
      }
    : null;
  return (
    <div
      data-recap-section={section}
      className={`rn-card ${poster ? "rn-poster-card" : ""} ${included ? "" : "rn-excluded"} ${over ? "rn-drop-over" : ""}`}
      {...drop}
    >
      {controls ? (
        <label
          className="rn-include-toggle-wrap"
          title={included ? "Included — click to leave this out" : "Excluded — click to include it"}
        >
          <input type="checkbox" checked={included} onChange={onToggleIncluded} className="rn-include-toggle" />
        </label>
      ) : null}
      <div className="rn-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {header}
        {/* What it shows (laid out as part of the body, except in the League Room, where it fills the box: see .rn-room). */}
        <div className="rn-card-main">{children}</div>
        {/* Its Details — in the League Room always there, a line to write in. */}
        {detail && (detailShown || room) ? detail : null}
      </div>
      {detail && onToggleDetail && !room ? (
        <button
          type="button"
          onClick={onToggleDetail}
          title={detailShown ? "Remove the detail box" : "Add a detail box"}
          aria-label={detailShown ? "Remove the detail box" : "Add a detail box"}
          className="rn-detail-toggle"
        >
          {detailShown ? "–" : "+"}
        </button>
      ) : null}
      {onRemove && controls ? (
        <button type="button" onClick={onRemove} title="Remove this section" aria-label="Remove this section" className="rn-detail-toggle rn-remove-section">
          ×
        </button>
      ) : null}
    </div>
  );
}

/**
 * The commish recap, styled as a live HTML replica of the exported graphic
 * (see recap-graphic.ts) — same dark neon theme, same layout per section —
 * so editing here is a true preview of what "Copy graphic" produces, not a
 * generic form floating apart from it. Every genuinely editable field
 * (title, bowl/matchup names, team pickers, Detail boxes) renders as an
 * always-visible input/textarea/select styled to match its surrounding
 * text; every computed field (winner/loser, the High Scorer podium, Winners
 * row, Last Week table, Standings stacks) renders read-only, sourced live
 * from recap-graphic-data.ts — the exact same functions the graphic itself
 * calls, so the two can never quietly disagree.
 */
export function RecapSectionsEditor({
  model,
  onChange,
  matchups,
  teams,
  teamOptions,
  recapData,
  ledger,
  week,
  playerNames,
  maxMatchups = 2,
  onRemoveSection,
  onAddSection,
  room = false,
  controls = true,
  only,
}: {
  model: RecapModel;
  onChange: (model: RecapModel) => void;
  /** The Matchups of the Week — this week's picks and how they turned out, next week's, and their renames and team picks. */
  matchups: RecapMatchups;
  teams: Record<number, GraphicTeam>;
  /** The league's roster pool for the upcoming-matchup team pickers below — null until useLeagueTeams finishes loading. */
  teamOptions: LeagueTeamOption[] | null;
  /** This write-up's own week's matchup data — null in preseason, or before it's loaded — and the money ledger it's scored against, feeding the four computed sections below. */
  recapData: WeekRecapData | null;
  ledger: PayoutLedger | null;
  week: number;
  /** Player id -> display name, for the High Scorer podium's top-3-player photos. */
  playerNames: Record<string, string>;
  /** How many Matchups of the Week there can be — one per game the league plays a week. */
  maxMatchups?: number;
  /** Take a section out of the layout (see RecapModel.layout), or add one — the contents down the side do the same. */
  onRemoveSection?: (key: RecapSectionKey) => void;
  onAddSection?: (key: RecapSectionKey) => void;
  /**
   * In the League Room's write-ups panel: the write-up as plain text (see `text`), see-through, its sections one over
   * another, and a section to add at the bottom on any screen (there's no contents down the side there).
   */
  room?: boolean;
  /** Each section's own buttons — to leave it out, to take it out — for where there's no contents beside it to do it. */
  controls?: boolean;
  /**
   * Just one part of it (on a phone in the League Room, picked on the floor): the title ("title"), one section (its
   * key), or the section to add ("add") — none, all of it.
   */
  only?: string;
}) {
  // In the League Room, the write-up as plain text (see .recap-text in recap-neon.css): each section's words alone,
  // one after another, as little room as they take — what's to be picked or written, plain boxes.
  const text = room;
  const set = <K extends FieldKey>(key: K, value: RecapModel[K]) => onChange({ ...model, [key]: value });
  const toggleIncluded = (key: RecapSectionKey) =>
    onChange({ ...model, include: { ...model.include, [key]: !isSectionIncluded(model, key) } });
  const included = (key: RecapSectionKey) => isSectionIncluded(model, key);
  const detailShown = (key: RecapSectionKey) => isDetailShown(model, key);
  const toggleDetail = (key: RecapSectionKey) =>
    onChange({ ...model, detailShown: { ...model.detailShown, [key]: !isDetailShown(model, key) } });
  const live: LiveWeekData = { recapData, ledger, week, teams };
  // A section's title: in the League Room, its name to type over (a blank one goes back to its own, see sectionTitle);
  // elsewhere, its header as the graphic draws it.
  const head = (key: TitledSection) => {
    const { emoji, label } = sectionTitle(model, key);
    return text ? (
      <RoomTitle
        emoji={emoji}
        value={model.titles?.[key] ?? label}
        placeholder={sectionTitle(null, key).label}
        onChange={(v) => onChange({ ...model, titles: { ...model.titles, [key]: v } })}
      />
    ) : (
      <SectionHeader emoji={emoji} label={label} />
    );
  };
  // Its Details: in the League Room, the grey line under it; elsewhere, the box behind its "+".
  const details = (value: string, onDetail: (v: string) => void) =>
    text ? <RoomDetails value={value} onChange={onDetail} /> : <DetailField value={value} onChange={onDetail} />;

  // A Matchup of the Week's Detail, wherever it's kept: a field of its own for the first two, `more` for the rest.
  const matchupDetail = (key: RecapSectionKey): string => {
    const field = DETAIL_FIELD[key];
    if (field) return model[field] as string;
    const more = model.more?.[matchupNumber(key) as MoreMatchup];
    return (isUpcomingSection(key) ? more?.detail : more?.resultDetail) ?? "";
  };
  const setMatchupDetail = (key: RecapSectionKey, value: string) => {
    const field = DETAIL_FIELD[key];
    if (field) return onChange({ ...model, [field]: value });
    const n = matchupNumber(key) as MoreMatchup;
    const more = model.more?.[n] ?? { result: "", resultDetail: "", lines: "", detail: "" };
    onChange({ ...model, more: { ...model.more, [n]: { ...more, [isUpcomingSection(key) ? "detail" : "resultDetail"]: value } } });
  };
  // How the nth Matchup of the Week picked last week turned out: its name, and the two teams once it's scored.
  const resultCard = (n: number) => {
    const key = resultMatchupKey(n);
    const result = matchups.results[n] ?? null;
    return (
      <SectionBox
        onRemove={onRemoveSection ? () => onRemoveSection(key) : undefined}
        section={key}
        poster
        included={included(key)}
        onToggleIncluded={() => toggleIncluded(key)}
        header={
          text ? (
            <RoomTitle
              emoji={matchupTitle(n, false).emoji}
              value={pickAt(matchups.resultPicks, n).name}
              placeholder={`Name the ${matchupTitle(n, false).label}…`}
              onChange={(name) => matchups.onRenameResult(n, name)}
            />
          ) : (
            <BowlNameInput
              value={pickAt(matchups.resultPicks, n).name}
              placeholder={`Name the ${matchupTitle(n, false).label}…`}
              onRename={(name) => matchups.onRenameResult(n, name)}
            />
          )
        }
        detailShown={detailShown(key)}
        onToggleDetail={() => toggleDetail(key)}
        detail={details(matchupDetail(key), (v) => setMatchupDetail(key, v))}
      >
        {text ? (
          <TextLines value={n === 1 ? model.bowlResult : n === 2 ? model.honorableResult : (model.more?.[n as MoreMatchup]?.result ?? "")} />
        ) : decidedMatchupFor(teams, result) ? (
          <DecidedMatchupBody matchup={result} teams={teams} />
        ) : (
          <p className="rn-caption">Calculated from live scores — not editable.</p>
        )}
      </SectionBox>
    );
  };
  // Next week's nth Matchup of the Week: its name and its two teams (suggested best first — see suggestMatchups).
  const previewCard = (n: number) => {
    const key = upcomingMatchupKey(n);
    const { emoji, label } = matchupTitle(n, true);
    return (
      <SectionBox
        onRemove={onRemoveSection ? () => onRemoveSection(key) : undefined}
        section={key}
        poster
        included={included(key)}
        onToggleIncluded={() => toggleIncluded(key)}
        onDropTeams={matchups.onSetUpcomingTeams ? (ids) => matchups.onSetUpcomingTeams!(n, ids) : undefined}
        header={
          text ? (
            <RoomTitle
              emoji={emoji}
              value={pickAt(matchups.upcomingPicks, n).name}
              placeholder={`Name next week's ${label}…`}
              onChange={(name) => matchups.onRenameUpcoming(n, name)}
            />
          ) : (
            <>
              <SectionHeader emoji={emoji} label={label} />
              <BowlNameInput
                value={pickAt(matchups.upcomingPicks, n).name}
                placeholder={`Name next week's ${label}…`}
                onRename={(name) => matchups.onRenameUpcoming(n, name)}
              />
            </>
          )
        }
        detailShown={detailShown(key)}
        onToggleDetail={() => toggleDetail(key)}
        detail={details(matchupDetail(key), (v) => setMatchupDetail(key, v))}
      >
        <PreviewMatchupBody
          pick={pickAt(matchups.upcomingPicks, n)}
          teamOptions={teamOptions}
          onChangeTeam={(slot, rosterId) => matchups.onChangeUpcomingTeam(n, slot, rosterId)}
          stats={matchups.teamStats}
        />
        {/* The second closes the house style's write-up; every other one asks who'll win. */}
        <p className="rn-trailer">{n === 2 ? GOOD_LUCK_TO_ALL : WHO_WILL_PREVAIL}</p>
      </SectionBox>
    );
  };

  // Every house-style section's card, by section; the added ones (EXTRA_SECTIONS) are built below.
  const cards: Partial<Record<RecapSectionKey, React.ReactNode>> = {
    aiRecap: (
      <SectionBox
        onRemove={onRemoveSection ? () => onRemoveSection("aiRecap") : undefined}
        section="aiRecap"
        included={included("aiRecap")}
        onToggleIncluded={() => toggleIncluded("aiRecap")}
        header={head("aiRecap")}
        detailShown={detailShown("aiRecap")}
        onToggleDetail={() => toggleDetail("aiRecap")}
        detail={details(model.aiRecapDetail, (v) => set("aiRecapDetail", v))}
      >
        <AiRecapBody
          value={model.aiRecap}
          onChange={(v) => set("aiRecap", v)}
          recapData={recapData}
          week={week}
          highScorer={model.highScorer}
          standingsLeader={model.records}
        />
      </SectionBox>
    ),
    bowl: resultCard(1),
    honorable: resultCard(2),
    highScorer: (
      <SectionBox
        onRemove={onRemoveSection ? () => onRemoveSection("highScorer") : undefined}
        section="highScorer"
        included={included("highScorer")}
        onToggleIncluded={() => toggleIncluded("highScorer")}
        header={head("highScorer")}
        detailShown={detailShown("highScorer")}
        onToggleDetail={() => toggleDetail("highScorer")}
        detail={details(model.highScorerDetail, (v) => set("highScorerDetail", v))}
      >
        {text ? (
          <TextLines value={model.highScorer} />
        ) : (
          <>
            <HighScorerBody {...live} playerNames={playerNames} />
            <HighScorerSentence {...live} playerNames={playerNames} />
          </>
        )}
      </SectionBox>
    ),
    winners: (
      <SectionBox
        onRemove={onRemoveSection ? () => onRemoveSection("winners") : undefined}
        section="winners"
        included={included("winners")}
        onToggleIncluded={() => toggleIncluded("winners")}
        header={head("winners")}
        detailShown={detailShown("winners")}
        onToggleDetail={() => toggleDetail("winners")}
        detail={details(model.winnersDetail, (v) => set("winnersDetail", v))}
      >
        {text ? <TextLines value={model.winners} /> : <WinnersBody {...live} />}
      </SectionBox>
    ),
    lastWeek: (
      <SectionBox
        onRemove={onRemoveSection ? () => onRemoveSection("lastWeek") : undefined}
        section="lastWeek"
        included={included("lastWeek")}
        onToggleIncluded={() => toggleIncluded("lastWeek")}
        header={head("lastWeek")}
        detailShown={detailShown("lastWeek")}
        onToggleDetail={() => toggleDetail("lastWeek")}
        detail={details(model.lastWeekDetail, (v) => set("lastWeekDetail", v))}
      >
        {text ? <TextLines value={model.lastWeek} pairs /> : <LastWeekBody {...live} />}
      </SectionBox>
    ),
    standings: (
      <SectionBox
        onRemove={onRemoveSection ? () => onRemoveSection("standings") : undefined}
        section="standings"
        included={included("standings")}
        onToggleIncluded={() => toggleIncluded("standings")}
        header={head("standings")}
        detailShown={detailShown("standings")}
        onToggleDetail={() => toggleDetail("standings")}
        detail={details(model.standingsDetail, (v) => set("standingsDetail", v))}
      >
        {text ? <TextLines value={model.standings} /> : <StandingsBody {...live} />}
      </SectionBox>
    ),
    records: (
      <SectionBox
        onRemove={onRemoveSection ? () => onRemoveSection("records") : undefined}
        section="records"
        included={included("records")}
        onToggleIncluded={() => toggleIncluded("records")}
        header={head("records")}
        detailShown={detailShown("records")}
        onToggleDetail={() => toggleDetail("records")}
        detail={details(model.recordsDetail, (v) => set("recordsDetail", v))}
      >
        {text ? <TextLines value={model.records} /> : <RecordsStandingsBody recapData={recapData} teams={teams} />}
      </SectionBox>
    ),
    upcomingBowl: previewCard(1),
    upcomingHonorable: previewCard(2),
  };
  const card = (key: RecapSectionKey): React.ReactNode => {
    const n = matchupNumber(key);
    if (n !== null && n > 2) return isUpcomingSection(key) ? previewCard(n) : resultCard(n);
    if (!isExtraSection(key)) return cards[key];
    return (
      <SectionBox
        section={key}
        onRemove={onRemoveSection ? () => onRemoveSection(key) : undefined}
        included={included(key)}
        onToggleIncluded={() => toggleIncluded(key)}
        header={head(key)}
      >
        <ExtraBody section={key} value={model.extra?.[key] ?? ""} onChange={(v) => onChange({ ...model, extra: { ...model.extra, [key]: v } })} />
      </SectionBox>
    );
  };
  const layout = recapLayout(model);
  const firstUpcoming = layout.find((k) => isUpcomingSection(k));
  const missing = addableSections(layout, maxMatchups);

  return (
    <SectionMode.Provider value={{ room: text, controls }}>
    <div className={text ? "recap-text" : "recap-neon app-theme"}>
      {only === undefined ? <span className="rn-badge">Commi$h</span> : null}
      {only === undefined || only === "title" ? (
        <div data-recap-section="title" className="rn-title-row">
          <TitleField value={model.title} onChange={(v) => set("title", v)} />
          <div className="rn-underline" />
        </div>
      ) : null}

      {/* The sections in the recap's own order (see RecapModel.layout), next week's previews under their heading. */}
      {layout
        .filter((key) => only === undefined || only === key)
        .map((key) => (
          <div key={key} className="contents">
            {key === firstUpcoming && only === undefined ? (
              <>
                <div className="rn-divider" />
                <p data-recap-section="upcoming" className={`${text ? "" : recapDisplayFont.className} rn-upcoming-title`}>
                  {upcomingWeekLabel(model.upcomingWeek)}
                </p>
              </>
            ) : null}
            {card(key)}
          </div>
        ))}

      {/* On a phone, where there's no contents down the side: a section to add. */}
      {onAddSection && missing.length > 0 && (only === undefined || only === "add") ? (
        <label className={`rn-add-section ${room ? "" : "md:hidden"}`}>
          <span>+ Add a section</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onAddSection(e.target.value as RecapSectionKey);
            }}
          >
            <option value="">Choose…</option>
            {/* This week's recap, then next week's previews — each under its own heading. */}
            {[
              { label: "This week's recap", keys: missing.filter((k) => !isUpcomingSection(k)) },
              { label: `Upcoming week ${model.upcomingWeek}`, keys: missing.filter((k) => isUpcomingSection(k)) },
            ].map((group) =>
              group.keys.length > 0 ? (
                <optgroup key={group.label} label={group.label}>
                  {group.keys.map((k) => (
                    <option key={k} value={k}>
                      {sectionName(k, model).emoji} {sectionName(k, model).label}
                    </option>
                  ))}
                </optgroup>
              ) : null
            )}
          </select>
        </label>
      ) : null}
    </div>
    </SectionMode.Provider>
  );
}

export { RECAP_SECTIONS };
