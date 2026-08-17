# BUFF — Fantasy League HQ

A personal dashboard for tracking your Sleeper fantasy football leagues: live
standings, a commissioner weekly-recap generator, and career stats pulled
from every linked season. Ships as a static site, hosted for free on
**GitHub Pages**.

## Features

- **Dashboard** (`/`) — every league you're in, at a glance: your record,
  rank, points, and whether you're the commissioner.
- **League page** (`/league?id=...`) — full standings, this week's
  matchups, and recent waiver/trade activity (player names resolved, not
  raw IDs).
- **Weekly recap generator** (`/recap?id=...`) — for leagues you commish.
  Auto-drafts a markdown recap (top/low scorer, closest game, blowout,
  standings movement, waiver moves) that you can edit and copy straight
  into your league chat. Saved recaps are archived per league
  (`/recap/archive?id=...`).
- **History** (`/history` and `/league/history?id=...`) — walks Sleeper's
  linked-season chain (`previous_league_id`) to reconstruct career stats per
  manager: record, win%, points, championships, and best finish, across
  every year the league has existed.

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
