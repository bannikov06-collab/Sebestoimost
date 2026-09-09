import test from "node:test";
import assert from "node:assert/strict";
import { resolveFormulaCode, resolveFormulaCodeFromArticle } from "../app/lib/sectionFormulaCode.ts";

test("Pi straight section uses FE calculation family", () => {
  assert.equal(resolveFormulaCode({ id: 46, code: "Pi", name: "Нестандартная прямая секция длиной от 1000мм до 1999мм" }), "FE");
});

test("FE length classes use FE calculation family", () => {
  assert.equal(resolveFormulaCode({ id: 91, code: "FE-S6", name: "Нестандартная прямая секция" }), "FE");
});

test("Pi with EC is not silently treated as ordinary FE", () => {
  assert.equal(resolveFormulaCode({ id: 45, code: "Pi - EC", name: "Нестандартная прямая секция с заглушкой" }), undefined);
});

test("plain ATT and CML catalog families resolve to their approved specialized models", () => {
  assert.equal(resolveFormulaCode({ id: 137, code: "ATT", name: "Терминальная секция трансформаторная" }), "ATT");
  assert.equal(resolveFormulaCode({ id: 115, code: "CML", name: "Компенсационная секция" }), "CML");
});

test("combined ATT/CML families are not silently mapped to the plain family", () => {
  assert.equal(resolveFormulaCode({ id: 133, code: "ATT+ZP", name: "ATT совмещенная с ZP" }), undefined);
  assert.equal(resolveFormulaCode({ id: 114, code: "CML+СD", name: "CML с нестандартным углом" }), undefined);
});

test('preliminary standard and SA aliases resolve to base calculation families', () => {
  assert.equal(resolveFormulaCode({ id: 116, code: 'CD-SA', name: 'Нестандартный горизонтальный угол' }), 'CD');
  assert.equal(resolveFormulaCode({ id: 109, code: 'CP-SA', name: 'Нестандартный вертикальный угол' }), 'CP');
  assert.equal(resolveFormulaCode({ id: 10, code: 'ZD-SA', name: 'Нестандартный горизонтальный Z-элемент' }), 'ZD');
  assert.equal(resolveFormulaCode({ id: 4, code: 'ZP-SA', name: 'Нестандартный вертикальный Z-элемент' }), 'ZP');
  assert.equal(resolveFormulaCode({ id: 13, code: 'ZDP-SA', name: 'Угол комбинированный с нестандартным углом' }), 'ZDP');
  assert.equal(resolveFormulaCode({ id: 90, code: 'FE-SZ', name: 'Прямая секция с заземлением' }), 'FE');
  assert.equal(resolveFormulaCode({ id: 65, code: 'Pi-1', name: 'Прямая секция стандартного размера' }), 'FE');
});


test("preliminary article S1 is a length class, not the SA catalog variant", () => {
  assert.equal(resolveFormulaCodeFromArticle("KLM-S-40-Al-55-4-V3-CP-S1"), "CP");
  assert.equal(resolveFormulaCodeFromArticle("KLM-S-40-Al-55-4-V3-CD-S1"), "CD");
  assert.equal(resolveFormulaCodeFromArticle("KLM-S-40-Al-55-4-V3-ZD-S1"), "ZD");
  assert.equal(resolveFormulaCodeFromArticle("KLM-S-40-Al-55-4-V3-ZP-S1"), "ZP");
});

test("special preliminary families resolve directly from the article before name matching", () => {
  assert.equal(resolveFormulaCodeFromArticle("KLM-S-32-Al-55-4-V3-CML"), "CML");
  assert.equal(resolveFormulaCodeFromArticle("KLM-S-32-Al-55-4-V3-ATT"), "ATT");
  assert.equal(resolveFormulaCodeFromArticle("KLM-S-32-Al-55-4-V3-ATSC"), "ATSC");
  assert.equal(resolveFormulaCodeFromArticle("KLM-S-40-Al-55-4-V3-CP-SA"), "CP");
  assert.equal(resolveFormulaCodeFromArticle("KLM-S-40-Al-55-4-V3-CD-SA"), "CD");
});
