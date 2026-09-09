import test from "node:test";
import assert from "node:assert/strict";
import { getCalculationCoverage, normalizeElementFamily } from "../app/lib/calculationCoverage.ts";

test("ordinary approved section families are calculated", () => {
  for (const family of ["FE", "CD", "CP", "ZD", "ZP", "TP", "ZDP", "TD", "ATCP", "ATCD"]) {
    assert.equal(getCalculationCoverage(family).status, "calculated");
  }
});

test("G is calculated only as its own specification row", () => {
  const result = getCalculationCoverage("G");
  assert.equal(result.status, "calculated");
  assert.match(result.reason, /отдельной строки G/i);
});

test("ATSC remains a separate partial calculation until its own BOM is complete", () => {
  const result = getCalculationCoverage("ATSC");
  assert.equal(result.status, "partial");
  assert.ok(result.required.some((item) => /BOM/i.test(item)));
});

test("ATT and CML now expose approved partial models without spreading to composite families", () => {
  assert.equal(getCalculationCoverage("ATT").status, "partial");
  assert.equal(getCalculationCoverage("CML").status, "partial");
  assert.match(getCalculationCoverage("ATT").reason, /1000\/3200\/5000/);
  assert.match(getCalculationCoverage("CML").reason, /3200/);
  assert.equal(getCalculationCoverage("ATT+ZP").status, "missing");
  assert.equal(getCalculationCoverage("CML+CD").status, "missing");
});

test("family detector recognizes long catalog codes first", () => {
  const known = ["ATT", "ATT+ZP", "CML", "CML+CD"];
  assert.equal(normalizeElementFamily("KLM-S-ATT+ZP-2500", known), "ATT+ZP");
  assert.equal(normalizeElementFamily("KLM-S-CML+CD-1600", known), "CML+CD");
});
