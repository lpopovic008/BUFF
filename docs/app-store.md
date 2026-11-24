# Putting Commi$h on the App Store

The iPhone and iPad app is the same site, wrapped in a native shell by Capacitor (`capacitor.config.ts`, `ios/`).
It's built in GitHub's cloud on a Mac (`.github/workflows/ios.yml`), so no Mac is needed. Everything below is done
once, in a web browser, in this order.

## 1. Apple Developer Program

1. Enroll at <https://developer.apple.com/programs/enroll/> ($99 a year), as an individual or as an organization.
   Approval can take a day or two.
2. Once enrolled, find your **Team ID** at <https://developer.apple.com/account> → Membership details (10 letters
   and digits).

## 2. The app in App Store Connect

1. <https://appstoreconnect.apple.com> → Apps → **+** → New App.
   - Platforms: iOS
   - Name: **Commi$h** (must be unique on the store; add a word if it's taken)
   - Primary language: English (U.S.)
   - Bundle ID: **com.lukapopovic.commish**. If it isn't in the list yet, register it first at
     <https://developer.apple.com/account/resources/identifiers/list> → **+** → App IDs → App, with that exact
     identifier.
   - SKU: anything, e.g. `commish-ios`

## 3. An App Store Connect API key (so the cloud build can sign and upload)

1. App Store Connect → Users and Access → **Integrations** → App Store Connect API → Team Keys → **+**.
2. Name it `GitHub builds`, Access **Admin** (needed for Apple to make and keep the signing certificate for you).
3. Download the `.p8` file (it can only be downloaded once). Note the **Key ID**, and the **Issuer ID** shown above
   the list.

## 4. GitHub: secrets and variables

Repository → Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `APP_STORE_CONNECT_KEY` | The whole text of the `.p8` file |
| Secret | `APP_STORE_CONNECT_KEY_ID` | The Key ID |
| Secret | `APP_STORE_CONNECT_ISSUER_ID` | The Issuer ID |
| Variable | `APPLE_TEAM_ID` | Your Team ID |
| Variable | `APPLE_SIGN_IN` | `1`, once step 5 is done |

## 5. Sign-in for the app (Supabase)

In the Supabase dashboard for this project:

1. **Authentication → URL Configuration → Redirect URLs**: add `com.lukapopovic.commish://auth` (the app's own link,
   where Google and Apple sign-in come back into the app).
2. **Authentication → Sign In / Providers → Apple**: turn it on. Supabase's page walks through what it needs from
   Apple: a Services ID, a Sign in with Apple key, and your Team ID, all made at
   <https://developer.apple.com/account/resources>. Use `https://uybcjhzfwidbetnzfxwu.supabase.co/auth/v1/callback`
   as the Services ID's return URL.
3. Then set the `APPLE_SIGN_IN` variable to `1` (step 4). Until it is, the app offers email sign-in only: the App
   Store requires Sign in with Apple wherever Google sign-in is offered.

## 6. The Supabase functions (account deletion, other sites, notifications)

The app runs three small functions on Supabase (`supabase/functions/`): `delete-account` (Apple requires that an
account made in the app can be deleted in it: Settings → Account → Delete account), `league-sites` (leagues on other
sites, see docs/league-sites.md) and `notify` (push notifications, step 9). A workflow deploys them all:

1. Make a Supabase access token at <https://supabase.com/dashboard/account/tokens> and add it to GitHub as the secret
   `SUPABASE_ACCESS_TOKEN`.
2. GitHub → **Actions → Deploy Supabase functions → Run workflow**. Run it again whenever they change.

## 7. Build and upload

GitHub → **Actions → iOS build to TestFlight → Run workflow**. Enter the version (`1.0` to start). About 15–25
minutes later the build is in App Store Connect → your app → **TestFlight** (Apple takes a few more minutes to
process it). Install the **TestFlight** app on your iPhone and you can try it as an internal tester right away.

Run it again for each new build. The build number goes up by itself; raise the version for each App Store release.

## 8. The listing and review

In App Store Connect → your app → the version under **iOS App**:

- **Screenshots**: iPhone 6.9" (1320 × 2868) and iPad 13" (2064 × 2752) — exactly what an iPhone 16/17 Pro Max and a
  13" iPad Pro save when you take a screenshot (side button + volume up) in the TestFlight build. Take 3 to 5 of
  each with your own leagues showing: Home during a game, the League page, a trade, a write-up, Values. On a smaller
  iPhone or iPad, the iOS Simulator isn't available without a Mac, so borrow one of those devices, or ask a TestFlight
  tester who has one.
- **Description, keywords, promotional text**: see below.
- **Support URL**: `https://lpopovic008.github.io/BUFF/support`
- **Privacy Policy URL**: `https://lpopovic008.github.io/BUFF/privacy`
- **App Privacy** (the "nutrition label"): Data collected → Contact Info → Email Address, and User Content → Other
  User Content; both linked to the user, for App Functionality, not used for tracking.
- **Age rating**: no objectionable content; answer "No" to gambling. (The app tracks a league's own buy-ins and
  payouts; it takes no bets and moves no money.)
- **App Review Information**: give a demo login (an email and password you've made in the app) and these notes:
  > Commi$h shows a user's own fantasy football leagues. To see it with data, open Settings, enter the Sleeper username
  > `<a Sleeper username with public leagues>` and tap Find leagues; then open Home and League.
- Choose the build from TestFlight, then **Add for Review** → **Submit**.

### Listing text

**Subtitle** (30 characters): `Your fantasy leagues, live`

**Promotional text**: Every league you play in, on one screen: live scores and plays, standings, trades and the
commissioner's weekly write-up.

**Description**:

> Commi$h brings every fantasy football league you're in together — Sleeper, ESPN, Yahoo, MyFantasyLeague and
> Fleaflicker.
>
> • Live: your starters across every league, game by game, with the Red Zone's scoring plays as they happen.
> • Leagues: matchups, standings, playoff pictures, history and payouts.
> • Trades: every trade in your leagues, how each side's done since, and a trade calculator.
> • Values: dynasty and redraft player values, with their stats.
> • Commissioner write-ups: the week's results, standings and matchups written up for you, ready to post to the group
>   chat as text or a picture.
>
> Sign in to keep it all in sync between your phone, iPad and the web.

**Keywords** (100 characters): `fantasy football,sleeper,espn fantasy,yahoo fantasy,dynasty,trade,league,commissioner,live scores`

## 9. Push notifications

The app can notify each person about their Sleeper leagues: their starters scoring (touchdowns, field goals,
turnovers), lineup problems before kickoff (out, bye, questionable), matchup results and close games late, and trades.
Each is switched on in the app, under Settings → Notifications, and needs the person signed in. Setting up:

1. **Apple**: at <https://developer.apple.com/account/resources/identifiers/list>, open the App ID
   `com.lukapopovic.commish`, tick **Push Notifications** and save. Then **Keys → +**, name it `Push`, tick **Apple Push
   Notifications service (APNs)**, register it and download the `.p8` (once only). Note its **Key ID**.
2. **Supabase → Edge Functions → Secrets**: add
   - `APNS_KEY` — the whole text of that `.p8`
   - `APNS_KEY_ID` — its Key ID
   - `APPLE_TEAM_ID` — your Team ID
   - `NOTIFY_SECRET` — a long random string you make up (a password generator's fine)
3. **Supabase → SQL Editor**: run `supabase/push.sql`, having first put the same random string into its
   `vault.create_secret(...)` line and taken the `--` off the front of that line. That makes the tables and runs the
   `notify` function every minute.
4. Deploy the functions (step 6) and build the app again (step 7).

`notify` sends nothing in the offseason, and each notification once. Leagues on ESPN, Yahoo, MyFantasyLeague and
Fleaflicker aren't watched for notifications yet.

## What the app leaves out

Two things only work in a web browser, so the app leaves them out: saving a write-up to Google Docs, and signing in to
Yahoo to read Yahoo leagues. Both still work on the website, and Yahoo leagues added there sync to the app. Tips to the
developer aren't offered in the app either (the App Store doesn't allow paying outside it).
