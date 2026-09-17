import type { CapacitorConfig } from "@capacitor/cli";

// Wraps the same static export GitHub Pages already serves (see
// next.config.ts's `output: "export"`) into a native iOS shell — Capacitor
// bundles whatever's in `webDir` straight into the app, no separate
// native UI to build or keep in sync.
//
// appId is a placeholder — it has to become a real reverse-DNS identifier
// you actually control before this can be registered in App Store Connect
// (Apple checks it's unique across the store, and it's painful to change
// once a build has shipped with it). Update it whenever that's decided.
//
// Nothing here can be exercised without Xcode (macOS-only) — `npx cap add
// ios` generates the actual Xcode project from this config, and that step
// still needs to happen on a Mac.
const config: CapacitorConfig = {
  appId: "com.lukapopovic.buff",
  appName: "BUFF",
  webDir: "out",
};

export default config;
