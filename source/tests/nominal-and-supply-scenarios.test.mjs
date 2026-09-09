import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftArticleNominal } from '../app/lib/nominalScenarios.ts';
import { calculateControlScenario } from '../app/lib/controlCalculation.ts';

test('nominal 1 and nominal 2 step down 2000 A to 1600 A and 1250 A', () => {
  const n1 = shiftArticleNominal('KLM-20-FE-4P', 1);
  const n2 = shiftArticleNominal('KLM-20-FE-4P', 2);
  assert.equal(n1.from, 2000);
  assert.equal(n1.to, 1600);
  assert.equal(n1.article, 'KLM-16-FE-4P');
  assert.equal(n2.to, 1250);
  assert.equal(n2.article, 'KLM-12-FE-4P');
});

test('confirmed supplier production covers scenario demand', () => {
  const result = calculateControlScenario(
    [{ name: 'Ц0000056270 · Болт М6×12', unit: 'шт', qty: 10, price: 2 }],
    [{ code: 'Ц0000056270', name: 'Болт М6×12', unit: 'шт', quantity: 6, status: 'manufacturer_production', confirmed: true }],
    ['manufacturer_production'],
  );
  assert.equal(result.rows[0].coveredQty, 6);
  assert.equal(result.rows[0].procurementQty, 4);
  assert.equal(result.procurementCost, 8);
});

test('unconfirmed supplier production does not reduce demand', () => {
  const result = calculateControlScenario(
    [{ name: 'Ц0000056270 · Болт М6×12', unit: 'шт', qty: 10, price: 2 }],
    [{ code: 'Ц0000056270', name: 'Болт М6×12', unit: 'шт', quantity: 10, status: 'manufacturer_production', confirmed: false }],
    ['manufacturer_production'],
  );
  assert.equal(result.rows[0].coveredQty, 0);
  assert.equal(result.rows[0].procurementQty, 10);
});
