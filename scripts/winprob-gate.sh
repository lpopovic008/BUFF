#!/usr/bin/env bash
# Whether the win-probability recorder has anything to do, from ESPN's
# scoreboard: "live" when a game is on or ended in the last ~2 hours (for the
# final reading), "soon" when one kicks off within 90 minutes, else "idle".
now=$(date +%s)
curl -sf https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard | jq -r --argjson now "$now" '
  [.events[]? | .competitions[0] as $c
    | ($c.status.type.state) as $s
    | (try ($c.date | sub("T(?<h>[0-9]{2}):(?<m>[0-9]{2})Z$"; "T\(.h):\(.m):00Z") | fromdateiso8601) catch 0) as $k
    | if $s == "in" or ($s == "post" and ($now - $k) > 10800 and ($now - $k) < 19800) then "live"
      elif $s == "pre" and ($k - $now) < 5400 and ($k - $now) > -1800 then "soon"
      else "idle" end]
  | if index("live") then "live" elif index("soon") then "soon" else "idle" end' || echo idle
