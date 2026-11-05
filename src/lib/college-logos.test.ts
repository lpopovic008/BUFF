import test from "node:test";
import assert from "node:assert/strict";
import { collegeKey } from "./college-logos";

test("college names compare by their letters, St. as State, no University", () => {
  assert.equal(collegeKey("Ohio St."), "ohiostate");
  assert.equal(collegeKey("Ohio State"), "ohiostate");
  assert.equal(collegeKey("University of Texas"), "texas");
  assert.equal(collegeKey("Miami (FL)"), "miamifl");
  assert.equal(collegeKey("Texas A&M"), "texasaandm");
});
