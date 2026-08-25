// OAuth client ID for Google Identity Services (see google-auth.ts). This is
// a public "Web application" client with no client secret — safe to bake
// into the static build — sourced from NEXT_PUBLIC_GOOGLE_CLIENT_ID at build
// time (see next.config.ts and .github/workflows/deploy.yml) so it isn't
// hardcoded here. Empty until that's configured, in which case Save-to-Doc
// stays hidden rather than showing a button that can't work.
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
