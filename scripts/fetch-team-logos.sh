#!/usr/bin/env bash
# Temporary: downloads each NFL team's current primary logo (the SVG from its
# Wikipedia article, plus ESPN's PNG to check it against) into
# scripts/team-logos-source/. Run from GitHub Actions, which can reach both
# sites; the sandbox this app is developed in can't.
set -uo pipefail
out=scripts/team-logos-source
mkdir -p "$out"
UA="CommishLogoFetch/1.0 (https://github.com/lpopovic008/buff)"
while IFS='|' read -r abbr espn title; do
  t=$(jq -rn --arg t "$title" '$t|@uri')
  url=$(curl -fsS -A "$UA" "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&pilicense=any&redirects=1&titles=$t" | jq -r '.query.pages[].original.source // empty')
  echo "$abbr wiki: $url"
  if [ -n "$url" ]; then
    curl -fsS -A "$UA" "$url" -o "$out/$abbr.${url##*.}" || echo "FAILED wiki $abbr"
  else
    echo "MISSING wiki $abbr"
  fi
  curl -fsS -A "$UA" "https://a.espncdn.com/i/teamlogos/nfl/500/$espn.png" -o "$out/$abbr.espn.png" || echo "FAILED espn $abbr"
  sleep 1
done <<'TEAMS'
ARI|ari|Arizona Cardinals
ATL|atl|Atlanta Falcons
BAL|bal|Baltimore Ravens
BUF|buf|Buffalo Bills
CAR|car|Carolina Panthers
CHI|chi|Chicago Bears
CIN|cin|Cincinnati Bengals
CLE|cle|Cleveland Browns
DAL|dal|Dallas Cowboys
DEN|den|Denver Broncos
DET|det|Detroit Lions
GB|gb|Green Bay Packers
HOU|hou|Houston Texans
IND|ind|Indianapolis Colts
JAX|jax|Jacksonville Jaguars
KC|kc|Kansas City Chiefs
LAC|lac|Los Angeles Chargers
LAR|lar|Los Angeles Rams
LV|lv|Las Vegas Raiders
MIA|mia|Miami Dolphins
MIN|min|Minnesota Vikings
NE|ne|New England Patriots
NO|no|New Orleans Saints
NYG|nyg|New York Giants
NYJ|nyj|New York Jets
PHI|phi|Philadelphia Eagles
PIT|pit|Pittsburgh Steelers
SEA|sea|Seattle Seahawks
SF|sf|San Francisco 49ers
TB|tb|Tampa Bay Buccaneers
TEN|ten|Tennessee Titans
WAS|wsh|Washington Commanders
TEAMS
ls -la "$out"
