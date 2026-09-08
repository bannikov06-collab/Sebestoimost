import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const materials = fs.readFileSync(new URL("../app/components/MaterialsPlanningPanel.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const installer = fs.readFileSync(new URL("../../APPLY_KLM_CHANGE_05P.ps1", import.meta.url), "utf8");

test("selected nominal flows to requirements, procurement and reservations", () => {
  assert.match(page, /orderToSelectedNominal/);
  assert.match(page, /combinedProjectItems/);
  assert.match(page, /comparisonComponents=\{procurementComparisonComponents\}/);
  assert.match(page, /selectedProductionProjects\.includes\(key\)\?orderToSelectedNominal\(order\):orderToElements\(order\)/);
});

test("requirements Excel contains the full availability ledger", () => {
  assert.match(materials, /downloadRequirementsXlsx/);
  for (const heading of ["Требуется", "На складе", "В резерве", "Свободно на складе", "В дороге", "Оплачено", "В производстве у поставщика", "Доступно всего", "Дефицит", "Потребуется заказать", "Статус"]) assert.match(materials, new RegExp(heading));
});

test("comparison workbook has purchase, warehouse, budget, nominal and replacement sections", () => {
  assert.match(materials, /downloadProcurementComparisonXlsx/);
  assert.match(materials, /РАЗДЕЛ 1\. НОМЕНКЛАТУРА ДЛЯ ЗАКУПКИ/);
  assert.match(materials, /РАЗДЕЛ 2\. НАЛИЧИЕ НА СКЛАДЕ И В ПОСТАВКАХ/);
  assert.match(materials, /РАЗДЕЛ 3\. ИТОГОВЫЙ ОБЪЁМ И БЮДЖЕТ ЗАКУПКИ/);
  assert.match(materials, /Номиналы комплектующих/);
  assert.match(materials, /Позиции для замены/);
  assert.match(materials, /Бюджет и приоритетные позиции/);
  assert.match(materials, /procurementPriority/);
});

test("light and dark themes define complete semantic contrast palettes", () => {
  for (const token of ["--panel", "--panel-soft", "--text", "--accent", "--accent-soft", "--notice-bg", "--notice-text", "--focus"]) assert.match(css, new RegExp(token));
  assert.match(css, /\.theme-dark \.multi-spec-list label/);
  assert.match(css, /\.notice\{background:var\(--notice-bg\)!important;color:var\(--notice-text\)!important/);
});

test("installer discovers the existing KLM source across Windows profiles", () => {
  assert.match(installer, /C:\\Users\\Adm-KLM\\KLM-v32-recovery\\source/);
  assert.match(installer, /Get-ChildItem -LiteralPath \$ProfilesRoot -Directory/);
  assert.match(installer, /Paste the full path to the working KLM source folder/);
  assert.match(installer, /npm\.cmd install --no-audit --no-fund/);
  assert.match(installer, /node_modules\\vinext\\dist\\cli\.js/);
});
