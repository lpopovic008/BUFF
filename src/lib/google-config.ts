// OAuth client ID for Google Identity Services (see google-auth.ts). This is
// a public "Web application" client with no client secret — safe to expose
// in the browser. Two ways to supply it: baked in at build time via
// NEXT_PUBLIC_GOOGLE_CLIENT_ID (see next.config.ts and
// .github/workflows/deploy.yml), for whoever runs the deploy; or pasted into
// Settings → Google Docs by anyone using the site, stored in that browser's
// AppConfig (see localStore.ts) — no repo access needed either way. The
// build-time value is the fallback so a self-hosted config still works if a
// browser hasn't set its own.
const BUILD_TIME_GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/** The Client ID to actually use, preferring what's saved in Settings. Empty until either is configured, in which case Save-to-Doc stays hidden rather than showing a button that can't work. */
export function resolveGoogleClientId(configuredClientId: string | null | undefined): string {
  return configuredClientId?.trim() || BUILD_TIME_GOOGLE_CLIENT_ID;
}
