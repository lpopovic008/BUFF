// league-sites: the app's go-between with fantasy sites a browser can't read on its own (see src/lib/sites/fetch.ts).
// A Supabase Edge Function (Deno). Set up once by hand — see docs/league-sites.md.
//
// POST, JSON, one `op` each:
//   { op: "fetch", url, cookies? }   GETs `url` — only on the sites listed in ALLOWED_HOSTS — with `cookies` if given
//                                    (a private ESPN league's espn_s2 and SWID), and answers { status, body }: the site's
//                                    own status, and its JSON.
//   { op: "yahoo-client" }           answers { clientId }: the Yahoo app's client id (not a secret), for its sign-in page.
//   { op: "yahoo-token", code, redirect_uri }   trades the code Yahoo sends a signed-in visitor back with for their
//                                    access and refresh tokens — with the app's client secret, which never leaves here.
//   { op: "yahoo-refresh", refresh_token }      renews their access the same way.
//   { op: "yahoo", path, access_token }         GETs Yahoo's Fantasy API at /fantasy/v2/<path>, as them; answers its JSON.
//
// Nothing's kept here: no cookies, no tokens, no answers. Secrets (Edge Functions → Secrets): YAHOO_CLIENT_ID and
// YAHOO_CLIENT_SECRET. "Verify JWT" off: the app calls it with its publishable key, not a signed-in user's token.

const ALLOWED_HOSTS = [
  /^lm-api-reads\.fantasy\.espn\.com$/,
  /^fantasy\.espn\.com$/,
  /^(api|www\d*)\.myfantasyleague\.com$/,
  /^www\.fleaflicker\.com$/,
];

/** The app's own pages, which alone may call this from a browser. */
const ALLOWED_ORIGINS = [/^https:\/\/(www\.)?commish\.win$/, /^https:\/\/lpopovic008\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^capacitor:\/\/localhost$/];
/** The site's own domain, once it has one (the SITE_ORIGIN secret, e.g. "https://commish.app"): its pages may too. */
const SITE_ORIGIN = (Deno.env.get("SITE_ORIGIN") ?? "").replace(/\/+$/, "");

function cors(origin: string | null): Record<string, string> {
  const ok = origin && (ALLOWED_ORIGINS.some((o) => o.test(origin)) || (SITE_ORIGIN !== "" && origin === SITE_ORIGIN));
  return {
    "Access-Control-Allow-Origin": ok ? origin : "https://lpopovic008.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    Vary: "Origin",
  };
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

async function yahooTokens(params: Record<string, string>): Promise<Response> {
  const id = Deno.env.get("YAHOO_CLIENT_ID") ?? "";
  const secret = Deno.env.get("YAHOO_CLIENT_SECRET") ?? "";
  return fetch("https://api.login.yahoo.com/oauth2/get_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${id}:${secret}`)}` },
    body: new URLSearchParams(params),
  });
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, headers);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Not JSON" }, 400, headers);
  }

  switch (body.op) {
    case "fetch": {
      let url: URL;
      try {
        url = new URL(String(body.url));
      } catch {
        return json({ error: "Bad url" }, 400, headers);
      }
      if (url.protocol !== "https:" || !ALLOWED_HOSTS.some((h) => h.test(url.hostname))) return json({ error: "Not an allowed site" }, 403, headers);
      const cookies = body.cookies && typeof body.cookies === "object" ? (body.cookies as Record<string, string>) : null;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (league-sites)",
          ...(cookies ? { Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
        },
        redirect: "follow",
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // (Not JSON: a login page, an error page. Its status says enough.)
      }
      return json({ status: res.status, body: parsed }, 200, headers);
    }

    case "yahoo-client":
      return json({ clientId: Deno.env.get("YAHOO_CLIENT_ID") ?? null }, 200, headers);

    case "yahoo-token": {
      const res = await yahooTokens({ grant_type: "authorization_code", code: String(body.code ?? ""), redirect_uri: String(body.redirect_uri ?? "") });
      return json(await res.json().catch(() => ({})), res.status, headers);
    }

    case "yahoo-refresh": {
      const res = await yahooTokens({ grant_type: "refresh_token", refresh_token: String(body.refresh_token ?? "") });
      return json(await res.json().catch(() => ({})), res.status, headers);
    }

    case "yahoo": {
      const path = String(body.path ?? "").replace(/^\/+/, "");
      if (!path || path.includes("..") || /^https?:/i.test(path)) return json({ error: "Bad path" }, 400, headers);
      const res = await fetch(`https://fantasysports.yahooapis.com/fantasy/v2/${path}${path.includes("?") ? "&" : "?"}format=json`, {
        headers: { Authorization: `Bearer ${String(body.access_token ?? "")}`, Accept: "application/json" },
      });
      return json(await res.json().catch(() => ({})), res.status, headers);
    }
  }
  return json({ error: "Unknown op" }, 400, headers);
});
