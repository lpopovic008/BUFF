import test from "node:test";
import assert from "node:assert/strict";
import { buildAppendRequests } from "./google-docs";

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
