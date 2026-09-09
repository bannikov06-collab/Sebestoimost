import test from "node:test";
import assert from "node:assert/strict";
import { matchStock } from "../app/lib/materialPlanning.ts";

test("GM-3828 confirmed code does not inherit the generic 66 m scotch-roll conversion", () => {
  const demand = { name: "Ц0000077668 · Скотч электротехнический армированный GM-3828 25 мм", unit: "м", qty: 2.4 };
  const stock = [{ name: "GM-3828", unit: "м", code: "Ц0000077668", article: "GM-3828", balance: 20 }];
  const matched = matchStock(demand, stock);
  assert.equal(matched.demandCode, "Ц0000077668");
  assert.equal(matched.factor, 1);
  assert.equal(matched.stock?.code, "Ц0000077668");
});
