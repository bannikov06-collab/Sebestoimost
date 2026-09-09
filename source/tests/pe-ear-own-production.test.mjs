import test from "node:test";
import assert from "node:assert/strict";
import { matchStock } from "../app/lib/materialPlanning.ts";

const peEarDemand = {
  name: "260.045-08 · Ухо PE, L=239 мм · изготовление из листа АМг3 2,0 мм · 4 шт.",
  unit: "кг",
  qty: 0.586035648,
  price: 592.9,
};

test("PE ear does not require a finished 1C code and maps procurement to confirmed AMg3 sheet", () => {
  const result = matchStock(peEarDemand, []);
  assert.equal(result.demandCode, "Ц0000069668");
  assert.match(result.reason, /собственное производство/i);
  assert.match(result.reason, /готовый код 1С не требуется/i);
});

test("PE ear matches AMg3 2.0 raw material by confirmed 1C code", () => {
  const stock = [{
    name: "Лист алюминиевый АМг3 2,0 мм",
    unit: "кг",
    code: "Ц0000069668",
    article: "",
    balance: 25,
  }];
  const result = matchStock(peEarDemand, stock);
  assert.equal(result.demandCode, "Ц0000069668");
  assert.equal(result.stock?.code, "Ц0000069668");
});
