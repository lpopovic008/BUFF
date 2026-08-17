# BUFF — Fantasy League HQ

A personal dashboard for tracking your Sleeper fantasy football leagues: live
standings, a commissioner weekly-recap generator, and career stats pulled
from every linked season.

## Features

- **Dashboard** (`/`) — every league you're in, at a glance: your record,
  rank, points, and whether you're the commissioner.
- **League page** (`/leagues/[id]`) — full standings, this week's matchups,
  and recent waiver/trade activity (player names resolved, not raw IDs).
- **Weekly recap generator** (`/leagues/[id]/recap`) — for leagues you
  commish. Auto-drafts a markdown recap (top/low scorer, closest game,
  blowout, standings movement, waiver moves) that you can edit and copy
  straight into your league chat. Saved recaps are archived per league
  (`/leagues/[id]/recaps`) so you have a running record of every week you've
  sent out.
- **History** (`/history` and `/leagues/[id]/history`) — walks Sleeper's
  linked-season chain (`previous_league_id`) to reconstruct career stats per
  manager: record, win%, points, championships, and best finish, across
  every year the league has existed.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), go to **Settings**,
enter your Sleeper username and a season (e.g. `2026`), and click **Discover
leagues**. That pulls in every league you're in for that season and
auto-detects which ones you commish (Sleeper's `is_owner` flag) — you can
override that per league from the same page.

No Sleeper API key or login is required — the public Sleeper API is
read-only and keyed off your username, so this app never writes anything
back to Sleeper.

## How data is stored

App data (your linked username, which leagues you track, and the recap
archive) lives as JSON files under `data/`, which is git-ignored. There's no
database — this keeps the project dependency-free and easy to self-host, but
it does mean the app needs a **persistent, writable filesystem**:

- Works great: running locally, a Docker container, a small VPS/home
  server, or any host that keeps the same disk between requests.
- Won't persist writes: default serverless deployments (e.g. Vercel without
  a mounted volume) reset the filesystem between invocations. If you deploy
  there, swap `src/lib/store.ts` for a real datastore (Vercel KV/Postgres,
  SQLite on a volume, etc.) — the rest of the app doesn't need to change.

Standings, matchups, and history are always fetched live from Sleeper (with
short-lived caching), so none of that depends on local storage — only your
settings and saved recaps do.

## Notes & limitations

- **Standings tiebreakers** are approximated as win% then points-for, which
  matches most leagues but may not exactly match custom tiebreaker settings
  (e.g. median scoring) in yours.
- **Championship / runner-up** are read from the playoff bracket's
  championship match. Everyone else's rank reflects regular-season record,
  not final playoff placement — Sleeper's public API doesn't expose a full
  placement bracket in a form worth over-fitting to.
- **Co-owned teams**: only a roster's primary owner is tracked for career
  stats; co-owners aren't split out separately.
- If Sleeper's API is briefly unreachable (common during Sunday live
  scoring spikes), pages show a friendly retry screen instead of crashing.

## Tech

Next.js (App Router) + TypeScript + Tailwind. All data fetching happens
server-side directly against `https://api.sleeper.app/v1`.
