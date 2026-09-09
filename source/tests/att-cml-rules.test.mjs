import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAtt,
  calculateCml3200,
  CML_3200_STANDARD_OVERALL_MM,
  KSHA_PLATES_PER_UNIT,
  selectThermalShrink,
} from "../app/lib/attCmlRules.ts";

test("CML 3200 standard geometry produces 8 material KSHA and 4 mounting nodes", () => {
  const result = calculateCml3200(CML_3200_STANDARD_OVERALL_MM, 4);
  assert.equal(result.flexibleMm, 150);
  assert.equal(result.kshaCount, 8);
  assert.equal(result.mountingNodeCount, 4);
  assert.equal(result.platesPerKsha, 26);
  assert.equal(result.kshaCount * result.platesPerKsha, 208);
  assert.ok(Math.abs(result.tapeLengthM - 2.4) < 1e-9);
  assert.ok(Math.abs(result.thermalShrinkLengthM - 1.44) < 1e-9);
});

test("CML overall-length delta is transferred one-to-one only to flexible KSHA length", () => {
  assert.equal(calculateCml3200(1600, 4).flexibleMm, 250);
  assert.equal(calculateCml3200(1700, 4).flexibleMm, 350);
});

test("KSHA reserve rounds 0.3 mm AD1M plates upward", () => {
  assert.equal(KSHA_PLATES_PER_UNIT, 26);
  const result = calculateCml3200(1500, 4);
  assert.ok(Math.abs(result.flexibleMassKg - 4.04352) < 1e-6);
});

test("thermal shrink is selected by inclusive range and 160 mm uses 180/58", () => {
  const selected = selectThermalShrink(160);
  assert.equal(selected.code, "0T-00130010");
  assert.match(selected.name, /180\/58/);
  assert.equal(selectThermalShrink(200).code, "");
});

test("ATT approved currents keep exactly four output conductors independent of packs", () => {
  const a1000 = calculateAtt(1000, 4);
  const a3200 = calculateAtt(3200, 4);
  const a5000 = calculateAtt(5000, 4);
  assert.equal(a1000?.outputBusCount, 4);
  assert.equal(a3200?.outputBusCount, 4);
  assert.equal(a5000?.outputBusCount, 4);
  assert.equal(a3200?.packs, 2);
  assert.equal(a5000?.packs, 4);
  assert.equal(a3200?.insulatorCount, 4);
  assert.equal(a5000?.multiPackBlankMm, 682);
  assert.equal(a5000?.polycarbonateReferenceMm, 762);
});

test("ATT does not invent unsupported nominals or 5P model", () => {
  assert.equal(calculateAtt(2500, 4), null);
  assert.equal(calculateAtt(3200, 5), null);
});
