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
enough, and everything else (settings, saved recaps, recap layouts, bowl picks,
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
through every consumer (`league`, `values`, `recap`,
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

**Starters by game** (`startersListGames`, `liveGameRows` in
`lib/my-starters.ts`, `useLivePlayerLines`): every game of the week is
listed, each in a box of its own: the away team's logo and record (as of
that game, from ESPN's scoreboard) and its score — right over the players'
+/- column — with the game's status (or the kickoff time before it starts)
in a column on the far right as wide as the players' points; then the home
team's line. While the clock runs the quarter is on the top line, a hair
bigger, and the clock on the home team's line under it ("2Q" over "12:43",
from `gameClock`); otherwise it's all on the top line ("Half", "End 2Q",
"Final"). Leagues hidden in Settings are left out of the whole app
(`visibleLeagues`): the ticker, the starters, the map, the Red Zone, the
header's record and your teams on the Values page.
Shut, a game lists just its teams. Tapping the matchup (the teams' lines —
a player's line doesn't toggle) steps through its views, set apart below the
teams: your starters in it, then yours and the ones you're facing, then
everyone worth watching (`liveGameRows`: anyone in the game who has scored or
lost points or is projected for 6+), then shut again — skipping any view that
would list no one new. A bar at the top of the list — Team, VS, ALL — sets every box to one
of those views at once; tapping the lit one again shuts them all. The Red
Zone has Team / VS / All buttons of its own, not tied to this bar. Every line
has the same columns, so they stay lined up whatever the game's state: the
time of the player's latest play that moved their points (no AM/PM, to keep
it narrow) and its +/- (only while the game's on, from `useLastActions` /
`lastActions`; the time's space is kept otherwise), their name with their
position (small, in its color) right after it, the logo of every league
they're started in — the first tracked league on the right, the rest
building leftward, in the +/-'s place when the game isn't on; if they'd reach
the position, just the first shows, with "+N" for the rest — and their total
(their projection before kickoff). A shown line is where a changed total
animates (see below).

Tapping a player's line puts their fantasy points over time up in the map's
place — open, with no frame, like the map — and up to four players' can be
up at once: two stack one over the other, three or four take a corner each,
and once there's more than one each is pared back to the player's name,
their total, the points axis, the rules, the pace line and the shading (a
fifth tapped pushes out the first; each has its own ×). One alone is the
full graph (`PointsGraph`; `pointsTimeline`, `periodStarts` and `pacePieces` in
`lib/live-play-points.ts`): a black (white, in the dark) step line by time
of day, rising at each play that moved their points, with the quarters
ruled in. Each play is scored under the player's league's own rules
(`scoring_settings`; on the dashboard, the first league they're started in,
and PPR for anyone who isn't yours or an opponent's): `scoreStats` in
`lib/play-points.ts` scores their running stat line after every play, so
first downs, long-play and yardage bonuses, a TE premium and the like land
on the play that earned them, and a defense's points-allowed bracket moves
as a step of its own whenever the other side scores. Their projection
is a dashed pace line, 0 at kickoff to the full projection at the final
whistle, and the ground under their line is green wherever they're at or
ahead of it, red wherever they're behind. Halftime (`halftimeSpan`: the 2nd quarter's last play to the 3rd's first)
is squeezed into a thin column of etched lines, the rest of the clock
running evenly either side of it. The time axis shows just kickoff, each
quarter's start and the end ("~" while that's an estimate — live, it runs on
to about when the game should end), with the minutes between each pair
halfway along where there's room — halftime left out, so the 2nd quarter's
figure is how long it really took, and the 3rd quarter's start stands for
halftime's end. In the full graph, up in its top-left corner, two figures
give how much of the game so far they've been on pace (green) and behind it
(red), halftime aside. Live, the line runs to now and grows
as plays come in, sharing the Red Zone's play-by-play fetches. Should Sleeper's
total still differ from the plays' (stats no play carries, such as yards
allowed) a dashed rise at the end makes up the difference, so the line
ends on their row's number, which is lit on a plate in the corner. Dragging
or hovering puts a dotted line under the finger, with the time there, and
it stays where it's lifted. There's no description under the graph: while
the cursor is up, the Red Zone shows the last play by then (`spotlight`) —
on a phone its box scrolls to the play's row and lights it up; from tablet
width up, where the plays run on down the map's column under the graph, the
play is pinned in the Red Zone's title bar, over the title, the column
moved only as far as it takes to bring the bar into sight. Tapping the graph again, or
anywhere off it, takes the cursor away, and the Red Zone (and the column)
goes back to exactly where it was. The left and right arrow keys step
the cursor back and forth a play at a time. × (or tapping their line again)
takes a graph down; Escape takes them all down and brings the map back. The map stays mounted underneath, just hidden, so its view isn't
lost. On a phone, the page scrolls up to the graph.

Each team's name in the league page's matchups has its projected total
on a line already there, right over the score (the rank and record's on a phone) (`liveProjection`): Sleeper's pregame projection for each starter,
scored under the league's rules, swapped for the starter's actual points
once their game is final — so it moves only as games finish, never play by
play.

The league page always has a graph under the lineups and above the payout
table, three quarters of the screen tall on a phone (`75svh`) and up to 70%
of it, at most 40rem, from tablet width up (`MatchupGraph`; `lib/matchup-timeline.ts`): the matchup being looked
at (opened on a phone, picked from the list from tablet width up — yours
until another is), both teams' totals over the week, nothing to tap. Each
team's line is every starter's points added up play by play under the
league's rules (`teamTimeline`), whatever a starter's Sleeper total has that
no play accounts for counted at the end of their game, so the lines end on
the teams' totals. Time runs through the week's game windows
(`gameWindows`: the starters' games, overlaps merged), set back to back
with the time between them cut out. The background is split into the
week's kickoff time blocks (Thursday night, Sunday noon, Sunday
afternoon... — `kickoffBlockLabel`, as the starters list groups them), each
a band from its first kickoff to the next, with a line where each begins,
each named along the bottom ("Sun 1:00"); should any two names crowd each other, every name goes
to two lines, the day over the time. Yours is black (white in the
dark), theirs grey; the ground between the lines is green while you lead
and red while you trail (`leadPieces`), with how much of the week so far
you've led and trailed in the corner, and each team's projected pace a line
of round dots, so it never reads as a score line (`teamPace`: each starter's
projection earned evenly over their game). The cursor, the arrow keys and
the description below work as the player graph's used to — while the cursor is
on the lines, the totals by the team names up top show each team's total at
that moment (a dot marks where it crosses each line) — the description naming the player and its +/- green for your
points, red for theirs.

A game's box swipes left (touch, mouse drag, or a trackpad's sideways
scroll) to show an eye button that takes that one game off the map, or puts
it back; its border goes dashed while it's off. Like the block headers'
choices, it holds for the week shown. The teams on their bye come last,
under their own BYE header below even the finished blocks, side by side in
one row, a quarter of it each (a week has at most four), plus a "No team"
box for starters without an NFL team (wrapping onto a second row). Tapping
one steps it through the views like a game's matchup; the players it then
lists (yours, and the ones you face) go in a box under the whole row.

Once a game kicks off, rows are ordered by points, then
projection; before kickoff, by projection alone. Before kickoff each row
shows its projection in faint italics with one decimal, so it reads as a
guess rather than a score. The projections take their
side's color too (green, red). Your starters' and opponents' projections are
scored under the league they're started in; everyone else's are PPR. Points
are green for your starters, red for the ones you face. Projections come
from Sleeper's NFL-wide `/projections` (cached 5 minutes) and everyone
else's points from `/stats` (undocumented, the same endpoints the Sleeper
app uses). Stats are fetched only once a game this week has started, and
then re-read each tick.

**Header** (`NavBar.tsx`): the NFL week (on pages with their own week, an
underlined button that opens the week picker). The countdown to the week's
next kickoff (`KickoffCountdown`) sits on the dashboard's map instead, in the
middle of the open space over the land and its tags as the map opens
(`landTopShare`), taking no room of its own — gone once the week's last game
has kicked off. On a phone the page runs edge to
edge (`viewport-fit=cover`) and the header pads itself down by the safe
area, so its background fills the strip around the camera; the browser's
theme color (the status bar's) is set to the page's background in the theme
in use, by the inline theme script and again on every theme change.

**League ticker** (`LeagueTicker.tsx`): each league's matchup this week
under the header. The winner's whole row — rank, name, record, streak and
score, one unbroken plate (the row spans the box's two columns as a
subgrid) — is lit like a map tag once the week is official (`lastFinishedWeek`); with "as it stands" on,
whoever leads right now is lit instead. Nobody is lit while the score is
level.

**The Red Zone's title bar** (the title, its Team/VS/All buttons and any
game in the red zone now) sits at the bottom of its box — from tablet width
up, sticking to the bottom of the map's column as the plays scroll by above
it. **On a phone** the Red Zone sits under the map, above the starters, as a box
three rows tall that scrolls on its own; double-tapping its title bar fits
the box to the screen (the card's top under the header and ticker, its
bottom at the screen's), and double-tapping again takes it back to three rows.

**Red Zone points ahead of Sleeper** (`useLivePlayPoints`,
`lib/live-play-points.ts`): ESPN's plays usually land before Sleeper's
matchup points move. So each number in the starters list is Sleeper's, plus
the PPR points from every play the Red Zone has seen since that number last
changed. Once Sleeper's number moves, it's taken to include those plays and
stands alone again. A play stops counting after 5 minutes without Sleeper
moving: by then Sleeper either already had it or scores it differently.
Plays already there when a game's play-by-play first loads never count.
Each pending amount is tagged with the Sleeper number it was worked out
against, so it's never added on top of a newer one. On desktop, a changed number animates (`GameRows.tsx`).
Nothing moves across the screen: everything that deserves attention is lit
in turn on the HUD's tag plate. First the play: its row in the Red Zone is
outlined, and the player's name there and the +/- it earned are lit, along
with the player's name in the list. Then the +/- is applied: it blinks on,
lit, beside the player's total. Then the total counts up, lit as it goes.
When the count is done the lights go out and a scan line sweeps the row in
its side's color. The Red Zone tags each +/- with the player's Sleeper id, or
their ESPN shorthand and team, so the list can find it, and the Red Zone's
pieces are lit by a `data-lit` attribute (styled in `globals.css`). In a live
game the rows stay ordered by the total as shown, so the player climbs one
place each time the count passes someone, and each player passed slides
down one. With no recent Red Zone row on screen, it starts at the +/- beside
the total. It's purely for the look, so it takes its time: every step runs at
2.5x a brisk pace (`PACE` in `GameRows.tsx`), about 1s for the play, 1s for
the +/-, then at least 1.1s of counting and 0.85s per player passed. Tapping
a play in the Red Zone replays it (`replayRedZonePlay`): each player it
scored for has their total rewound by the play's points, and the same lights,
count and climb carry it back. Phones, and viewers who ask for reduced
motion, get the new numbers and order with no animation.
This covers your starters and the ones you face (their games' play-by-play
is followed), plus anyone else listed in those games.

Opening a game types the added players' lines in just as a time block's
lines do when it's switched back on — all together, a character at a time at
the same speed — while the box slides to its new height. Closing it deletes
them again like a backspace, then the box slides shut around your own players
(`GameBox` in `StartersByGame.tsx`).

**Red Zone** (`useRedZoneFeed`, `RedZone.tsx`, `lib/play-by-play.ts`): by
default ("All") every play of every game that's started; "Team" the plays
your starters are in; "VS" adds the plays the starters you're facing are
in. Games none of your starters are in are only fetched under "All". The plays run on down the page (or, side by side, the
map's column) under a title that sticks at the top as they pass beneath it, so
one swipe carries straight on from the page into the plays; 30 more load as
you scroll into the last screen of them (no "Show more"). On a phone while a
game is live it's a short box three plays tall under the map instead.

Each play reads: the time of day it happened and the matchup's logos, with
the snap across from them — the down and distance, a little diagram of
where on the field the ball was (a green line with ticks at the goal lines
and the 50, and a slim triangle at the ball pointing the way the offense is
going, its yard line above it; `FieldSpot`), and the quarter and clock.
ESPN doesn't say which end of the stadium a team is attacking — teams switch
ends every quarter — so the diagram keeps one layout all game: the home
team's goal line on the left, the home team driving right, the visitors left.
A scoring play, turnover, red-zone snap or long gain has a colored strip down
the row's left. Under the top line, a line for each person in it
(`lib/play-lines.ts`), then ESPN's description, led by the logo of the team
with the ball. A line is a photo, position and name, the leagues you
start them in, their game as it stood after that play (`statLine`), and
what the play earned them with their total through it. The stats are read
from each play's text (`statsForPlay` in `lib/play-points.ts`, which the PPR
points are scored from too) and added up play by play, so an older play shows
the game as it was then, not as it is now; a defense's points allowed come
from the score ESPN gives with each play. ESPN's
shorthand ("J.Allen") is matched to your starters first, then to Sleeper's
player list for the two teams (`loadTeamPlayers`, `useTeamPlayers`) — the
offense first, then the defense for someone like an interceptor, who isn't
scored. A name that matches no one keeps ESPN's shorthand and no photo.
A game's play-by-play comes from ESPN's summary
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

## "As it stands"

Sleeper counts a week in its records (rosters' wins/losses/points, the
`streak` metadata) only once the week is over and processed. Its league
object says how far that's got: `settings.last_scored_leg` is the last
official week (`lastFinishedWeek` in `lib/league-data.ts`).

Settings → Scores switches between two readings (`AppConfig.asItStands`,
read through `useAsItStands`, which follows the setting as it changes):

- **Final** (the default) counts only official weeks. The payout table
  leaves the week being played out (`finishedWeeksOnly` in
  `lib/league-money.ts`), so it isn't paid until it's over.
- **As it stands** counts the week being played as if it ended now.
  `usePendingMatchups` loads each league's unfinished weeks' matchups on every
  live-clock tick, and `summaryAsItStands` puts their results on top of
  Sleeper's records. This feeds the records, ranks, streaks and PF/PA on the
  dashboard and league page, and the header's combined record. Only
  regular-season weeks go on the record. The same matchups go on the
  all-time head-to-heads (`headToHeadAsItStands`), the payout table (the week
  is shaded Live), and league history's current season and its money.

A week nobody has scored in yet hasn't started, so it counts for nothing
either way. Recaps always use their own week's final results.

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
