import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const preliminary = fs.readFileSync(new URL('../app/components/PreliminarySpecificationPanel.tsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

test('project composition preliminary cost cells always show two decimal places', () => {
  assert.match(preliminary, /minimumFractionDigits:\s*2/);
  assert.match(preliminary, /maximumFractionDigits:\s*2/);
  assert.doesNotMatch(preliminary, /currency:\s*"RUB",\s*maximumFractionDigits:\s*0/);
});

test('main KLM money formatter keeps two decimal places', () => {
  assert.match(page, /minimumFractionDigits:\s*2/);
  assert.match(page, /maximumFractionDigits:\s*2/);
});
