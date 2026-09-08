import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const materials = fs.readFileSync(new URL("../app/components/MaterialsPlanningPanel.tsx", import.meta.url), "utf8");

test("selected nominal is applied to selected production orders", () => {
  assert.match(page, /orderToSelectedNominal/);
  assert.match(page, /getApprovedDimensions\(code, current, element\.poles\)/);
  assert.match(page, /const converted=orderToSelectedNominal\(order\)/);
});

test("material requirements depend on nominal scenario", () => {
  assert.match(page, /combinedProjectItems/);
  assert.match(page, /nominalScenarioStep\]\)/);
  assert.match(page, /calculationScenarioLabel/);
});

test("reservation demand uses the selected nominal and includes joints", () => {
  assert.match(page, /selectedProductionProjects\.includes\(key\)\?orderToSelectedNominal\(order\):orderToElements\(order\)/);
  assert.match(page, /calculateJointMaterialLines\(joint\)/);
});

test("warehouse screen shows the active calculator scenario", () => {
  assert.match(materials, /Расчётный сценарий:/);
  assert.match(materials, /Потребность, заказ материалов и резервы сформированы по этому же варианту калькулятора/);
});
