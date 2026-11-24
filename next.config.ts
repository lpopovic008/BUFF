import type { NextConfig } from "next";

// Published as a static site to GitHub Pages. On its own domain (the SITE_DOMAIN Actions variable, e.g.
// "commish.app" — see docs/website.md) it's served from the domain's root; without one, from
// https://<user>.github.io/<repo>/, so it needs that basePath in CI. The path is the repo's own name
// (GITHUB_REPOSITORY is "owner/repo" in Actions), so renaming the repo moves the site with it, no edit needed here.
// Local `next dev`/`next build` stay at the site root.
// The iOS app's build (see .github/workflows/ios.yml) runs in Actions too, but its pages are served from the app
// itself, at its root: no basePath for it.
const siteDomain = (process.env.SITE_DOMAIN ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
const isGithubActionsBuild = process.env.GITHUB_ACTIONS === "true" && process.env.CAPACITOR_BUILD !== "1";
const owner = process.env.GITHUB_REPOSITORY?.split("/")[0] ?? "lpopovic008";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "BUFF";
const basePath = isGithubActionsBuild && !siteDomain ? `/${repoName}` : "";
// Where the site lives, in full: for links to it that have to be whole (a shared link's preview, the sitemap).
const siteUrl = siteDomain ? `https://${siteDomain}` : `https://${owner}.github.io/${repoName}`;

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_URL: siteUrl,
  },
};

export default nextConfig;
