import test from "node:test";
import assert from "node:assert/strict";
import { buildAppendRequests, buildInsertRequests, resolveTargetTab, weekTabTitle, DocTab } from "./google-docs";

test("inserts at one before the doc's end index, ahead of the implicit trailing newline", () => {
  const { requests } = buildAppendRequests(100, "🚨📋 Week 5 Recap\nsome body text");
  assert.equal(requests[0].insertText.location.index, 99);
});

test("inserts the write-up as plain text, no heading styling — just two blank lines before it", () => {
  const body = "🚨📋 Week 5 Recap\nline two\nline three";
  const { text, requests } = buildAppendRequests(100, body);

  assert.equal(text, `\n\n${body}\n`);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].insertText.text, text);
});

test("handles a single-line body with no trailing content", () => {
  const { text } = buildAppendRequests(50, "Just one line, nothing else");
  assert.equal(text, "\n\nJust one line, nothing else\n");
});

test("no tabId is attached when the doc has no tabs", () => {
  const { requests } = buildAppendRequests(50, "Heading\nbody");
  assert.equal(requests[0].insertText.location.tabId, undefined);
});

test("the request carries the target tab's id when one is given", () => {
  const { requests } = buildInsertRequests(50, "Heading\nbody", "tab-week-1");
  assert.equal(requests[0].insertText.location.tabId, "tab-week-1");
});

test("weekTabTitle names the child tab a weekly recap belongs in", () => {
  assert.equal(weekTabTitle(1), "Week 1");
  assert.equal(weekTabTitle(12), "Week 12");
});

function tab(title: string, docEndIndex: number, childTabs: DocTab[] = []): DocTab {
  return { tabId: title, title, docEndIndex, childTabs };
}

test("finds the season tab and, for a weekly recap, its Week N child tab", () => {
  const tabs = [
    tab("2025", 50, [tab("Week 1", 30)]),
    tab("2026", 60, [tab("Week 1", 40), tab("Week 2", 20)]),
  ];
  const resolved = resolveTargetTab(tabs, "2026", 2);
  assert.deepEqual(resolved, { tab: tab("Week 2", 20) });
});

test("a preseason write-up (week null) saves straight into the season tab, not a child tab", () => {
  const tabs = [tab("2026", 60, [tab("Week 1", 40)])];
  const resolved = resolveTargetTab(tabs, "2026", null);
  assert.deepEqual(resolved, { tab: tab("2026", 60, [tab("Week 1", 40)]) });
});

test("matches a tab title that starts with the season, not just an exact match", () => {
  const tabs = [tab("2026 Season", 60)];
  const resolved = resolveTargetTab(tabs, "2026", null);
  assert.equal("error" in resolved, false);
});

test("no matching season tab reports back which tab to create, rather than misfiling", () => {
  const tabs = [tab("2025", 50)];
  const resolved = resolveTargetTab(tabs, "2026", null);
  assert.deepEqual(resolved, { error: 'Couldn\'t find a "2026" tab in this Doc — create it, then try again.' });
});

test("a season tab with no matching week child tab reports back which one to create", () => {
  const tabs = [tab("2026", 60, [tab("Week 1", 40)])];
  const resolved = resolveTargetTab(tabs, "2026", 5);
  assert.deepEqual(resolved, {
    error: 'Couldn\'t find a "Week 5" tab under "2026" — create it, then try again.',
  });
});
