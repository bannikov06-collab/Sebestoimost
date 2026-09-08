import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  calculateJointMaterialLines,
  parseJointSpecificationRow,
} from "../app/lib/manufacturingRules.ts";
import {
  calculateSidewallSheetMassKg,
  selectSidewallResource,
} from "../app/lib/sidewallRules.ts";
import {
  isDiscontinuedSintokarton,
  procurementMaterialGroup,
  procurementOrderCost,
  procurementOrderQuantity,
  sortProcurementRows,
  summarizeComposition,
} from "../app/lib/procurementExportRules.ts";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const planning = fs.readFileSync(new URL("../app/components/MaterialsPlanningPanel.tsx", import.meta.url), "utf8");
const materialPlanning = fs.readFileSync(new URL("../app/lib/materialPlanning.ts", import.meta.url), "utf8");
const preliminaryUrl = new URL("../app/components/PreliminarySpecificationPanel.tsx", import.meta.url);

test("procurement can switch between warehouse shortage and full demand", () => {
  const row = { name: "Шина АД0", stock: { name: "Шина АД0" }, demand: 10, shortage: 4, requiredOrder: 4, unitPrice: 500 };
  assert.equal(procurementOrderQuantity(row, "with-stock"), 4);
  assert.equal(procurementOrderCost(row, "with-stock"), 2000);
  assert.equal(procurementOrderQuantity(row, "without-stock"), 10);
  assert.equal(procurementOrderCost(row, "without-stock"), 5000);
  assert.equal(procurementOrderQuantity({ ...row, stock: undefined }, "with-stock"), 10);
  assert.match(planning, /С учётом складских остатков/);
  assert.match(planning, /Без учёта складских остатков/);
});

test("supply rows are ordered busbar, profile, sheet, then other materials", () => {
  const base = { demand: 1, shortage: 1, requiredOrder: 1, unitPrice: 1 };
  const rows = sortProcurementRows([
    { ...base, name: "Болт" },
    { ...base, name: "Лист алюминиевый" },
    { ...base, name: "Профиль АП 4977" },
    { ...base, name: "Шина АД0 6×200" },
  ]);
  assert.deepEqual(rows.map(procurementMaterialGroup), ["01 · Шина", "02 · Профиль", "03 · Лист", "04 · Прочие материалы"]);
  assert.match(planning, /Стоимость за единицу, руб\./);
});

test("aluminium sheet conversion uses mass and rounds pieces upward", () => {
  assert.match(materialPlanning, /const ALUMINIUM_DENSITY_KG_M3 = 2710/);
  const sheet2mmKg = 0.002 * 1.2 * 3 * 2710;
  const sheet3mmKg = 0.003 * 1.2 * 3 * 2710;
  assert.ok(Math.abs(sheet2mmKg - 19.512) < 1e-9);
  assert.ok(Math.abs(sheet3mmKg - 29.268) < 1e-9);
  assert.equal(Math.ceil(20 / sheet2mmKg), 2);
  assert.match(materialPlanning, /pieces: Math\.ceil\(massKg \/ massPerSheetKg\)/);
});

test("export composition summarizes sections, KOM and joints with calculation coverage", () => {
  const summary = summarizeComposition([
    { orderLabel: "Заказ 1", kind: "Секция", component: "FE", article: "40.FE.4P", nominalA: 4000, poles: "4P", quantity: 2, calculated: true },
    { orderLabel: "Заказ 1", kind: "Секция", component: "FE", article: "40.FE.4P", nominalA: 4000, poles: "4P", quantity: 3, calculated: true },
    { orderLabel: "Заказ 1", kind: "КОМ", component: "КОМ 400 А", article: "BB-400", nominalA: 400, poles: "—", quantity: 4, calculated: false },
    { orderLabel: "Заказ 1", kind: "Стык", component: "G", article: "G.005.000-09", nominalA: 4000, poles: "5P", quantity: 1, calculated: true },
  ]);
  assert.equal(summary.find((row) => row.kind === "Секция")?.quantity, 5);
  assert.equal(summary.find((row) => row.kind === "Секция")?.calculatedQuantity, 5);
  assert.equal(summary.find((row) => row.kind === "КОМ")?.uncalculatedQuantity, 4);
  assert.equal(summary.find((row) => row.kind === "Стык")?.nominalA, 4000);
  assert.match(planning, /КОНТРОЛЬНЫЙ СОСТАВ ПРОЕКТА/);
});

test("sintokarton is excluded from costing, planning and stock seed", () => {
  assert.equal(isDiscontinuedSintokarton("Плёнкосинтокартон ПСК-515"), true);
  assert.doesNotMatch(page, /Ц0000056495|ПСК-515|Плёнкосинтокартон/);
  assert.doesNotMatch(planning.split("export const initialStock")[1].split("];", 1)[0], /Ц0000056495|ПСК-515|Пленкосинтокартон/);
  assert.doesNotMatch(materialPlanning, /пленкосинтокартон/);
});

test("4000 A with two 6x200 buses per phase selects AP 4977 at 203 mm", () => {
  const sidewall = selectSidewallResource({
    family: "FE",
    currentA: 4000,
    busHeightMm: 200,
    busThicknessMm: 6,
    packagesPerPhase: 2,
    familyRequiresSheet: false,
  });
  assert.equal(sidewall.kind, "profile");
  assert.equal(sidewall.code, "Ц0000077016");
  assert.equal(sidewall.designation.includes("АП 4977"), true);
  assert.equal(sidewall.heightMm, 203);
  assert.match(sidewall.basis, /2 шт\.\/фазу/);
});

test("unmatched bus height uses sheet at bus height plus 3 mm", () => {
  const sidewall = selectSidewallResource({
    family: "FE",
    currentA: 2500,
    busHeightMm: 130,
    busThicknessMm: 6,
    packagesPerPhase: 2,
    familyRequiresSheet: false,
  });
  assert.equal(sidewall.kind, "sheet");
  assert.equal(sidewall.code, "Ц0000070687");
  assert.equal(sidewall.heightMm, 133);
  assert.ok(Math.abs(calculateSidewallSheetMassKg(sidewall, 3) - 4.3092) < 1e-9);
});

test("family sheet rule takes precedence even at 200 mm", () => {
  const sidewall = selectSidewallResource({
    family: "CD",
    currentA: 4000,
    busHeightMm: 200,
    busThicknessMm: 6,
    packagesPerPhase: 2,
    familyRequiresSheet: true,
  });
  assert.equal(sidewall.kind, "sheet");
  assert.equal(sidewall.heightMm, 203);
});

test("calculator no longer hardcodes AP 4976 as the fallback sidewall", () => {
  assert.match(page, /selectSidewallResource/);
  assert.match(page, /sidewallResource\.code/);
  assert.doesNotMatch(page, /Ц0000077015 · Профиль алюминиевый АП 4976/);
});

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
