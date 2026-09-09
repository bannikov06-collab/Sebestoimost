import assert from 'node:assert/strict';
import test from 'node:test';
import { getPreliminaryDimensions, preliminaryDimensionRuleText } from '../app/lib/preliminaryDimensionRules.ts';

test('S1 uses standard geometry for straight, angle and Z sections', () => {
  assert.deepEqual(getPreliminaryDimensions('FE', 2500, 4, 'S1'), [3000]);
  assert.deepEqual(getPreliminaryDimensions('CP', 2500, 4, 'S1'), [600, 600]);
  assert.deepEqual(getPreliminaryDimensions('ZP', 2500, 4, 'S1'), [600, 480, 600]);
});

test('S2 and S3 change L1 only for a one-dimension section', () => {
  assert.deepEqual(getPreliminaryDimensions('FE', 2500, 4, 'S2'), [1500]);
  assert.deepEqual(getPreliminaryDimensions('FE', 2500, 4, 'S3'), [2500]);
});

test('S2 and S3 change only L2 for two- and three-dimension sections', () => {
  assert.deepEqual(getPreliminaryDimensions('CD', 2500, 4, 'S2'), [435, 1500]);
  assert.deepEqual(getPreliminaryDimensions('CP', 2500, 4, 'S3'), [600, 2500]);
  assert.deepEqual(getPreliminaryDimensions('ZD', 2500, 4, 'S2'), [435, 1500, 435]);
  assert.deepEqual(getPreliminaryDimensions('ZP', 2500, 4, 'S3'), [600, 2500, 600]);
});

test('manual preliminary class target changes the same approved dimension only', () => {
  assert.deepEqual(getPreliminaryDimensions('FE', 3200, 4, 'S2', 1700), [1700]);
  assert.deepEqual(getPreliminaryDimensions('ZP', 3200, 4, 'S2', 1700), [650, 1700, 650]);
  assert.equal(preliminaryDimensionRuleText('ZP', 'S2', 1700), 'S2: L2=1700 мм; остальные L стандартные');
});

test('standard mode uses only the number of dimensions defined for the family', () => {
  assert.equal(getPreliminaryDimensions('FE', 3200, 4, '').length, 1);
  assert.equal(getPreliminaryDimensions('CD', 3200, 4, '').length, 2);
  assert.equal(getPreliminaryDimensions('ZP', 3200, 4, '').length, 3);
});
