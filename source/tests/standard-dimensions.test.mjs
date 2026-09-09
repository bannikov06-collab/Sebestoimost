import assert from "node:assert/strict";
import test from "node:test";
import { detectPoleCount, getBusStandard, getStandardDimensions } from "../app/lib/standardDimensions.ts";

test("standard workbook drives pack count and bus height", () => {
  assert.equal(getBusStandard(2000, 4)?.packsPerPhase, 1);
  assert.equal(getBusStandard(2500, 4)?.packsPerPhase, 2);
  assert.equal(getBusStandard(5000, 4)?.packsPerPhase, 4);
  assert.equal(getBusStandard(6300, 4)?.barHeight, 160);
  assert.equal(getBusStandard(6300, 4)?.coverWidth, 140);
});

test("ATSC remains its own standard family", () => {
  assert.deepEqual(getStandardDimensions("ATSC", 800, 4), [240, 450]);
  assert.deepEqual(getStandardDimensions("ATSC", 6300, 4), [240, 450]);
  assert.deepEqual(getStandardDimensions("ATSC", 2500, 5), [240, 450]);
});

test("ordinary section standards are read by family/current/pole count", () => {
  assert.deepEqual(getStandardDimensions("CP", 2500, 4), [600, 600]);
  assert.deepEqual(getStandardDimensions("ZD", 800, 4), [435, 415, 435]);
  assert.deepEqual(getStandardDimensions("ATCP", 5000, 4), [825, 1035, 950]);
});

test("pole count is parsed from both Latin and Cyrillic marking", () => {
  assert.equal(detectPoleCount("KLM-AL-20-FE-5P"), 5);
  assert.equal(detectPoleCount("20.FE.5Р"), 5);
  assert.equal(detectPoleCount("KLM-AL-20-FE-4P"), 4);
});
