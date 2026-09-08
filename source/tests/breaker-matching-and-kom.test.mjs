import assert from "node:assert/strict";
import test from "node:test";
import { buildBreakerIndexes, matchBreaker, matchBreakerStock } from "../app/lib/breakerMatching.ts";
import { calculateKomMaterials, findKomEnvelope, kom250Drawing } from "../app/lib/komSelection.ts";

const catalog = [{
  key: "vendor|A-100",
  manufacturer: "Vendor",
  article: "A-100",
  name: "Автоматический выключатель 250 А",
  currentA: 250,
  sourcePrice: 1000,
  sourceDate: "2026-08-01",
  sourceFile: "price.xlsx",
}];

test("a production-order breaker is matched by exact article before name", () => {
  const result = matchBreaker({ rowNumber: "1", item: "Другое наименование", article: " A-100 ", quantity: 2 }, buildBreakerIndexes(catalog));
  assert.equal(result.item?.article, "A-100");
  assert.equal(result.basis, "Точный артикул");
});

test("stock is matched by exact article/code or exact normalized name only", () => {
  const row = { rowNumber: "1", item: catalog[0].name, article: "A-100", quantity: 1 };
  const result = matchBreakerStock(row, catalog[0], [{ name: "Складское имя", code: "A-100", article: "", unit: "шт", balance: 3 }]);
  assert.equal(result.item?.balance, 3);
  assert.equal(result.basis, "Артикул/код 1С");
});

test("KOM 250A Plug-in materials are exact values from the supplied drawings", () => {
  const result = calculateKomMaterials(250, "Plug-in");
  assert.equal(result?.exact, true);
  assert.deepEqual(result?.dimensions, kom250Drawing.dimensions);
  assert.equal(result?.steel15Kg, 10.77);
  assert.equal(result?.steel07Kg, 0.57);
  assert.equal(result?.totalMassKg, 21.71);
});

test("other KOM sizes remain explicitly preliminary", () => {
  assert.deepEqual(findKomEnvelope(630, "Bolt-on"), [350, 350, 800]);
  const result = calculateKomMaterials(630, "Bolt-on");
  assert.equal(result?.exact, false);
  assert.equal(result?.confidence, "Низкая");
  assert.equal(result?.totalMassKg, undefined);
});
