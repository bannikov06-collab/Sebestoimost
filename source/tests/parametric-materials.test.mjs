import assert from "node:assert/strict";
import test from "node:test";
import { calculateParametricMaterialGeometry, calculatePetMassKg } from "../app/lib/parametricMaterials.ts";

test("pack count and bars total come from approved standard table", () => {
  const g2500 = calculateParametricMaterialGeometry({ current: 2500, poles: 4, sectionCode: "FE", dimensionsMm: [3000] });
  const g5000 = calculateParametricMaterialGeometry({ current: 5000, poles: 5, sectionCode: "FE", dimensionsMm: [3000] });
  assert.equal(g2500?.packsPerPhase, 2);
  assert.equal(g2500?.barsTotal, 8);
  assert.equal(g5000?.packsPerPhase, 4);
  assert.equal(g5000?.barsTotal, 20);
});

test("cover width stays fixed at 140 mm while bus and sidewall geometry changes", () => {
  const a = calculateParametricMaterialGeometry({ current: 800, poles: 4, sectionCode: "CP", dimensionsMm: [300, 300] });
  const b = calculateParametricMaterialGeometry({ current: 1600, poles: 4, sectionCode: "CP", dimensionsMm: [450, 450] });
  assert.equal(a?.coverWidthMm, 140);
  assert.equal(b?.coverWidthMm, 140);
  assert.ok((b?.sidewallHeightMm ?? 0) > (a?.sidewallHeightMm ?? 0));
  assert.ok((b?.sidewallSheetMassKg ?? 0) > (a?.sidewallSheetMassKg ?? 0));
});

test("PET and tape are recalculated from bar geometry and pole count", () => {
  const p4 = calculateParametricMaterialGeometry({ current: 1000, poles: 4, sectionCode: "FE", dimensionsMm: [3000] });
  const p5 = calculateParametricMaterialGeometry({ current: 1000, poles: 5, sectionCode: "FE", dimensionsMm: [3000] });
  assert.ok(p4 && p5);
  assert.ok(calculatePetMassKg(p5) > calculatePetMassKg(p4));
  assert.ok(Math.abs(p5.tapeLengthM / p4.tapeLengthM - 1.25) < 1e-9);
});

test("ATSC is blocked from generic resource BOM", () => {
  const atsc = calculateParametricMaterialGeometry({ current: 2500, poles: 4, sectionCode: "ATSC", dimensionsMm: [240, 450] });
  assert.equal(atsc?.genericResourceCalculationAllowed, false);
  assert.ok(atsc?.gaps.some((x) => x.includes("отдельный BOM")));
});
