import type { NextConfig } from "next";

// Published as a static site to GitHub Pages, served from
// https://<user>.github.io/BUFF/ — so it needs a basePath in CI, but not
// for local `next dev`/`next build`, which stay at the site root.
const isGithubActionsBuild = process.env.GITHUB_ACTIONS === "true";
const repoBasePath = "/BUFF";

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
