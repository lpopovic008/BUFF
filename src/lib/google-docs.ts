// Appends a recap write-up to the right season's section of a Google Doc via
// the Docs API, called from the browser with a user-granted OAuth access
// token (see google-auth.ts). No server involved — this is a static site.

export const DOCS_SCOPE = "https://www.googleapis.com/auth/documents";

export interface DocsBatchUpdateRequest {
  insertText?: { location: { index: number }; text: string };
  updateParagraphStyle?: {
    range: { startIndex: number; endIndex: number };
    paragraphStyle: { namedStyleType: string };
    fields: string;
  };
}

/** One paragraph of the doc's existing content, enough to find heading text and its position. */
export interface DocParagraph {
  startIndex: number;
  endIndex: number;
  text: string;
  /** e.g. "HEADING_1", "TITLE" — null for ordinary body text. */
  headingStyle: string | null;
}

function isHeadingStyle(style: string | null): boolean {
  return style !== null && (style.startsWith("HEADING") || style === "TITLE");
}

/**
 * Where a season's entries live in a heading-organized doc — one heading per
 * season (e.g. a paragraph reading exactly "2026"), with everything under it
 * up to the next heading belonging to that season. Matches a heading whose
 * text is the season on its own, or starts with it ("2026 Season", "2026
 * Preseason & Regular Season" and similar all count), so write-ups land in
 * the year they're actually for instead of always the newest section.
 *
 * When no such heading exists yet, the season section needs to be created —
 * signaled by `createSeasonHeading: true` — and `insertAt` falls back to the
 * very end of the document, where the new section gets appended.
 */
export function findSeasonSectionInsertPoint(
  paragraphs: DocParagraph[],
  docEndIndex: number,
  season: string
): { insertAt: number; createSeasonHeading: boolean } {
  const headings = paragraphs.filter((p) => isHeadingStyle(p.headingStyle));
  const seasonIndex = headings.findIndex((p) => {
    const text = p.text.trim();
    return text === season || text.startsWith(`${season} `);
  });

  if (seasonIndex === -1) {
    return { insertAt: docEndIndex - 1, createSeasonHeading: true };
  }

  // Insert right before whatever heading comes next — that's the boundary of
  // this season's section — or at the doc's end if this season is the last
  // section in the doc.
  const next = headings[seasonIndex + 1];
  return { insertAt: next ? next.startIndex : docEndIndex - 1, createSeasonHeading: false };
}

/**
 * Pure index math for inserting a write-up at a known position: separates
 * from any network call so the offsets can be unit tested directly.
 *
 * The write-up's own first line (e.g. "🚨📋 Week 5 Recap") becomes a
 * Heading 1 paragraph, matching every other week's entry in the doc; the
 * rest is inserted as plain text underneath it. Two blank lines separate it
 * from whatever precedes it at `insertAt`.
 */
export function buildInsertRequests(
  insertAt: number,
  body: string
): { text: string; requests: DocsBatchUpdateRequest[] } {
  const newlineIndex = body.indexOf("\n");
  const heading = newlineIndex === -1 ? body : body.slice(0, newlineIndex);
  const rest = newlineIndex === -1 ? "" : body.slice(newlineIndex + 1);

  const text = `\n\n${heading}\n${rest}\n`;
  const headingStart = insertAt + 2;
  const headingEnd = headingStart + heading.length;

  return {
    text,
    requests: [
      { insertText: { location: { index: insertAt }, text } },
      {
        updateParagraphStyle: {
          range: { startIndex: headingStart, endIndex: headingEnd },
          paragraphStyle: { namedStyleType: "HEADING_1" },
          fields: "namedStyleType",
        },
      },
    ],
  };
}

/**
 * Google Docs' body always ends with an implicit trailing newline that can't
 * be written over — appending at the very end must land at `endIndex - 1`,
 * one before it. Thin wrapper over buildInsertRequests for that specific case.
 */
export function buildAppendRequests(
  docEndIndex: number,
  body: string
): { text: string; requests: DocsBatchUpdateRequest[] } {
  return buildInsertRequests(docEndIndex - 1, body);
}

/**
 * Same as buildInsertRequests, but also creates the season heading itself —
 * used the first time a write-up for a season is saved and no section for it
 * exists yet in the doc.
 */
export function buildNewSeasonSectionRequests(
  insertAt: number,
  season: string,
  body: string
): { text: string; requests: DocsBatchUpdateRequest[] } {
  const newlineIndex = body.indexOf("\n");
  const heading = newlineIndex === -1 ? body : body.slice(0, newlineIndex);
  const rest = newlineIndex === -1 ? "" : body.slice(newlineIndex + 1);

  const text = `\n\n${season}\n\n${heading}\n${rest}\n`;
  const seasonStart = insertAt + 2;
  const seasonEnd = seasonStart + season.length;
  const headingStart = seasonEnd + 2;
  const headingEnd = headingStart + heading.length;

  return {
    text,
    requests: [
      { insertText: { location: { index: insertAt }, text } },
      {
        updateParagraphStyle: {
          range: { startIndex: seasonStart, endIndex: seasonEnd },
          paragraphStyle: { namedStyleType: "HEADING_1" },
          fields: "namedStyleType",
        },
      },
      {
        updateParagraphStyle: {
          range: { startIndex: headingStart, endIndex: headingEnd },
          paragraphStyle: { namedStyleType: "HEADING_1" },
          fields: "namedStyleType",
        },
      },
    ],
  };
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

interface DocsContentElementResponse {
  startIndex?: number;
  endIndex?: number;
  paragraph?: {
    paragraphStyle?: { namedStyleType?: string };
    elements?: { textRun?: { content?: string } }[];
  };
}

function parseParagraphs(content: DocsContentElementResponse[]): DocParagraph[] {
  const paragraphs: DocParagraph[] = [];
  for (const el of content) {
    if (!el.paragraph || el.startIndex === undefined || el.endIndex === undefined) continue;
    const text = (el.paragraph.elements ?? []).map((e) => e.textRun?.content ?? "").join("");
    paragraphs.push({
      startIndex: el.startIndex,
      endIndex: el.endIndex,
      text,
      headingStyle: el.paragraph.paragraphStyle?.namedStyleType ?? null,
    });
  }
  return paragraphs;
}

async function fetchDocStructure(
  documentId: string,
  accessToken: string
): Promise<{ paragraphs: DocParagraph[]; docEndIndex: number }> {
  const res = await docsFetch(
    `/v1/documents/${documentId}?fields=body.content(startIndex,endIndex,paragraph(paragraphStyle.namedStyleType,elements(textRun.content)))`,
    accessToken
  );
  const doc = (await res.json()) as { body?: { content?: DocsContentElementResponse[] } };
  const content = doc.body?.content ?? [];
  const last = content.at(-1);
  if (!last?.endIndex) throw new Error("Couldn't read the document's content — is the doc empty?");
  return { paragraphs: parseParagraphs(content), docEndIndex: last.endIndex };
}

/**
 * Appends `body` (the recap editor's current text) under the given season's
 * section of the doc — found by matching a heading against `season` — rather
 * than always at the very end, so a preseason or early-week write-up lands
 * with its own year instead of under whatever season was written last. If
 * that season has no section yet, one is created (a heading reading exactly
 * `season`) at the end of the doc.
 */
export async function appendWriteupToDoc(
  documentId: string,
  body: string,
  accessToken: string,
  season: string
): Promise<void> {
  const { paragraphs, docEndIndex } = await fetchDocStructure(documentId, accessToken);
  const { insertAt, createSeasonHeading } = findSeasonSectionInsertPoint(paragraphs, docEndIndex, season);
  const { requests } = createSeasonHeading
    ? buildNewSeasonSectionRequests(insertAt, season, body)
    : buildInsertRequests(insertAt, body);
  await docsFetch(`/v1/documents/${documentId}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}
