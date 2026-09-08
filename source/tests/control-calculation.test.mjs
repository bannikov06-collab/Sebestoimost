import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateControlScenario,
  reserveAvailability,
  validateControlResult,
} from "../app/lib/controlCalculation.ts";

const demand = [
  { name: "Ц0000000001 · Материал А", unit: "шт", qty: 10, price: 100, total: 1000 },
  { name: "Ц0000000002 · Материал Б", unit: "кг", qty: 5, price: 200, total: 1000 },
];

const availability = [
  { code: "Ц0000000001", name: "Материал А", unit: "шт", quantity: 4, status: "warehouse" },
  { code: "Ц0000000001", name: "Материал А", unit: "шт", quantity: 3, status: "in_transit", confirmed: true },
  { code: "Ц0000000002", name: "Материал Б", unit: "кг", quantity: 5, status: "manufacturer_ready", confirmed: true },
];

test("availability overlays never mutate the full demand", () => {
  const baseline = calculateControlScenario(demand, availability, []);
  const covered = calculateControlScenario(demand, availability, ["warehouse", "in_transit", "manufacturer_ready"]);
  assert.equal(baseline.rows[0].requiredQty, 10);
  assert.equal(covered.rows[0].requiredQty, 10);
  assert.equal(baseline.baseMaterialCost, 2000);
  assert.equal(covered.baseMaterialCost, 2000);
  assert.equal(demand[0].qty, 10);
});

test("warehouse, transit and manufacturer-ready are included only when selected", () => {
  const warehouse = calculateControlScenario(demand, availability, ["warehouse"]);
  const warehouseTransit = calculateControlScenario(demand, availability, ["warehouse", "in_transit"]);
  const all = calculateControlScenario(demand, availability, ["warehouse", "in_transit", "manufacturer_ready"]);
  assert.equal(warehouse.rows[0].procurementQty, 6);
  assert.equal(warehouseTransit.rows[0].procurementQty, 3);
  assert.equal(warehouse.rows[1].procurementQty, 5);
  assert.equal(all.rows[1].procurementQty, 0);
});

test("control matching requires an exact code and compatible unit", () => {
  const result = calculateControlScenario(demand, [
    { code: "Ц0000000001", name: "Материал А", unit: "кг", quantity: 10, status: "warehouse" },
  ], ["warehouse"]);
  assert.equal(result.rows[0].coveredQty, 0);
  assert.equal(result.rows[0].confidence, "unresolved");
});

test("unconfirmed supplier quantities never reduce procurement", () => {
  const result = calculateControlScenario(demand, [
    { code: "Ц0000000001", name: "Материал А", unit: "шт", quantity: 10, status: "in_transit", confirmed: false },
  ], ["in_transit"]);
  assert.equal(result.rows[0].coveredQty, 0);
  assert.equal(result.rows[0].procurementQty, 10);
});

test("higher-priority project demand is reserved before the current project", () => {
  const remaining = reserveAvailability([
    { code: "Ц0000000001", name: "Материал А", unit: "шт", quantity: 10, status: "warehouse", confirmed: true },
  ], [[{ name: "Ц0000000001 · Материал А", unit: "шт", qty: 7 }]]);
  assert.equal(remaining[0].quantity, 3);
});

test("reference validation requires exact codes and quantities and allows one percent cost deviation", () => {
  const result = calculateControlScenario(demand, [], []);
  const reference = [
    { code: "Ц0000000001", unit: "шт", quantity: 10 },
    { code: "Ц0000000002", unit: "кг", quantity: 5 },
  ];
  const accepted = validateControlResult(result.rows, reference, 2000, 2019, 1);
  const rejected = validateControlResult(result.rows, reference, 2000, 2021, 1);
  assert.equal(accepted.passed, true);
  assert.equal(rejected.costWithinTolerance, false);
  assert.equal(rejected.passed, false);
});
