import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAppendRequests,
  buildInsertRequests,
  buildNewSeasonSectionRequests,
  findSeasonSectionInsertPoint,
  DocParagraph,
} from "./google-docs";

test("inserts at one before the doc's end index, ahead of the implicit trailing newline", () => {
  const { requests } = buildAppendRequests(100, "🚨📋 Week 5 Recap\nsome body text");
  assert.equal(requests[0].insertText?.location.index, 99);
});

test("styles only the first line as a heading, leaving the rest as plain text", () => {
  const body = "🚨📋 Week 5 Recap\nline two\nline three";
  const { text, requests } = buildAppendRequests(100, body);
  const heading = "🚨📋 Week 5 Recap";

  assert.equal(text, `\n\n${heading}\nline two\nline three\n`);

  const headingRequest = requests[1].updateParagraphStyle!;
  assert.equal(headingRequest.paragraphStyle.namedStyleType, "HEADING_1");
  // The heading range should land exactly on "🚨📋 Week 5 Recap" within the
  // inserted text: index 99 (insert point) + 2 (leading blank lines) = 101.
  assert.equal(headingRequest.range.startIndex, 101);
  assert.equal(headingRequest.range.endIndex, 101 + heading.length);

  // Confirm that range actually bounds just the heading substring within
  // the full document once inserted (docEndIndex - 1 is where `text` starts).
  const insertAt = requests[0].insertText!.location.index;
  const headingInDoc = text.slice(
    headingRequest.range.startIndex - insertAt,
    headingRequest.range.endIndex - insertAt
  );
  assert.equal(headingInDoc, heading);
});

test("handles a single-line body with no trailing content", () => {
  const { text, requests } = buildAppendRequests(50, "Just a heading, nothing else");
  assert.equal(text, "\n\nJust a heading, nothing else\n\n");
  const headingRequest = requests[1].updateParagraphStyle!;
  assert.equal(headingRequest.range.startIndex, 51);
  assert.equal(headingRequest.range.endIndex, 51 + "Just a heading, nothing else".length);
});

test("buildInsertRequests inserts at an arbitrary interior index, not just doc end", () => {
  const { requests } = buildInsertRequests(250, "🚨📋 Week 1 Recap\nbody");
  assert.equal(requests[0].insertText?.location.index, 250);
});

function heading(startIndex: number, text: string): DocParagraph {
  return { startIndex, endIndex: startIndex + text.length + 1, text, headingStyle: "HEADING_1" };
}

function bodyText(startIndex: number, text: string): DocParagraph {
  return { startIndex, endIndex: startIndex + text.length + 1, text, headingStyle: null };
}

test("finds the matching season heading and inserts before the next section", () => {
  const paragraphs = [
    heading(10, "2025"),
    bodyText(20, "🚨📋 2025 Preseason\n...stuff..."),
    heading(200, "2026"),
    bodyText(210, "🚨📋 Week 1 Recap\n...stuff..."),
  ];
  const { insertAt, createSeasonHeading } = findSeasonSectionInsertPoint(paragraphs, 500, "2026");
  assert.equal(createSeasonHeading, false);
  // 2026 is the last section in the doc, so it lands at the doc's end.
  assert.equal(insertAt, 499);
});

test("inserts inside an earlier season's section, before the next season heading, not at doc end", () => {
  const paragraphs = [
    heading(10, "2025"),
    bodyText(20, "🚨📋 2025 Preseason\n...stuff..."),
    heading(200, "2026"),
    bodyText(210, "🚨📋 Week 1 Recap\n...stuff..."),
  ];
  const { insertAt, createSeasonHeading } = findSeasonSectionInsertPoint(paragraphs, 500, "2025");
  assert.equal(createSeasonHeading, false);
  assert.equal(insertAt, 200); // right before the 2026 heading, not the doc's end
});

test("matches a heading that starts with the season, not just an exact match", () => {
  const paragraphs = [heading(10, "2026 Season")];
  const { createSeasonHeading } = findSeasonSectionInsertPoint(paragraphs, 100, "2026");
  assert.equal(createSeasonHeading, false);
});

test("a bare mention of the season in body text doesn't count as its section heading", () => {
  const paragraphs = [bodyText(10, "back in 2026 we...")];
  const { createSeasonHeading } = findSeasonSectionInsertPoint(paragraphs, 100, "2026");
  assert.equal(createSeasonHeading, true);
});

test("no matching season heading at all falls back to creating a new section at the doc's end", () => {
  const paragraphs = [heading(10, "2025"), bodyText(20, "🚨📋 2025 Preseason\n...")];
  const { insertAt, createSeasonHeading } = findSeasonSectionInsertPoint(paragraphs, 300, "2026");
  assert.equal(createSeasonHeading, true);
  assert.equal(insertAt, 299);
});

test("buildNewSeasonSectionRequests styles both the season heading and the entry heading", () => {
  const { text, requests } = buildNewSeasonSectionRequests(100, "2026", "🚨📋 Week 1 Recap\nbody text");
  assert.equal(text, "\n\n2026\n\n🚨📋 Week 1 Recap\nbody text\n");
  assert.equal(requests.length, 3);

  const seasonStyle = requests[1].updateParagraphStyle!;
  assert.equal(seasonStyle.paragraphStyle.namedStyleType, "HEADING_1");
  assert.equal(text.slice(seasonStyle.range.startIndex - 100, seasonStyle.range.endIndex - 100), "2026");

  const entryStyle = requests[2].updateParagraphStyle!;
  assert.equal(
    text.slice(entryStyle.range.startIndex - 100, entryStyle.range.endIndex - 100),
    "🚨📋 Week 1 Recap"
  );
});
