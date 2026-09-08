import assert from "node:assert/strict";
import test from "node:test";
import { calculateBusStock } from "../app/lib/busStock.ts";
import { calculateElement } from "../app/lib/calculation.ts";
import { calculateStockLengthMetrics, matchStock } from "../app/lib/materialPlanning.ts";
import { CONFIRMED_M6X16_DIN6921_CODE, findM6x16Din6921 } from "../app/lib/stockRules.ts";

test("M6x16 DIN 6921 is matched to the confirmed 1C stock item", () => {
  const stock = [
    { name: "Болт М6*16, DIN 6921, с фланцем", article: "", code: CONFIRMED_M6X16_DIN6921_CODE },
    { name: "Болт М6*16, DIN 933", article: "", code: "other" },
  ];
  const result = findM6x16Din6921("Болт с фланцем М6×16 DIN 6921", stock);

  assert.equal(result.length, 1);
  assert.equal(result[0].code, "УТ000003151");
});

test("bus stock quantities are derived from aluminium density and 3m length", () => {
  const result = calculateBusStock({ count: 1, height: 200, thickness: 6 }, 3000);

  assert.equal(result.busLengthM, 12);
  assert.ok(Math.abs(result.busMass - 39.024) < 1e-9);
  assert.ok(Math.abs(result.massPer3m - 9.756) < 1e-9);
  assert.equal(result.equivalent3m, 4);
  assert.equal(result.stockPieces3m, 4);
});

test("CD 1000A follows the supplied drawings and confirmed 1C mapping", () => {
  const result = calculateElement(
    { id: 1, code: "CD", current: 1000, lengths: [435, 435], quantity: 1 },
    20,
  );
  const byCode = new Map(result.items.map((item) => [item.code, item]));

  assert.ok(Math.abs(result.busMass - 4.5) < 1e-9);
  assert.ok(Math.abs(byCode.get("Ц0000070687").qty - 0.9) < 1e-9);
  assert.ok(Math.abs(byCode.get("Ц0000069207").qty - 1.4) < 1e-9);
  assert.ok(Math.abs(byCode.get("УТ000000404").qty - 59.36) < 1e-9);
  assert.equal(byCode.get("00000002130").qty, 0.13);
  assert.equal(byCode.get("00000004273").qty, 0.024);
  assert.equal(result.items.some((item) => /этикет|наклей/i.test(item.name)), false);
});

test("confirmed 1C code has priority over auxiliary material name", () => {
  const result = matchStock(
    { name: "Ц0000059919 · Порошковый материал порошок припойный ПОС 61", unit: "кг", qty: 1 },
    [
      { name: "ПОС 61, порошок", unit: "кг", code: "Ц0000059919", article: "", balance: 12 },
      { name: "Порошковый материал ТР-63-25", unit: "кг", code: "УТ000000860", article: "", balance: 20 },
    ],
  );

  assert.equal(result.stock?.code, "Ц0000059919");
  assert.equal(result.stock?.balance, 32);
  assert.match(result.reason, /объединённый остаток/i);
});

test("POS, POS 61 and TR-63-25 are one confirmed stock group", () => {
  const result = matchStock(
    { name: "Ц0000059919 · ПОС", unit: "кг", qty: 1 },
    [
      { name: "ПОС", unit: "кг", code: "A", article: "", balance: 2 },
      { name: "ПОС 61", unit: "кг", code: "Ц0000059919", article: "", balance: 3 },
      { name: "Порошковый материал ТР-63-25", unit: "кг", code: "B", article: "", balance: 4 },
    ],
  );

  assert.equal(result.stock?.code, "Ц0000059919");
  assert.equal(result.stock?.name, "ПОС 61");
  assert.equal(result.stock?.balance, 9);
});

test("POS aliases tolerate 1C punctuation variants", () => {
  const result = matchStock(
    { name: "Ц0000059919 · ПОС-61", unit: "кг", qty: 1 },
    [{ name: "Порошковый материал ТР 63 25", unit: "кг", code: "УТ000000860", article: "", balance: 7 }],
  );

  assert.equal(result.stock?.balance, 7);
  assert.match(result.reason, /ПОС \/ ПОС 61 \/ ТР-63-25/);
});

test("numeric 1C codes match regardless of leading zero formatting", () => {
  const result = matchStock(
    { name: "00000002130 · Герметик серый", unit: "шт", qty: 1 },
    [{ name: "Герметик", unit: "шт", code: "2130", article: "", balance: 226 }],
  );

  assert.equal(result.stock?.code, "2130");
  assert.equal(result.demandCode, "00000002130");
});

test("confirmed code remains available when the stock report has no row", () => {
  const result = matchStock(
    { name: "УТ000005297 · Гайка М6 DIN 934", unit: "шт", qty: 1 },
    [],
  );

  assert.equal(result.stock, undefined);
  assert.equal(result.demandCode, "УТ000005297");
  assert.match(result.reason, /отсутствует.*остатков/i);
});

test("all user-confirmed 1C codes remain available without stock rows", () => {
  for (const [code, name, unit] of [
    ["00000004273", "Стрейч-плёнка ручная", "кг"],
    ["Ц0000059919", "Порошковый материал порошок припойный ПОС 61", "кг"],
    ["Ц0000078870", "Вставка крышки секции 28×15×133,4", "шт"],
  ]) {
    const result = matchStock({ name: `${code} · ${name}`, unit, qty: 1 }, []);
    assert.equal(result.demandCode, code);
    assert.equal(result.stock, undefined);
  }
});

test("PE ear is manufactured from AMg3 sheet and is not matched as a 1C item", () => {
  const result = calculateElement(
    { id: 1, code: "FE", current: 2000, lengths: [3000], quantity: 1 },
    20,
  );
  const ear = result.items.find((item) => /260\.045-08.*Ухо PE/.test(item.name));

  assert.ok(ear);
  assert.equal(ear.code, "");
  assert.equal(ear.unit, "кг");
  assert.ok(Math.abs(ear.qty - 0.586035648) < 1e-9);
  assert.equal(result.items.some((item) => item.code === "Ц0000082813"), false);
});

test("stretch film uses the confirmed 2.2 kg per roll conversion", () => {
  const result = matchStock(
    { name: "00000004273 · Стрейч-плёнка ручная", unit: "кг", qty: 0.024 },
    [{ name: "Стрейч пленка ручная", unit: "шт", code: "4273", article: "", balance: 10 }],
  );

  assert.equal(result.demandCode, "00000004273");
  assert.equal(result.stock?.code, "4273");
  assert.ok(Math.abs(result.factor - 1 / 2.2) < 1e-12);
  assert.equal(result.priceFactor, 2.2);
  assert.match(result.reason, /2,2 кг/i);
});

test("profiles and busbars are converted to kilograms and 3000 mm pieces", () => {
  const cover = calculateStockLengthMetrics({ name: "Ц0000074662 · Профиль АП 4178", unit: "м", qty: 5.74 });
  const side = calculateStockLengthMetrics({ name: "Ц0000077015 · Профиль АП 4976", unit: "м", qty: 5.74 });
  const busbar = calculateStockLengthMetrics({ name: "Ц0000072703 · Шина АД0 6×100×3000 (R=3)", unit: "кг", qty: 19.512 });

  assert.ok(Math.abs(cover.massKg - 5.74 * 1.381) < 1e-9);
  assert.equal(cover.pieces3m, 2);
  assert.ok(Math.abs(side.massKg - 5.74 * 2.388) < 1e-9);
  assert.equal(side.pieces3m, 2);
  assert.equal(busbar.massKg, 19.512);
  assert.equal(busbar.pieces3m, 4);

  const shapedBusbar = calculateStockLengthMetrics({
    name: "Ц0000072703 · Шина АД0 6×100×3000 (R=3)",
    unit: "кг",
    qty: 4.74,
    stockLengthM: 3.6,
    massKg: 4.74,
    metricBasis: "масса по КД, количество по длине",
  });
  assert.equal(shapedBusbar.massKg, 4.74);
  assert.equal(shapedBusbar.pieces3m, 2);
});
