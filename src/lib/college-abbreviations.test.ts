import test from "node:test";
import assert from "node:assert/strict";
import { collegeAbbreviation, collegeKey } from "./college-abbreviations";

test("college names compare by their letters, St. as State, no University", () => {
  assert.equal(collegeKey("Ohio St."), "ohiostate");
  assert.equal(collegeKey("Ohio State"), "ohiostate");
  assert.equal(collegeKey("University of Texas"), "texas");
  assert.equal(collegeKey("Miami (FL)"), "miamifl");
  assert.equal(collegeKey("Texas A&M"), "texasaandm");
});

test("the schools on file get their own short name, by any of their names", () => {
  assert.equal(collegeAbbreviation("Texas Tech"), "TTU");
  assert.equal(collegeAbbreviation("Ohio St."), "OSU");
  assert.equal(collegeAbbreviation("Mississippi"), "MISS");
  assert.equal(collegeAbbreviation("Miami (FL)"), "MIA");
  assert.equal(collegeAbbreviation("Miami (OH)"), "M-OH");
  assert.equal(collegeAbbreviation("Louisiana State"), "LSU");
  assert.equal(collegeAbbreviation("Southern California"), "USC");
  assert.equal(collegeAbbreviation("Texas A&M"), "TA&M");
});

test("any other school's short name is made up from its name", () => {
  assert.equal(collegeAbbreviation("Grand Valley State"), "GVS");
  assert.equal(collegeAbbreviation("Ferris State"), "FS");
  assert.equal(collegeAbbreviation("Pittsburg State"), "PS");
  assert.equal(collegeAbbreviation("Wingate"), "WING");
  assert.equal(collegeAbbreviation("SIU"), "SIU");
  assert.equal(collegeAbbreviation(null), null);
  assert.equal(collegeAbbreviation("  "), null);
});
