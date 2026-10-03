# Team logos, reimagined in black and white

`source/` holds each NFL team's official logo as full-color SVG (from the
ISC-licensed `react-native-nfl-logos` package), named by Sleeper's team
abbreviation. `build.mjs` redraws each one in pure black and white for the
dashboard's starters list and writes it to `public/team-logos/`:

- every color becomes black or white by how light it is (perceived
  lightness, CIE L*), so a logo keeps its light-against-dark structure —
  the Steelers' gold diamond turns white, the red and navy ones black;
- a color that turns white without having been white (gold, silver,
  orange, ...) gets a thin dark outline, so it still stands apart from the
  white it may now sit on;
- gradients become the single tone their colors average to.

The whole logo's silhouette is outlined at display time instead (see
--logo-outline), dark on the light theme and light on the dark one.

Regenerate with `node scripts/team-logos/build.mjs`.
