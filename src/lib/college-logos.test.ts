import test from "node:test";
import assert from "node:assert/strict";
import { collegeKey, collegeLogo, espnCollegeLogo } from "./college-logos";

test("college names compare by their letters, St. as State, no University", () => {
  assert.equal(collegeKey("Ohio St."), "ohiostate");
  assert.equal(collegeKey("Ohio State"), "ohiostate");
  assert.equal(collegeKey("University of Texas"), "texas");
  assert.equal(collegeKey("Miami (FL)"), "miamifl");
  assert.equal(collegeKey("Texas A&M"), "texasaandm");
});

test("the schools we know get their logo with no lookup, by any of their names", async () => {
  assert.equal(await collegeLogo("Texas Tech"), espnCollegeLogo(2641));
  assert.equal(await collegeLogo("Ohio St."), espnCollegeLogo(194));
  assert.equal(await collegeLogo("Mississippi"), espnCollegeLogo(145));
  assert.equal(await collegeLogo("Miami (FL)"), espnCollegeLogo(2390));
  assert.equal(await collegeLogo("Louisiana State"), espnCollegeLogo(99));
});
