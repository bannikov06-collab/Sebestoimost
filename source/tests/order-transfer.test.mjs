import assert from "node:assert/strict";
import test from "node:test";
import { convertOrder } from "../app/lib/orderTransfer.ts";

const baseRow = {
  id: "row",
  rowNumber: "1",
  priority: "",
  checked: "",
  specification: "",
  line: "Линия 1",
  item: "Секция",
  article: "KLM-AL-20-FE-4P",
  quantity: 1,
  unit: "шт",
  marking: "",
  drawingNumber: "",
  l1: "3000",
  l2: "",
  l3: "",
  version: "",
  constructionType: "",
  extra: "",
};

const order = {
  id: "order",
  number: "02600000001",
  date: "11.08.2026",
  filename: "order.xlsx",
  specification: "Контрольный заказ",
  workflow: "received",
  loadedAt: new Date(0).toISOString(),
  rows: [
    baseRow,
    { ...baseRow, id: "row-2", rowNumber: "2", quantity: 2 },
    { ...baseRow, id: "row-3", rowNumber: "3", article: "KLM-AL-20-G-4P" },
    { ...baseRow, id: "row-4", rowNumber: "4", article: "KLM-AL-20-CD-4P", l1: "", l2: "" },
  ],
};

test("groups supported rows and reports unsupported and defaulted rows", () => {
  const result = convertOrder(order, {
    currentByArticle: { "20": 2000 },
    codes: ["FE", "CD"],
    currentExists: (current) => current === 2000,
    dimensionSpec: (code) => code === "FE" ? { dims: 1, defaults: [3000] } : { dims: 2, defaults: [435, 435] },
  });

  assert.equal(result.supportedRows, 3);
  assert.equal(result.elements.length, 2);
  assert.equal(result.elements.find((row) => row.code === "FE")?.quantity, 3);
  assert.equal(result.unsupportedRows.length, 1);
  assert.match(result.unsupportedRows[0].reason, /не поддерживается/i);
  assert.deepEqual(result.defaultedRows[0].dimensions, ["L1=435 мм", "L2=435 мм"]);
});
