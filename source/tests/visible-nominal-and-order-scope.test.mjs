import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const materials = fs.readFileSync(new URL("../app/components/MaterialsPlanningPanel.tsx", import.meta.url), "utf8");

test("nominal selector is a top-level calculator window before control", () => {
  const calc = page.indexOf('active === "calc"');
  const selector = page.indexOf("Выбор расчётного номинала", calc);
  const control = page.indexOf("<ControlCalculationPanel", calc);
  assert.ok(selector > calc && selector < control);
  assert.match(page, /На 1 номинал ниже/);
  assert.match(page, /На 2 номинала ниже/);
});

test("nominal scenario recalculates from a stable source current", () => {
  assert.match(page, /nominalBaseCurrents/);
  assert.match(page, /getApprovedDimensions\(code, current, row\.poles\)/);
  assert.match(page, /calculateElement\(e, laborRate, catalog\)/);
});

test("multi-order exports enumerate every selected order", () => {
  assert.match(page, /selectedProductionOrderLabels/);
  assert.match(materials, /Проекты \/ заказы расчёта/);
  assert.match(materials, /Состав выгрузки/);
  assert.match(materials, /orderLabels\.join\("\\n"\)/);
});

test("cumulative 05M functions remain included", () => {
  assert.match(page, /consolidateConvertedOrders/);
  assert.match(page, /Рассчитать выбранные спецификации/);
  assert.match(materials, /Выгрузить потребность в Excel/);
});
