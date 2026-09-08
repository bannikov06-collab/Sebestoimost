import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateBreakerDiscountPrices } from "../app/lib/breakerPricing.ts";

test("breaker price discounts use the confirmed 50% and 70% discount semantics", () => {
  assert.deepEqual(calculateBreakerDiscountPrices(1000), {
    discount50: 500,
    discount70: 300,
  });
});

test("breaker discounts retain kopeck precision", () => {
  assert.deepEqual(calculateBreakerDiscountPrices(999.99), {
    discount50: 500,
    discount70: 300,
  });
});

test("invalid breaker price does not produce a negative derived price", () => {
  assert.deepEqual(calculateBreakerDiscountPrices(-1), {
    discount50: 0,
    discount70: 0,
  });
});

test("the unified breaker catalog contains all seven supplied price lists", () => {
  const catalog = JSON.parse(readFileSync(new URL("../public/data/breakerCatalog.json", import.meta.url), "utf8"));
  assert.equal(catalog.length, 23322);
  assert.deepEqual([...new Set(catalog.map((item) => item.manufacturer))].sort(), [
    "CHINT", "DEKraft", "EKF", "Hyundai", "IEK", "KEAZ", "Systeme Electric",
  ]);
  for (const item of catalog.slice(0, 100)) {
    assert.ok(item.sourcePrice > 0, `${item.article}: source price`);
    assert.match(item.sourceDate, /^20\d{2}-\d{2}-\d{2}$/, `${item.article}: source date`);
    assert.ok(item.sourceFile, `${item.article}: source file`);
  }
});
