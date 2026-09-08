import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const materials = fs.readFileSync(new URL("../app/components/MaterialsPlanningPanel.tsx", import.meta.url), "utf8");

test("repeated specification elements are consolidated", () => {
  assert.match(page, /consolidateConvertedOrders/);
  assert.match(page, /existing\.quantity \+= element\.quantity/);
  assert.match(page, /Повторения по линиям объединены/);
});

test("calculator supports multiple production and preliminary specifications", () => {
  assert.match(page, /selectedCalculatorSpecifications/);
  assert.match(page, /Рассчитать выбранные спецификации/);
  assert.match(page, /Предварительная спецификация/);
});

test("requirements export contains the full availability ledger", () => {
  for (const heading of ["Материал расчёта", "Код позиции", "Требуется", "На складе", "В резерве", "В дороге", "Оплачено", "В производстве у поставщика", "Дефицит", "Потребуется заказать", "Статус"]) {
    assert.ok(materials.includes(heading), `missing ${heading}`);
  }
  assert.match(materials, /wrapText: true/);
  assert.match(materials, /!cols/);
});
