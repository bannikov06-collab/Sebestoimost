import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  calculateJointMaterialLines,
  parseJointSpecificationRow,
} from "../app/lib/manufacturingRules.ts";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const preliminaryUrl = new URL("../app/components/PreliminarySpecificationPanel.tsx", import.meta.url);

test("5P keeps section geometry and insulates only A/B/C/N", () => {
  assert.match(page, /const insulatedBarsTotal = 4 \* cfg\.count/);
  assert.match(page, /const insulationShare = barsTotal > 0 \? insulatedBarsTotal \/ barsTotal : 1/);
  assert.match(page, /calculatePetMassKg\(geometry\) \* insulationShare/);
  assert.match(page, /geometry\.tapeLengthM \* insulationShare/);
  assert.match(page, /Шина PE в 5P не изолируется/);
  assert.doesNotMatch(page, /if \(articleParts\[5\] === "5"\)/);
});

test("POS grows by one per physical PE bus while 4P base remains 0.144 kg", () => {
  assert.match(page, /const posPerBusKg = 0\.144 \/ 4/);
  assert.match(page, /const posQtyKg = posPerBusKg \* barsTotal/);
  assert.match(page, /qty: posQtyKg/);
  assert.match(page, /для 5P добавлена одна шина PE/);
});

test("5P joint is recognized separately and keeps zero L1 L2 L3", () => {
  const row = parseJointSpecificationRow({ article: "G.005.000-06", item: "Стык G 2000 А 5P", quantity: 2 });
  assert.ok(row);
  assert.equal(row.currentA, 2000);
  assert.equal(row.poles, 5);
  assert.deepEqual(row.dimensionsMm, [0, 0, 0]);

  const lines = calculateJointMaterialLines(row);
  assert.equal(lines.find((line) => line.name.includes("Шина стыка"))?.qty, 20);
  assert.equal(lines.find((line) => line.name.includes("Изолятор"))?.qty, 10);
  assert.equal(lines.find((line) => line.name === "Втулка")?.designation, "03.212.001-04");
  assert.equal(lines.find((line) => line.name.includes("M12×140"))?.qty, 6);
  assert.ok(lines.every((line) => line.basis.includes("G.005.000-06") && line.basis.includes("012.003.000-06")));
});

test("4P joint remains on its own design specification", () => {
  const row = parseJointSpecificationRow({ article: "G.001.000-06", item: "Стык G 2000 А 4P", quantity: 1 });
  assert.ok(row);
  assert.equal(row.poles, 4);
  const lines = calculateJointMaterialLines(row);
  assert.equal(lines.find((line) => line.name.includes("Шина стыка"))?.qty, 8);
  assert.equal(lines.find((line) => line.name.includes("Изолятор"))?.qty, 4);
  assert.equal(lines.find((line) => line.name === "Втулка")?.designation, "03.212.001-03");
  assert.equal(lines.find((line) => line.name.includes("M12×130"))?.qty, 3);
});

test("preliminary calculation no longer blocks 5P", (t) => {
  if (!fs.existsSync(preliminaryUrl)) return t.skip("component is supplied by the installed 05P source");
  const preliminary = fs.readFileSync(preliminaryUrl, "utf8");
  assert.doesNotMatch(preliminary, /Позиции 5P не рассчитываются/);
  assert.doesNotMatch(preliminary, /\(hasCopperRows \|\| hasFivePoleRows\)/);
});
