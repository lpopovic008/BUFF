@AGENTS.md

## Git workflow for this repo

The owner has authorized committing and pushing **directly to `main`** — no
feature branch, no PR. Work on `main`, and push every finished change there
rather than leaving it local or on a side branch.

Pushing to `main` triggers `.github/workflows/deploy.yml`, which publishes
the site to GitHub Pages. A push therefore ships to the live public site,
so run `npm run lint` and `npm run build` before pushing.

## Checking layouts

Test phone layouts at the iPhone 15's width, 393px, as the narrowest screen
the app has to fit — not 320/375px. Check from there up to desktop.
