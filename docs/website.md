# Putting Commi$h on its own domain

The site is built by `.github/workflows/deploy.yml` and served by GitHub Pages, free. Until it has a domain it lives at
`https://lpopovic008.github.io/BUFF/`. Once it has one, it's served from the domain's root, and the old address sends
visitors on to it by itself. Each step below is done once, in a web browser.

## 1. Buy a domain

Any registrar works. Cloudflare (<https://dash.cloudflare.com> → Domain Registration → Register Domains) sells at cost,
about $10 a year for a `.com` and about $14 for a `.app`. Namecheap and Porkbun are fine too. Below, `commish.win`
stands for yours.

## 2. Point it at GitHub Pages (the registrar's DNS settings)

Add these records (on Cloudflare: DNS → Records; set each to **DNS only**, the grey cloud, so GitHub can issue the
site's HTTPS certificate):

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `lpopovic008.github.io` |

## 3. GitHub

1. Optional but worth it: GitHub (your profile) → **Settings → Pages → Add a domain** to verify it's yours, so no one
   else can ever point it at their own site.
2. The repository → **Settings → Pages → Custom domain**: enter `commish.win`, **Save**, and wait for the DNS check to
   pass (minutes, sometimes an hour). Then tick **Enforce HTTPS**.
3. The repository → **Settings → Secrets and variables → Actions → Variables**: add `SITE_DOMAIN` = `commish.win`.
4. **Actions → Deploy to GitHub Pages → Run workflow** (or push anything) to rebuild the site for its new address.

## 4. Sign-in and the site's other services

These only allow the addresses they're told about, so each needs the new one:

- **Supabase** → Authentication → URL Configuration: set **Site URL** to `https://commish.win`, and add
  `https://commish.win/**` to the Redirect URLs (keep the github.io one until you're sure).
- **Supabase** → Edge Functions → Secrets: add `SITE_ORIGIN` = `https://commish.win` (for leagues on other sites, and
  account deletion).
- **Google Docs** (if you use Save to Doc): Google Cloud Console → APIs & Services → Credentials → the OAuth client →
  add `https://commish.win` to Authorized JavaScript origins and `https://commish.win/auth-callback` to Authorized
  redirect URIs.
- **Yahoo** (if set up, see docs/league-sites.md): in the Yahoo app's settings, change the Redirect URI to
  `https://commish.win/settings/yahoo`.

## 5. Search engines

The site already tells search engines what it is (its description, a preview picture for shared links, `robots.txt`
and `sitemap.xml`). To get it found sooner, add it at Google Search Console (<https://search.google.com/search-console>)
→ Add property → Domain, verify with the DNS record it gives you, then Sitemaps → submit `sitemap.xml`.
