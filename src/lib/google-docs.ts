// Appends a recap write-up to the right season/week tab of a Google Doc via
// the Docs API, called from the browser with a user-granted OAuth access
// token (see google-auth.ts). No server involved — this is a static site.
//
// The commish's doc uses native Google Docs tabs: a top-level tab per season
// (e.g. "2026"), with a child tab per week ("Week 1", "Week 2", ...) under
// it. A preseason write-up has no week of its own, so it's saved directly
// into the season tab rather than a child tab.

export const DOCS_SCOPE = "https://www.googleapis.com/auth/documents";

export interface DocsBatchUpdateRequest {
  insertText: { location: { index: number; tabId?: string }; text: string };
}

/** One tab (or child tab) of the doc, with just enough to find it by title and know where its content ends. */
export interface DocTab {
  tabId: string;
  title: string;
  /** endIndex of the tab's own body content — where a new paragraph gets appended. */
  docEndIndex: number;
  childTabs: DocTab[];
}

function titleMatches(title: string, expected: string): boolean {
  const normalized = title.trim().toLowerCase();
  const target = expected.trim().toLowerCase();
  return normalized === target || normalized.startsWith(`${target} `);
}

/** The doc-tab title a week's write-up lives under — "Week 1", "Week 2", etc. */
export function weekTabTitle(week: number): string {
  return `Week ${week}`;
}

/**
 * Resolves which tab a write-up belongs in: the season tab itself for a
 * preseason write-up (`week` null), or that season's "Week N" child tab
 * otherwise. Doesn't create anything — the Docs API has no way to add a tab,
 * only to write into ones that already exist — so a missing tab is reported
 * back as an error naming exactly what to create, rather than silently
 * misfiling the write-up into the wrong place.
 */
export function resolveTargetTab(
  tabs: DocTab[],
  season: string,
  week: number | null
): { tab: DocTab } | { error: string } {
  const seasonTab = tabs.find((t) => titleMatches(t.title, season));
  if (!seasonTab) {
    return { error: `Couldn't find a "${season}" tab in this Doc — create it, then try again.` };
  }
  if (week === null) {
    return { tab: seasonTab };
  }
  const title = weekTabTitle(week);
  const weekTab = seasonTab.childTabs.find((t) => titleMatches(t.title, title));
  if (!weekTab) {
    return {
      error: `Couldn't find a "${title}" tab under "${seasonTab.title}" — create it, then try again.`,
    };
  }
  return { tab: weekTab };
}

/**
 * Pure index math for inserting a write-up at a known position (optionally
 * inside a specific tab): separates from any network call so the offsets
 * can be unit tested directly.
 *
 * Just the write-up, as plain text — no heading styling on the first line.
 * Two blank lines separate it from whatever precedes it at `insertAt`.
 */
export function buildInsertRequests(
  insertAt: number,
  body: string,
  tabId?: string
): { text: string; requests: DocsBatchUpdateRequest[] } {
  const text = `\n\n${body}\n`;
  return {
    text,
    requests: [{ insertText: { location: { index: insertAt, ...(tabId ? { tabId } : {}) }, text } }],
  };
}

/**
 * Google Docs' body always ends with an implicit trailing newline that can't
 * be written over — appending at the very end of a tab must land at
 * `docEndIndex - 1`, one before it.
 */
export function buildAppendRequests(
  docEndIndex: number,
  body: string,
  tabId?: string
): { text: string; requests: DocsBatchUpdateRequest[] } {
  return buildInsertRequests(docEndIndex - 1, body, tabId);
}

async function docsFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`https://docs.googleapis.com${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google Docs API error (${res.status}): ${detail || res.statusText}`);
  }
  return res;
}

interface DocsTabResponse {
  tabProperties?: { tabId?: string; title?: string };
  documentTab?: { body?: { content?: { endIndex?: number }[] } };
  childTabs?: DocsTabResponse[];
}

function parseTab(raw: DocsTabResponse): DocTab {
  const content = raw.documentTab?.body?.content ?? [];
  const last = content.at(-1);
  return {
    tabId: raw.tabProperties?.tabId ?? "",
    title: raw.tabProperties?.title ?? "",
    docEndIndex: last?.endIndex ?? 1,
    childTabs: (raw.childTabs ?? []).map(parseTab),
  };
}

const TABS_FIELDS =
  "tabs(tabProperties,documentTab.body.content(endIndex)," +
  "childTabs(tabProperties,documentTab.body.content(endIndex)))";

/** Every tab in the doc, with its child tabs nested inside it — null if this doc doesn't use tabs at all. */
async function fetchDocTabs(documentId: string, accessToken: string): Promise<DocTab[] | null> {
  const res = await docsFetch(
    `/v1/documents/${documentId}?includeTabsContent=true&fields=${encodeURIComponent(TABS_FIELDS)}`,
    accessToken
  );
  const doc = (await res.json()) as { tabs?: DocsTabResponse[] };
  if (!doc.tabs || doc.tabs.length === 0) return null;
  return doc.tabs.map(parseTab);
}

async function getDocEndIndex(documentId: string, accessToken: string): Promise<number> {
  const res = await docsFetch(`/v1/documents/${documentId}?fields=body.content(endIndex)`, accessToken);
  const doc = (await res.json()) as { body?: { content?: { endIndex?: number }[] } };
  const last = doc.body?.content?.at(-1);
  if (!last?.endIndex) throw new Error("Couldn't read the document's content — is the doc empty?");
  return last.endIndex;
}

/**
 * Appends `body` (the recap editor's current text) to the doc, in the right
 * place: the "{season}" tab for a preseason write-up, or the "{season}" tab's
 * "Week {week}" child tab otherwise. Falls back to appending at the very end
 * of the doc's single body when it has no tabs at all (an older doc that
 * predates the tab layout).
 */
export async function appendWriteupToDoc(
  documentId: string,
  body: string,
  accessToken: string,
  season: string,
  week: number | null
): Promise<void> {
  const tabs = await fetchDocTabs(documentId, accessToken);

  let requests: DocsBatchUpdateRequest[];
  if (tabs) {
    const resolved = resolveTargetTab(tabs, season, week);
    if ("error" in resolved) throw new Error(resolved.error);
    requests = buildInsertRequests(resolved.tab.docEndIndex - 1, body, resolved.tab.tabId).requests;
  } else {
    const docEndIndex = await getDocEndIndex(documentId, accessToken);
    requests = buildAppendRequests(docEndIndex, body).requests;
  }

  await docsFetch(`/v1/documents/${documentId}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}
