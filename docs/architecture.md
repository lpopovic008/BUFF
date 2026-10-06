# Architecture

Commi$h is three systems, not one:

1. **The dashboard** — a statically-exported Next.js site, hosted on GitHub
   Pages. Everything except the AI recap button and account sync runs
   entirely in the browser, reading pre-fetched JSON and calling Sleeper's
   public API directly from the client.
2. **The API** (`backend/`) — a small FastAPI service, containerized and
   deployed separately, that exists for exactly one reason the static site
   can't do on its own: calling an LLM with a secret key.
3. **Supabase** — a managed Postgres database plus Auth, used entirely
   client-side (no server of this app's own involved) for optional user
   accounts and cross-device sync. See "Accounts and sync" below.

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  GitHub Pages (static)      │        │  Render (buff-api)            │
│  lpopovic008.github.io/BUFF │        │  buff-api-2bzm.onrender.com    │
│                              │  POST  │                                │
│  Next.js app, client-side ──┼───────►│  FastAPI  ──►  Gemini API      │
│  fetch to Sleeper's API     │  JSON  │  (Docker container)            │
│  directly for everything    │◄───────┼                                │
│  else                       │        │                                │
└─────────────────────────────┘        └──────────────────────────────┘
        ▲                                        ▲
        │ npm run build, on every push           │ docker build + push,
        │ (.github/workflows/deploy.yml)         │ only when backend/**
        │                                        │ changes
        │                                        │ (.github/workflows/backend-ci.yml)
        └────────────── main branch ─────────────┘
```

Two separate CI pipelines, on purpose: a frontend-only commit shouldn't
rebuild a Docker image that didn't change, and a backend-only commit
shouldn't wait on a Next.js build. `backend-ci.yml` is path-filtered to
`backend/**` for exactly this reason.

## Why a separate backend exists at all

The rest of Commi$h works as a static site because nothing else it does needs
a secret. Sleeper's API is public and read-only, so the browser can call it
directly with no server in between — that's most of the app.

The AI recap feature breaks that pattern: it needs an LLM API key, and an
API key baked into a static site's JavaScript is public the instant the
site ships (anyone can read it from the browser's network tab). The
backend's entire reason to exist is to hold that one secret server-side.
Everything else it serves (`/players/values`, `/players/stats`) is really
a bonus — a live-over-HTTP version of data the frontend already has at
build time — added because once a real backend existed, it was worth
learning to build one properly (tests, Docker, Kubernetes, CI/CD) rather
than writing a single-purpose endpoint.

## Request walkthrough: clicking "Generate with AI"

This is the one path that touches every piece of the system end to end.

1. **Browser** — `RecapSectionsEditor.tsx`'s `AiRecapBody` component builds
   the week's facts (matchup scores, high scorer, standings leader) from
   data already computed client-side for the rest of the page — no new
   data fetch, just reshaping what's already there (see
   `buildMatchupLines` in `RecapSectionsEditor.tsx`).
2. **Client → API** — `src/lib/recap-ai.ts` POSTs those facts as JSON to
   `${NEXT_PUBLIC_API_BASE_URL}/recap/generate`. That env var is inlined
   into the static JS at build time (see `deploy.yml`'s `env:` block) —
   there's no runtime config on a static export, so "which backend to
   call" has to be baked in when the site is built.
3. **FastAPI** (`backend/app/routers/recap.py`) — validates the request
   against a Pydantic model (`RecapGenerateRequest`), builds a system
   prompt that constrains the model to the real facts it was given (no
   inventing stats), and calls Gemini.
4. **Gemini** — `gemini-3.5-flash-lite`, chosen for its free-tier quota
   (500 requests/day vs. 20 for the newer `gemini-3.8-flash`) — see the
   model-swap history below. `GEMINI_API_KEY` lives only in Render's
   environment, injected into the container at runtime; it is never in
   git, never sent to the browser.
5. **Response flows back** — Gemini's text → FastAPI wraps it in
   `RecapGenerateResponse` → the browser drops it into the `aiRecap` field
   of the recap model, which the commish can then edit freely like any
   other section.

If `GEMINI_API_KEY` isn't set, step 3 fails fast with a `503` before ever
calling Gemini (`get_gemini_client`'s dependency check) — a FastAPI
`Depends()` rather than a module-level client specifically so
`tests/test_recap.py` can swap in a fake client and test every branch
(missing key, validation failure, empty response) without spending real
API calls or needing a real key in CI.

## Docker

`backend/Dockerfile` builds from the **repo root**, not from inside
`backend/` — the image needs both `backend/app` (the code) and
`src/data/*.json` (the same snapshots the frontend reads at build time),
so the build context has to be one level above `backend/`:

```bash
docker build -f backend/Dockerfile -t buff-api .
```

Notable choices, and why:
- **Dependencies copied and installed before app code.** Docker caches each
  instruction as a layer keyed on its inputs; as long as
  `requirements.txt` hasn't changed, `docker build` reuses the cached
  `pip install` layer instead of re-running it on every code edit.
- **Runs as a non-root user** (`appuser`, uid 1000). Containers run as root
  by default, which is more privilege than a web service ever needs — if a
  dependency ever had an exploitable bug, a non-root process limits what
  it could do to the container's filesystem.
- **`HEALTHCHECK` hits `/health`.** This is the same endpoint Kubernetes'
  readiness/liveness probes call — defined once, reused by both `docker
  run` and the cluster.
- **Data baked into the image, not fetched live.** The container serves
  whatever `src/data/*.json` snapshot was committed when the image was
  built. A real production version would read from a database or object
  store per-request instead; this project stops short of that since
  nothing here actually needs live data freshness at the API layer (the
  scheduled Node scripts already keep the committed JSON current).

## Kubernetes (`backend/k8s/`)

Two manifests, `kind`-tested (see `backend/k8s/README.md` for the exact
verification steps — creating a local cluster, loading the image with
`kind load docker-image`, confirming 2/2 pods ready, and deliberately
deleting a pod to watch the Deployment replace it):

- **`deployment.yaml`** — 2 replicas. Separate readiness and liveness
  probes on purpose: readiness failing pulls a pod out of the Service's
  rotation without restarting it ("not ready for traffic yet"); liveness
  failing gets the container killed and restarted ("this process is stuck
  or broken"). Those are different problems that call for different
  responses, which is why Kubernetes has two probes instead of one.
  Resource `requests` (what the scheduler reserves) vs. `limits` (a hard
  ceiling — CPU throttles past it, memory gets OOM-killed past it) are set
  deliberately low (50m/64Mi requests) since this is a small FastAPI
  service, not a real ceiling for a production workload.
- **`service.yaml`** — a stable `ClusterIP` address in front of whichever
  pods currently match `app: buff-api` and are passing readiness. Pods get
  replaced constantly (crashes, rollouts) and each replacement gets a new
  IP; nothing could reliably call "the API" without this indirection.

This cluster is **local-only** — `kind` has no public IP, and this project
doesn't run a persistent Kubernetes cluster anywhere. The K8s manifests
exist to prove the container is production-shaped (proper probes, resource
limits, self-healing) and to have actually operated a real cluster, not
because Commi$h is deployed on Kubernetes today. The real deploy target is
Render (see below) — a deliberately simpler platform for a project this
size.

## CI/CD

Two independent pipelines:

- **`.github/workflows/deploy.yml`** — runs on every push to `main`.
  Builds the Next.js static export and publishes it to GitHub Pages. No
  path filter, since a Next.js build is cheap and there's only one deploy
  target.
- **`.github/workflows/backend-ci.yml`** — path-filtered to `backend/**`.
  Two jobs, `build-and-push needs: test`, so a red test suite blocks a new
  image from ever being published. `build-and-push` also only runs on
  pushes to `main`, not on PRs — a fork PR can't publish an image under
  this project's name just by opening one. Pushes to
  `ghcr.io/lpopovic008/buff-api`, tagged both `:latest` and `:<commit-sha>`
  (the SHA tag makes any specific build reproducible/rollback-able, not
  just "whatever's newest"), authenticated with the auto-minted
  `GITHUB_TOKEN` — no separately managed registry credential to rotate or
  leak.

Neither pipeline deploys the backend anywhere by itself — CI's job ends at
"a tested, versioned image exists in a registry." Getting that image
running somewhere public (Render) is a manual step, done once, not
re-triggered by CI. **Render does not auto-redeploy on a new `:latest`
push** — the free tier requires a manual "Deploy latest image" click on
Render's dashboard after `backend-ci.yml` finishes, which is a real
operational gap for a from-scratch project at this scale (a paid Render
plan, or a deploy-hook call added to `backend-ci.yml`, would close it).

## The Gemini model swap

Worth documenting because it's a real lesson, not just a config change:
the backend originally called the Claude API, then switched to Google's
Gemini API for one concrete reason — Gemini has a genuinely free tier
(no card, meaningful daily quota) where Anthropic's API is pay-per-token
with no ongoing free tier. For a feature that generates one short
paragraph once a week, that tradeoff was clearly worth it.

Getting a live, working Gemini call took three iterations, each diagnosed
from a real error returned by Google's own API rather than guessed at:

1. **"The bound service account is deleted or disabled."** — the first
   API key was auto-attached to a Google Cloud project whose service
   account was disabled. Fixed by generating a new key in a fresh Cloud
   project via AI Studio.
2. **"This model … is no longer available to new users."** —
   `gemini-2.5-flash` had been deprecated; Google's error named the
   replacement (`gemini-3.8-flash`) directly.
3. **"This model is currently experiencing high demand."** —
   `gemini-3.8-flash` had shipped days earlier and was capacity-constrained
   on the free tier. Switched to `gemini-3.5-flash-lite`: an established,
   lighter model with a much larger free quota (500 requests/day vs. 20),
   which is also just a better fit for a once-a-week feature.

Each of these was confirmed with a real HTTP request against the live
deployed service (via a temporary GitHub Actions workflow that curled the
live Render URL, since this development environment's own network egress
is restricted to code hosts and can't reach arbitrary APIs directly) —
never assumed fixed from reading the code alone.

## Accounts and sync (Supabase)

The dashboard has always worked with zero account — a Sleeper username is
enough, and everything else (settings, the recap archive, bowl picks,
draft targets) lives in that one browser's `localStorage`
(`src/lib/localStore.ts`). That's still true today; an account is
**optional**, and turns on one thing: the same data synced across every
device signed into it.

This used to be Google Drive sync (`google-drive-sync.ts`, since removed)
— a hidden file in the signed-in Google account's Drive `appDataFolder`,
pushed to and pulled from with a last-write-wins reconciliation. It was
replaced outright with real accounts rather than run alongside them, for
the sake of the app and its users, not just to add a resume line:
hand-rolled auth is a real place a solo project's first attempt puts real
people's credentials at risk — password hashing, session/JWT handling,
and the OAuth exchange are all things Supabase gets right by default,
not things this app re-derives.

**Design**: a single `app_data` table (`supabase/schema.sql`), one `jsonb`
row per user, holding exactly what `localStore.ts`'s
`exportAllData()`/`importAllData()` already produce and consume — the
same shape Drive sync kept in its own file, just in Postgres instead, with
Row Level Security scoping every read/write to `auth.uid() = user_id`. Not
normalized into relational tables: nothing today needs a cross-user or
cross-league query, and a single blob reuses the export/import logic
verbatim instead of re-deriving a schema that has to stay in sync with
`AppConfig`'s TypeScript shape by hand.

`src/lib/supabase-sync.ts` is a near-direct port of the old Drive sync's
`decideSyncAction`/`reconcile` — same last-write-wins tradeoff (this is
for one person's own devices, never two people editing at once), same
three-way decision (pull the remote copy down / push the local copy up /
do nothing), just comparing against a Postgres row's `updated_at` instead
of a Drive file's timestamp. `src/components/AutoSupabaseSync.tsx`
(mounted in `layout.tsx`) wires it to Supabase's auth state: sign-in
reconciles once and starts auto-pushing every local write (debounced);
sign-out stops.

Critically, **`localStore.ts`'s synchronous read/write API never
changed** — every page that calls `getConfig`/`saveRecap`/`getDraftTargets`/
etc. does so exactly as it did before accounts existed. `localStorage` is
synchronous; Postgres isn't. Rather than thread async loading states
through every consumer (`league`, `values`, `warroom`, `recap`,
`DraftRoom`, Settings, the dashboard all read `AppConfig` via one shared
hook, `useConfig`), `localStorage` stays the always-on, synchronous source
of truth, and Supabase sync runs as a parallel layer underneath it — the
same shape Drive sync already had, just swapped for a real database.

Sign-in supports email/password and Google OAuth (via Supabase's own
`signInWithOAuth`, a standard authorization-code+PKCE flow through
Supabase's callback — unrelated to the Google Identity Services token
flow `google-auth.ts` uses for the separate Save-to-Doc feature; the two
share no code and don't conflict, just the same OAuth provider on Google's
side).

## Live data: one clock, two free sources

Live scoring comes straight from the browser, with no server in between:
Sleeper's public API for fantasy points (`/league/{id}/matchups/{week}`) and
ESPN's public scoreboard and game-summary endpoints for game state and
play-by-play. Both are CORS-open and need no key. Paid official feeds
(Genius Sports, Sportradar) are faster but are enterprise contracts, so
they're out of reach here.

Everything live reloads on one shared clock (`src/lib/live-clock.ts`,
`useLiveTick`), so the ticker, lineups and Red Zone move together and each
source is asked once per tick:

| ESPN's scoreboard says | Tick every |
|---|---|
| A game is being played | 15s |
| A kickoff is within 30 min (or running late) | 60s |
| Nothing on | 5 min, waking for the next kickoff window |

A hidden tab doesn't tick, and catches up as soon as it's shown. When ESPN's
score changes, the next tick comes 5s later, since Sleeper's points for that
play are usually right behind. Live callers read matchups with a 5s cache
(`LIVE_TTL_SECONDS`), so every component on one tick shares a request and the
next tick always asks again.

**Live time blocks** (`useLivePlayerLines`, `liveGameRows` in
`lib/my-starters.ts`): while a kickoff window is being played, each of its
games in the starters list shows everyone worth watching, not just your
starters: the starters you're facing, plus anyone in the game who has scored
or lost points or is projected for 6+. Rows are ordered by points, then
projection. Points are green for your starters, red for the ones you face.
Everyone else's PPR points and projections come from Sleeper's NFL-wide
`/stats` and `/projections` endpoints (undocumented, the same ones the
Sleeper app uses). Stats are re-read each tick; projections are cached
for 5 minutes. Neither is fetched unless a block is live.

**Red Zone points ahead of Sleeper** (`useLivePlayPoints`,
`lib/live-play-points.ts`): ESPN's plays usually land before Sleeper's
matchup points move. So each number in the starters list is Sleeper's, plus
the PPR points from every play the Red Zone has seen since that number last
changed. Once Sleeper's number moves, it's taken to include those plays and
stands alone again. A play stops counting after 5 minutes without Sleeper
moving: by then Sleeper either already had it or scores it differently.
Plays already there when a game's play-by-play first loads never count.
Each pending amount is tagged with the Sleeper number it was worked out
against, so it's never added on top of a newer one. When a number changes,
`StartersByGame` animates it: the difference flies into the number, the
number counts up, and the row flashes in its side's color. About a second
later the player slides to their new place in the game; the rows wait until
then before reordering.
This covers your starters and the ones you face (their games' play-by-play
is followed), plus anyone else listed in those games.

**Red Zone** (`useRedZoneFeed`, `RedZone.tsx`, `lib/play-by-play.ts`): by
default ("Team") the plays your starters are in. "All" shows every
play of every game that's started, and only then fetches the games none of
your starters are in. Each play shows the down and distance it was snapped on. A game's play-by-play comes from ESPN's summary
endpoint (about 600 KB raw, so it isn't fetched on every tick). A finished
game is fetched once. A game in progress is re-fetched when the scoreboard's
latest play involves one of your starters or puts points up, and otherwise
at most once a minute. In between, the scoreboard's latest play is shown on
its own. ESPN's plays carry no player ids, only shorthand like
"A.Rodgers pass short left to D.Washington", so starters are matched by that
shorthand, only on the team with the ball, ignoring tacklers. A team defense
is matched on the other side's sacks and takeaways. The red-zone alerts come
from the scoreboard's live situation (possession, `isRedZone`).

Each row also shows standard PPR points for the play, plus the player's
total for the game through that play (`lib/play-points.ts`). These use
Sleeper's default PPR scoring, applied by reading the play's text for each
role: passer, receiver, runner, kicker, two-point try, lost fumble, and D/ST
sacks and takeaways. They're an estimate from ESPN's text, so a league's own
scoring and Sleeper's official totals can differ. Points allowed by a defense
and return touchdowns aren't counted per play.

## Where things run

| Piece | Where | Trigger |
|---|---|---|
| Static dashboard | GitHub Pages | Push to `main` (`deploy.yml`) |
| FastAPI image | GHCR (`ghcr.io/lpopovic008/buff-api`) | Push to `main` touching `backend/**` (`backend-ci.yml`) |
| FastAPI container | Render (`buff-api-2bzm.onrender.com`) | Manual redeploy, pulling `:latest` from GHCR |
| Player values/stats data | Committed JSON in `src/data/` | Scheduled Node scripts, separate from this backend |
| Accounts + sync data | Supabase (Postgres + Auth) | Client-side only — no CI/CD step involved; schema changes are applied by hand via `supabase/schema.sql` in the SQL Editor |

## What's deliberately out of scope

- **No database behind the API.** It reads static JSON snapshots; there's
  no persistent state on that side. The database that does exist
  (Supabase) is used directly from the browser for accounts/sync, not
  through this backend.
- **No ConfigMap/Secret in `backend/k8s/`.** Added a real Secret only once
  there was a real value to put in one (`GEMINI_API_KEY`) — and by the
  time that existed, Render (not the local `kind` cluster) was the actual
  deploy target, so the Secret lives in Render's dashboard instead.
- **No auto-redeploy from GHCR to Render.** A known gap (see CI/CD above),
  left as a manual step rather than solved with a paid plan or a webhook
  this project doesn't otherwise need.
