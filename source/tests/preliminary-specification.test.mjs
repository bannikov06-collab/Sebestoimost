import assert from 'node:assert/strict';
import test from 'node:test';
import { commercialTotals, inferCommercialLength, parsePreliminaryMatrix } from '../app/lib/preliminarySpecification.ts';

test('preliminary S rules use S1 as standard and S2/S3 targets 1500/2500', () => {
  assert.deepEqual(inferCommercialLength('KLM-S-25-Cu-55-4-V3-FE-S1'), { lengthClass: 'S1', lengthMm: 0 });
  assert.deepEqual(inferCommercialLength('KLM-S-25-Cu-55-4-V3-FE-S2'), { lengthClass: 'S2', lengthMm: 1500 });
  assert.deepEqual(inferCommercialLength('KLM-S-25-Cu-55-4-V3-FE-S3'), { lengthClass: 'S3', lengthMm: 2500 });
  assert.deepEqual(inferCommercialLength('KLM-S-25-Cu-55-4-V3-FE'), { lengthClass: '', lengthMm: 3000 });
  assert.deepEqual(inferCommercialLength('KLM-S-25-Al-55-4-V3-Pi-2'), { lengthClass: '', lengthMm: 3000 });
});

test('non-standard preliminary row without explicit class falls back to S1 standard geometry', () => {
  assert.deepEqual(inferCommercialLength('KLM-S-25-Al-55-4-V3-CP-SA', 'Нестандартный вертикальный угол'), { lengthClass: 'S1', lengthMm: 0 });
});

test('preliminary specification form is parsed without production-order dimensions', () => {
  const matrix = [
    ['Specification/Спецификация №', 'ШП-031983', 'от', '12.03.2026'],
    ['Заказчик:', 'КЛМ инжиниринг'],
    ['Проект:', 'Сила пара'],
    ['№', 'Part No./Артикул', 'Name/Наименование', 'Ед. изм.', 'Q-ty/Кол.', 'Цена RUB'],
    [1, 'KLM-S-25-Cu-55-4-V3-FE-S2', 'Нестандартная прямая секция', 'шт.', 5, ''],
    [2, 'KLM-S-25-Al-55-4-V3-CP', 'Угол вертикальный стандартный', 'шт.', 2, ''],
  ];
  const result = parsePreliminaryMatrix(matrix, 'sample.xls', '2026-08-18T00:00:00.000Z');
  assert.equal(result.number, 'ШП-031983');
  assert.equal(result.projectName, 'Сила пара');
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].commercialLengthMm, 1500);
  assert.equal(result.rows[1].commercialLengthMm, 0);
  assert.equal(result.markupPercent, 22);
});

test('commercial total allows the confirmed 22 percent or zero markup', () => {
  assert.deepEqual(commercialTotals(1000, 22, 20), {
    baseCost: 1000,
    markupAmount: 220,
    subtotalWithMarkup: 1220,
    vatAmount: 244,
    contractTotal: 1464,
  });
  assert.equal(commercialTotals(1000, 0, 20).contractTotal, 1200);
});
