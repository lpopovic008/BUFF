# Leagues on other sites

Besides Sleeper, the app reads leagues on **ESPN**, **Yahoo**, **MyFantasyLeague** and **Fleaflicker**. Each one
goes through the app as a Sleeper league does: `src/lib/sleeper.ts` hands any request for one to that site's
adapter in `src/lib/sites/`, which answers it in Sleeper's own shape (the league, its managers, rosters, a week's
matchups and moves, its drafts and brackets), its players matched to Sleeper's (see `sites/player-map.ts`).

A league is added in **Settings → Leagues** by pasting its link. Every league is in the one list there, each marked
with its site.

| Site | Read how | Needs |
| --- | --- | --- |
| ESPN, public league | Straight from the browser | Nothing |
| ESPN, private league | Through the `league-sites` function | Your ESPN login cookies (Settings → Leagues → ESPN login), and the function set up |
| MyFantasyLeague | From the browser, else through the function | The function, if MFL won't let a browser read it |
| Fleaflicker | From the browser, else through the function | The function, if Fleaflicker won't let a browser read it |
| Yahoo | Through the function | Signing in to Yahoo, the function set up, and a Yahoo app |

Until a league can be read, it's in the list **link only**: it opens on its site, and isn't on the rest of the app's
pages.

## Setting up the `league-sites` function (once)

The function's code is `supabase/functions/league-sites/index.ts`. It runs on this app's Supabase project.

1. In the Supabase dashboard, open **Edge Functions → Deploy a new function → Via Editor**.
2. Name it `league-sites`, paste in the whole of `supabase/functions/league-sites/index.ts`, and deploy it.
3. In the function's **Details** (or settings), turn **Verify JWT** (Enforce JWT verification) **off**. The app calls
   it with its publishable key, not a signed-in user's token. The function itself only fetches from the fantasy
   sites it lists, and only answers the app's own pages.

That's all ESPN private leagues, MyFantasyLeague and Fleaflicker need.

## Yahoo (once more)

Yahoo only lets an app read your leagues once you've signed in to Yahoo for it, through an app registered with
Yahoo:

1. At <https://developer.yahoo.com/apps/create/>, create an app:
   - **Application type**: Web Application
   - **Redirect URI(s)**: `https://lpopovic008.github.io/BUFF/settings/yahoo`
   - **API permissions**: Fantasy Sports → Read
2. Copy its **Client ID** and **Client Secret**.
3. In the Supabase dashboard, **Edge Functions → Secrets**, add `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` with them.

Then **Settings → Leagues → Sign in to Yahoo** signs you in and adds your Yahoo leagues. Your Yahoo access is kept in
that browser only.

## ESPN login cookies (private ESPN leagues)

ESPN has no sign-in for other apps; a private league is read with the two cookies ESPN's own site keeps once you're
logged in there:

1. Log in at <https://fantasy.espn.com> in a desktop browser.
2. Open the browser's developer tools → **Application** (Chrome) or **Storage** (Firefox) → **Cookies** →
   `https://fantasy.espn.com`.
3. Copy the values of `espn_s2` and `SWID` into **Settings → Leagues → ESPN login**.

They're kept in that browser only — never in your synced account or a backup file — and sent only to ESPN, by way of
the function.
