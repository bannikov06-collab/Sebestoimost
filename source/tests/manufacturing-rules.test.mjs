import assert from "node:assert/strict";
import test from "node:test";
import { calculatePeEarBlank, getJointRule } from "../app/lib/manufacturingRules.ts";

test("PE ear designation and L follow the confirmed busway height", () => {
  assert.equal(calculatePeEarBlank(400)?.designation, "260.045-20");
  assert.equal(calculatePeEarBlank(400)?.lengthMm, 69);
  assert.equal(calculatePeEarBlank(2000)?.designation, "260.045-08");
  assert.equal(calculatePeEarBlank(2000)?.lengthMm, 239);
  assert.equal(calculatePeEarBlank(6300)?.lengthMm, 826);
});

test("G joint combines the assembly drawing and Excel connector composition", () => {
  const joint = getJointRule(2000);
  assert.equal(joint?.designation, "G.001.000-06");
  assert.equal(joint?.connectorDesignation, "012.001.000-06");
  assert.equal(joint?.heightMm, 239);
  assert.equal(joint?.totalMassKg, 5.1);
  assert.equal(joint?.components.find((item) => /M6×12/.test(item.name))?.quantity, 8);
  assert.equal(joint?.components.find((item) => /M12×130/.test(item.name))?.quantity, 3);
});

test("500A joint remains unassigned because its G specification was not supplied", () => {
  assert.equal(calculatePeEarBlank(500)?.designation, "260.045-21");
  assert.equal(getJointRule(500), undefined);
});

test("G joints support both confirmed 6 mm and 7 mm busbars", () => {
  assert.deepEqual(getJointRule(800)?.supportedBusbarThicknessMm, [6, 7]);
});
