// Appends a recap write-up to the end of a Google Doc via the Docs API,
// called from the browser with a user-granted OAuth access token (see
// google-auth.ts). No server involved — this is a static site.

export const DOCS_SCOPE = "https://www.googleapis.com/auth/documents";

export interface DocsBatchUpdateRequest {
  insertText?: { location: { index: number }; text: string };
  updateParagraphStyle?: {
    range: { startIndex: number; endIndex: number };
    paragraphStyle: { namedStyleType: string };
    fields: string;
  };
}

/**
 * Pure index math for appending a write-up: separates from any network call
 * so the offsets can be unit tested directly.
 *
 * Google Docs' body always ends with an implicit trailing newline that can't
 * be written over — insertions must land at `endIndex - 1`, one before it.
 * The write-up's own first line (e.g. "🚨📋 Week 5 Recap") becomes a
 * Heading 1 paragraph, matching every other week's entry in the doc; the
 * rest is inserted as plain text underneath it.
 */
export function buildAppendRequests(
  docEndIndex: number,
  body: string
): { text: string; requests: DocsBatchUpdateRequest[] } {
  const insertAt = docEndIndex - 1;
  const newlineIndex = body.indexOf("\n");
  const heading = newlineIndex === -1 ? body : body.slice(0, newlineIndex);
  const rest = newlineIndex === -1 ? "" : body.slice(newlineIndex + 1);

  // Two blank lines separate this entry from whatever precedes it.
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

async function getDocEndIndex(documentId: string, accessToken: string): Promise<number> {
  const res = await docsFetch(
    `/v1/documents/${documentId}?fields=body.content(endIndex)`,
    accessToken
  );
  const doc = (await res.json()) as { body?: { content?: { endIndex?: number }[] } };
  const last = doc.body?.content?.at(-1);
  if (!last?.endIndex) throw new Error("Couldn't read the document's content — is the doc empty?");
  return last.endIndex;
}

/** Appends `body` (the recap editor's current text) to the end of the given doc. */
export async function appendWriteupToDoc(documentId: string, body: string, accessToken: string): Promise<void> {
  const endIndex = await getDocEndIndex(documentId, accessToken);
  const { requests } = buildAppendRequests(endIndex, body);
  await docsFetch(`/v1/documents/${documentId}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}
