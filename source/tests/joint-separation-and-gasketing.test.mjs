import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manufacturing = await readFile(new URL("../app/lib/manufacturingRules.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const calculation = await readFile(new URL("../app/lib/calculation.ts", import.meta.url), "utf8");

test("joint G is specification-driven and not embedded into section calculation", () => {
  assert.match(manufacturing, /Стык не добавляется к секции автоматически/);
  assert.match(page, /parseJointSpecificationRow\(row, "production"\)/);
  assert.doesNotMatch(calculation, /jointQuantity|jointRule\.components/);
  assert.doesNotMatch(page, /Комплектов стыка G на 1 элемент/);
});

test("gasketing approved formula is encoded", () => {
  assert.match(manufacturing, /componentACode: "Ц0000060428"/);
  assert.match(manufacturing, /componentBCode: "Ц0000057680"/);
  assert.match(manufacturing, /ratioA: 100/);
  assert.match(manufacturing, /ratioB: 20/);
  assert.match(manufacturing, /gramsPerMeter: 20/);
  assert.match(manufacturing, /contourWidthMm: 208/);
  assert.match(manufacturing, /contourHeightMm: 93/);
});

test("approved 6x65 and 7x75 busbar rule is present", () => {
  assert.match(manufacturing, /6: \{ thicknessMm: 6, widthMm: 65/);
  assert.match(manufacturing, /7: \{ thicknessMm: 7, widthMm: 75/);
});

test("800A joint follows assembly KD busbar designation", () => {
  assert.match(manufacturing, /currentA:800[\s\S]*?busbarDesignation:"583\.001-01"/);
});
