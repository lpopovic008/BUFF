// Temporary: loads Settings in WebKit at iPhone size with a real-looking setup and reports sideways overflow.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { webkit, devices } from "playwright";

const OUT = path.resolve("out");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  for (const c of [path.join(OUT, p), path.join(OUT, p + ".html"), path.join(OUT, p, "index.html")]) {
    try {
      if ((await stat(c)).isFile()) {
        res.writeHead(200, { "content-type": TYPES[path.extname(c)] ?? "application/octet-stream" });
        return res.end(await readFile(c));
      }
    } catch {}
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(4173, r));

const label = process.argv[2] ?? "build";
const browser = await webkit.launch();
for (const [name, device] of [["iPhone 15", devices["iPhone 15"]], ["iPhone SE", devices["iPhone SE"]], ["iPhone 15 Pro Max", devices["iPhone 15 Pro Max"]]]) {
  for (const withClientId of [false, true]) {
    const context = await browser.newContext({ ...device, colorScheme: "dark" });
    await context.addInitScript((clientId) => {
      localStorage.setItem("commish:config", JSON.stringify({
        sleeperUsername: "Lpop8", sleeperUserId: "u1", season: "2026",
        leagues: [
          { leagueId: "L1", nickname: "Epstein Island - Year 3", isCommish: true },
          { leagueId: "L2", nickname: "League of Extraordinary Gentlemen", isCommish: false },
          { leagueId: "L3", nickname: "Chud Mogging and Aura Maxxing League \u{1F6AB}\u{1F9C3}", isCommish: true },
          { leagueId: "L4", nickname: "Brozickernic Fantasy Football", isCommish: false },
        ],
        externalLeagues: [],
        googleClientId: clientId,
      }));
      localStorage.setItem("commish:sync-state", JSON.stringify({ lastSyncedAt: Date.parse("2026-10-05T22:02:00") }));
      localStorage.setItem("sb-uybcjhzfwidbetnzfxwu-auth-token", JSON.stringify({
        access_token: "x.eyJleHAiOjk5OTk5OTk5OTl9.x", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: "00000000-0000-0000-0000-000000000001", email: "lpopovic008@gmail.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
      }));
    }, withClientId ? "1234567890-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com" : null);
    await context.route(/^https?:\/\/(?!localhost)/, (route) => {
      const u = route.request().url();
      if (u.includes("api.sleeper.app/v1/state/nfl")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ week: 4, season: "2026", season_type: "regular", display_week: 4 }) });
      if (u.includes("api.sleeper.app")) return route.fulfill({ contentType: "application/json", body: "[]" });
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto("http://localhost:4173/settings", { waitUntil: "load" });
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      vw: innerWidth,
      signedIn: document.body.innerText.includes("lpopovic008@gmail.com"),
      widest: [...document.querySelectorAll("body *")]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && ![...e.children].some((c) => c.getBoundingClientRect().right > innerWidth + 1))
        .slice(0, 6)
        .map((e) => `${e.tagName.toLowerCase()}[${String(e.className).slice(0, 60)}] w=${Math.round(e.getBoundingClientRect().width)} "${(e.innerText || e.value || e.placeholder || "").slice(0, 30).replace(/\n/g, " ")}"`),
    }));
    console.log(`${label} | ${name} | clientId=${withClientId} | ${JSON.stringify(info)}`);
    await context.close();
  }
}
await browser.close();
server.close();
