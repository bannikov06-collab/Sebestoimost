import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("calculator exposes three nominal scenarios", () => {
  assert.match(page, /На 1 номинал ниже/);
  assert.match(page, /На 2 номинала ниже/);
  assert.match(page, /applyNominalScenario/);
});

test("project resource specification is exported to Excel", () => {
  assert.match(page, /Выгрузить ресурсную спецификацию в Excel/);
  assert.match(page, /Ресурсная спецификация/);
  assert.match(page, /Заготовки по 3 м, шт\./);
  assert.match(page, /Масса, кг/);
});

test("joint G uses an expandable element card", () => {
  assert.match(page, /Стыковочный элемент G/);
  assert.match(page, /Показать ресурсную спецификацию/);
  assert.match(page, /L1 \/ L2 \/ L3/);
});

test("control circuit precedes the element workspace and resource summary", () => {
  const control = page.indexOf("<ControlCalculationPanel", page.indexOf('active === "calc"'));
  const elements = page.indexOf('className="layout"', control);
  const resources = page.indexOf("Сводный ресурсный состав", elements);
  assert.ok(control >= 0 && elements > control && resources > elements);
});
