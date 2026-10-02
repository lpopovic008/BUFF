import type { NextConfig } from "next";

// Published as a static site to GitHub Pages, served from
// https://<user>.github.io/<repo>/ — so it needs a basePath in CI, but not
// for local `next dev`/`next build`, which stay at the site root. The path is
// the repo's own name (GITHUB_REPOSITORY is "owner/repo" in Actions), so
// renaming the repo moves the site with it, no edit needed here.
const isGithubActionsBuild = process.env.GITHUB_ACTIONS === "true";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "BUFF";
const repoBasePath = `/${repoName}`;

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: isGithubActionsBuild ? repoBasePath : "",
  assetPrefix: isGithubActionsBuild ? repoBasePath : "",
  env: {
    NEXT_PUBLIC_BASE_PATH: isGithubActionsBuild ? repoBasePath : "",
  },
};

export default nextConfig;
