# BUFF — Fantasy League HQ

A personal dashboard for tracking your Sleeper fantasy football leagues: live
standings, a commissioner weekly-recap generator, and career stats pulled
from every linked season. Ships as a static site, hosted for free on
**GitHub Pages**.

## Features

- **Dashboard** (`/`) — every league you're in, at a glance: your record,
  rank, points, and this week's matchup — team names and score left vs. right,
  and the top 3 players on each side by KTC trade value, faces lined up
  across from each other (Sleeper's player-photo CDN, same convention as its
  avatar CDN — falls back to a plain circle for players without a real
  photo). Re-polls Sleeper's matchups endpoint every 45s while the tab is
  open, so the score updates the same way Sleeper's own site does during
  games — no separate "projected points" field, since Sleeper doesn't expose
  projections through its public API the way it does live scoring, and this
  app only builds on endpoints that are actually documented. During the NFL
  preseason there's no real fantasy schedule yet, so this previews regular
  season week 1 rather than misreading the preseason's own week counter as a
  fantasy week.
- **League page** (`/league?id=...`) — above everything else, a Sleeper-style
  matchup view: your full starting lineup against your opponent's, slot by
  slot (QB, RB, FLEX, ...), with live points — swipe or use the arrows to
  page through every other matchup that week. Below that, standings and
  recent waiver/trade activity (player names resolved, not raw IDs). Every
  team name throughout the app (standings, matchups, the dashboard) links to
  that team's full roster with KTC trade values for every player
  (`/team?league=...&roster=...`).
- **Weekly recap generator** (`/recap?id=...`) — for leagues you commish. One
  "Write recap" button, no week to pick: it opens to whichever write-up should
  be open right now — the free-write **Preseason** entry before Week 1, then
  each week's recap once the season starts, holding on the just-finished week
  through Tuesday night (so there's still a recap to write) before rolling to
  the next week at Wednesday 12am. Commissioner leagues get a fixed house-style
  template — title, who won last week's marquee matchup(s), a highest-scoring-
  team callout naming the two teammates who led the scoring, the commission
  list, a full scoreboard, running money standings, and a preview of next
  week's marquee matchup(s) — that's always fully present, mechanical parts
  auto-computed and free-write "`<Detail>`" lines left for commentary. Below
  the write-up, name a **Bowl of the Week**/**Honorable Bowl of the Week** for
  the *upcoming* week and pick one player from each side (searchable by team,
  just so the app knows who's playing) — save it and this week's preview fills
  in with the two teams' season PF/PA and league rank; the following week, the
  same pick resolves into the result: who actually won, pulled straight from
  Sleeper. Nothing picked yet? Every field still shows its bracket placeholder
  (`[team] won the [Week 1 Bowl Game Name]`) so the shape of the write-up is
  always there. Saving a pick regenerates the mechanical parts of the current
  draft in place, keeping every `<Detail>` line exactly as written. **Copy
  formatted** copies both a plain-text and a rich-text (HTML) version to the
  clipboard in one go — paste targets that keep formatting (Messages/Notes/Mail
  on Mac, most iOS apps) render bold section headers/dollar amounts, an
  underlined high-scorer line, and italicized commentary, instead of one flat
  block of plain text; anything else just gets the plain fallback. Leagues
  without a commissioner profile get a plain generic markdown recap instead —
  no bowl-game concept. Saved recaps are archived per league
  (`/recap/archive?id=...`).
- **History** (`/league/history?id=...`, one click from inside a league) — walks Sleeper's
  linked-season chain (`previous_league_id`) to reconstruct career stats per
  manager: record, win%, points, championships, and best finish, across
  every year the league has existed. Each season is its own collapsible
  section (most recent open by default) with that year's standings, and —
  for leagues with a payout profile — a cumulative money-paid-out chart
  mirroring the running totals in the source spreadsheet, plus a
  win/high-score/earnings breakdown for that year specifically.
- **Money tracking** — for leagues with a commissioner profile (see below),
  the league page adds pot accounting, a season earnings leaderboard, a
  week-by-week payout grid, and a record/high-score table. It replaces
  keeping this by hand in a spreadsheet.

## Commissioner leagues (payout tracking)

`src/lib/league-config.ts` holds a profile per league you commish: the payout
rules and a roster-id → real-name map. Epstein Island is configured as:

| Rule | Value |
| --- | --- |
| Buy-in | $100 per team ($1,000 pot at 10 teams) |
| Per win | $10 |
| Weekly high score | $20, **instead of** the win — never both |
| Weeks paying commission | 1–14 (playoffs pay nothing) |
| Final placements | 1st $85, 2nd $45, 3rd $30 |

That balances exactly: 14 weeks × $60 = $840, plus $160 to the top three =
$1,000. The app checks this every load and shows a warning banner if a rule
change makes the money stop adding up.

Two details worth knowing:

- **`highScoreStacks`** is `false`, matching how the rules were described and
  what the source spreadsheet shows (no cell is ever $30). It only changes
  anything in a week where the high scorer *loses*, which hasn't happened yet —
  flip it to `true` if the intent is $10 + $10.
- Profiles are matched on **league name substring**, not league ID, since
  Sleeper mints a new ID every season. A profile matched on the current season
  also covers earlier seasons under their old names.

Manager names are keyed by **roster ID** rather than team name, because teams
in this league get renamed most weeks.

## Weekly automation

`.github/workflows/weekly-recap.yml` runs Tuesdays at 15:00 UTC (after Monday
Night Football settles) and on demand. It runs `scripts/weekly-recap.ts`, which
discovers your commissioner leagues from the baked-in username, finds the most
recent week that actually has scores, generates the recap plus a money snapshot,
and commits it to `recaps/<league>-<season>/week-NN.md`.

It never overwrites a file that already exists, so once you replace a generated
draft with your real write-up, the cron leaves it alone. This gives you a
versioned archive in git that survives clearing browser data.

Run it yourself with `npx tsx scripts/weekly-recap.ts --dry-run` to preview.

## Tests

`npm test` runs the payout engine against the real 2025 Epstein Island season
(every score transcribed from the spreadsheet) and asserts the output matches
the recorded totals — $130 Colin, $100 Andres/Karan/Matt Bj, and so on, $840
across 14 weeks at exactly $60 a week.

Two discrepancies in the hand-kept 2025 records surfaced while writing those
tests, both documented inline in `src/lib/payouts.test.ts`:

- The week 6 write-up credited Karan $20 when the high scorer was Owen at
  173.10. That $10 overstatement rode along in the doc's standings from week 6
  through week 12 before self-correcting by week 13. The spreadsheet is correct.
- The week 14 seeding list reads "FootballSage07 (7-7)", but its ten records
  total 71 wins across 70 games. By the scores Sage finished 6-8.

## How it's hosted

This is a fully static Next.js export (`output: "export"`) — there's no
server, no API routes, and no build-time secrets. Everything runs **in your
browser**:

- Every request to Sleeper's public API (`api.sleeper.app`) is made
  client-side. No API key or login needed — it's read-only and keyed off
  your Sleeper username.
- Your settings (linked username, tracked leagues, commish flags) and the
  recap archive are saved in this **browser's `localStorage`** — there's no
  backend to write to. That means they're per-browser, not synced across
  devices. Use **Settings → Export backup** to save a JSON file, and
  **Import backup** to bring it into another browser/device.

### Deploying

A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and
publishes the site to GitHub Pages automatically on every push to `main`.
One-time setup after merging this branch:

1. In the repo, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or re-run the workflow from the **Actions** tab) — the
   site will be published at `https://<your-username>.github.io/BUFF/`.

### Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — local dev runs at the
site root (no `/BUFF` prefix; that's only added for the GitHub Pages build).

## Player values

**Values** in the nav replaces the old top-level **History** button — per-league
history is one click from inside each league, so a separate nav entry was
redundant.

Above everything else, one card per league you're in with your own full
roster and every player's KTC value (`/team?league=...&roster=...` is the
same view, one click from any team name elsewhere in the app) — this is
where "what are my assets actually worth" lives, without digging through the
full player list below to find your own guys.

Below that, the full keep/trade/cut trade values from KeepTradeCut, with a
Dynasty/Fantasy (redraft) toggle, a 1QB/Superflex toggle, a Standard/TE Premium
toggle, a multi-select position filter (click a position pill to drop it from
the list, click again to bring it back — matches KTC's own filter UI), and
search. All four format combinations (1QB standard, 1QB TEP, Superflex
standard, Superflex TEP) come from the same KTC fetch — each player record
already carries all of them, so there's no extra request per toggle, just a
different field read client-side. KeepTradeCut has no official public API, so
`scripts/fetch-player-values.ts` scrapes it
**server-side in GitHub Actions** (`.github/workflows/player-values.yml`, daily
at 13:00 UTC) rather than from the browser — that sidesteps CORS entirely
(a plain server-to-server fetch isn't subject to it, whereas a browser fetch
would be at the mercy of whatever cross-origin policy KTC happens to send) and
means the page never depends on KTC being reachable from the visitor's
network. The result is committed to `src/data/player-values.json` and
imported directly into the page at build time — no runtime fetch, no CORS
surface, nothing to break for a viewer.

Because KTC's page structure isn't documented, the fetch script tries a few
scraping strategies in order (a known `playersArray` literal, a Next.js
`__NEXT_DATA__` blob, then a generic "find an array that looks like player
records" walk) and, on failure, leaves the existing file untouched rather than
committing anything — see the script's comments for the fallback chain.

## Getting started

Nothing to set up: the Sleeper username is baked into the build
(`DEFAULT_SLEEPER_USERNAME` in `src/lib/app-defaults.ts`), so opening the site
on any device auto-discovers that user's leagues on first load and flags the
ones they commish via Sleeper's `is_owner`.

Note this is the *username*, not league IDs — deliberately. Sleeper mints a new
`league_id` for every league every season (years are chained via
`previous_league_id`), so hard-coded league IDs would go stale each August,
whereas a username re-discovers the current season automatically.

**Settings** is still there for the rest: re-run discovery to pick up a new
season or a newly joined league, override a commish flag Sleeper got wrong,
drop a league you don't want on the dashboard, or export/import your data.
Setting `DEFAULT_SLEEPER_USERNAME` back to `""` disables auto-setup entirely
and makes Settings the only entry point.

## Notes & limitations

- **CORS**: this relies on Sleeper's API allowing cross-origin browser
  requests, which is how it's designed to be used by third-party apps. If
  that ever changes, client-side fetches would need to move behind a proxy
  (which would mean leaving pure static hosting).
- **Standings tiebreakers** are approximated as win% then points-for, which
  matches most leagues but may not exactly match custom tiebreaker settings
  (e.g. median scoring) in yours.
- **Championship / runner-up** are read from the playoff bracket's
  championship match. Everyone else's rank reflects regular-season record,
  not final playoff placement.
- **Co-owned teams**: only a roster's primary owner is tracked for career
  stats; co-owners aren't split out separately.
- If Sleeper's API is briefly unreachable (common during Sunday live
  scoring spikes), pages show a friendly retry message instead of crashing.

## Tech

Next.js (App Router, static export) + TypeScript + Tailwind. No database,
no server — all data fetching and persistence happens in the browser.
