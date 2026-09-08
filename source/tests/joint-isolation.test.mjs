import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isJointSpecificationRow,
  parseJointSpecificationRow,
} from '../app/lib/manufacturingRules.ts';
import { resolveFormulaCodeFromArticle } from '../app/lib/sectionFormulaCode.ts';

const cases = [
  { article: 'G.001.000-09', item: 'Стыковочный элемент', quantity: 2, expectedCurrent: 4000 },
  { article: 'KLM-S-Al-4P-55-20-G', item: 'Стык', quantity: 3, expectedCurrent: 2000 },
  { article: '012.001.000-11', item: 'Соединитель G', quantity: 1, expectedCurrent: 6300 },
];

for (const sample of cases) {
  assert.equal(isJointSpecificationRow(sample), true);
  const result = parseJointSpecificationRow(sample, 'production');
  assert(result);
  assert.deepEqual(result.dimensionsMm, [0, 0, 0]);
  assert.equal(result.currentA, sample.expectedCurrent);
  assert.equal(result.recognitionStatus, 'confirmed');
  assert.equal(resolveFormulaCodeFromArticle(sample.article), undefined);
}

const incomplete = parseJointSpecificationRow(
  { article: '', item: 'Стыковочный элемент', quantity: 1 },
  'production',
);
assert(incomplete);
assert.equal(incomplete.currentA, 0);
assert.equal(incomplete.recognitionStatus, 'missing-current');
assert.deepEqual(incomplete.dimensionsMm, [0, 0, 0]);

assert.equal(
  isJointSpecificationRow({ article: 'KLM-S-Al-4P-55-20-FE', item: 'Прямая секция' }),
  false,
);
assert.equal(resolveFormulaCodeFromArticle('KLM-S-Al-4P-55-20-FE'), 'FE');

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert.match(page, /L1 = 0, L2 = 0, L3 = 0/);
assert.match(page, /const joint = parseJointSpecificationRow\(row, "production"\);/);
assert.match(page, /if \(joint\) \{ jointRows\.push\(joint\); return; \}/);
console.log('joint isolation ok');
