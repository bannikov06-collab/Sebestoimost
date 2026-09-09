import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("procurement XLSX contains an explicit total amount row", async () => {
  const source = await readFile(new URL("app/components/MaterialsPlanningPanel.tsx", root), "utf8");
  assert.match(source, /const totalAmount = rows\.reduce/);
  assert.match(source, /"ИТОГО"/);
  assert.match(source, /"Общая сумма заказа материалов"/);
});

test("control orders expose a dedicated delete action", async () => {
  const source = await readFile(new URL("app/components/ProjectCompositionPanel.tsx", root), "utf8");
  assert.match(source, /className="control-order-delete"/);
  assert.match(source, /deleteOrder\(order\)/);
});

test("dark theme explicitly overrides legacy light surfaces and inherits fonts", async () => {
  const css = await readFile(new URL("app/klm-theme.css", root), "utf8");
  assert.match(css, /html\[data-theme="dark"\] \.control-config-grid > div/);
  assert.match(css, /button,\s*\ninput,\s*\nselect,\s*\ntextarea\s*\{\s*font-family: inherit;/m);
});


test("cost calculator preserves uploaded specification order while planning keeps its own sorting", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const planning = await readFile(new URL("app/components/MaterialsPlanningPanel.tsx", root), "utf8");
  assert.match(page, /const calculationDisplayRows = useMemo\(\(\) => calc\.rows/);
  assert.doesNotMatch(page, /calc\.rows\.filter\(\(row\) => row\.code !== "ATSC"\)/);
  assert.match(planning, /sort\(\(a, b\) => Number\(Boolean\(b\.shortage\)\)/);
});

test("procurement export has a dedicated whole-sheet quantity column", async () => {
  const source = await readFile(new URL("app/components/MaterialsPlanningPanel.tsx", root), "utf8");
  assert.match(source, /"Листы, шт\."/);
  assert.match(source, /row\.pieceLabel \? Math\.ceil\(row\.demand\)/);
});
