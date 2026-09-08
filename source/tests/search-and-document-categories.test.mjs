import assert from "node:assert/strict";
import test from "node:test";
import { searchCatalog } from "../app/lib/catalogSearch.ts";
import { isDocumentCategory } from "../app/lib/documentCategories.ts";

const catalog = [
  { id: 1, sourceNumber: 12, code: "FE", name: "Прямая секция" },
  { id: 2, sourceNumber: 87, code: "ATCP", name: "Присоединительная вертикальная" },
  { id: 3, sourceNumber: 91, code: "КОМ", name: "Коробка отбора мощности" },
];

test("catalog search narrows by code, number and partial name", () => {
  assert.deepEqual(searchCatalog(catalog, "atc").map((row) => row.id), [2]);
  assert.deepEqual(searchCatalog(catalog, "87").map((row) => row.id), [2]);
  assert.deepEqual(searchCatalog(catalog, "отбора").map((row) => row.id), [3]);
  assert.equal(searchCatalog(catalog, "").length, 3);
});

test("preliminary specification file is an allowed document category", () => {
  assert.equal(isDocumentCategory("preliminary_specification_file"), true);
  assert.equal(isDocumentCategory("unexpected"), false);
});
