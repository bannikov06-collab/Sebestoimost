import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { calculateIp68Compound, isIp68SupportedCurrent, selectIp68SidewallResource } from "../app/lib/ip68Rules.ts";
import { calculateJointMaterialLines, parseJointSpecificationRow } from "../app/lib/manufacturingRules.ts";

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test("IP68 exact STEP anchors keep their measured compound volumes", () => {
  const fe = calculateIp68Compound({ family:"FE", currentA:1600, poles:4, developedMm:3000 });
  const cp = calculateIp68Compound({ family:"CP", currentA:1600, poles:4, developedMm:900 });
  const cd = calculateIp68Compound({ family:"CD", currentA:2000, poles:4, developedMm:870 });
  close(fe.volumeL, 18.871463);
  close(fe.massKg, 27.17490672);
  close(cp.volumeL, 3.359705);
  close(cd.volumeL, 4.239151918);
  assert.equal(fe.exactAnchor, true);
});

test("IP68 extrapolation uses the confirmed 5P two-package calibration", () => {
  const fourPole = calculateIp68Compound({ family:"ZD", currentA:3200, poles:4, developedMm:1285 });
  const fivePole = calculateIp68Compound({ family:"ZD", currentA:3200, poles:5, developedMm:1285 });
  const feFivePole = calculateIp68Compound({ family:"FE", currentA:3200, poles:5, developedMm:3000 });
  assert.ok(fourPole.volumeL > 6.173059327);
  close(feFivePole.massKg, 57.58, 1e-6);
  assert.ok(fivePole.volumeL > fourPole.volumeL);
  assert.equal(fourPole.exactAnchor, true);
  assert.match(fivePole.basis, /пакеты/);
});

test("approved control calculations remain stable for CD 1600 and ZD 3200", () => {
  const cd = calculateIp68Compound({ family:"CD", currentA:1600, poles:4, developedMm:870 });
  const zd = calculateIp68Compound({ family:"ZD", currentA:3200, poles:4, developedMm:1285 });
  close(cd.volumeL, 3.481516);
  close(cd.massKg, 5.01338304);
  close(zd.volumeL, 10.139578);
  close(zd.massKg, 14.60099232);
});

test("IP68 sidewalls use bus height plus 33 mm and sheet when no confirmed profile exists", () => {
  const resource = selectIp68SidewallResource({ family:"FE", currentA:1600, busHeightMm:160, busThicknessMm:6, packagesPerPhase:1 });
  assert.equal(resource.kind, "sheet");
  assert.equal(resource.heightMm, 193);
  assert.equal(resource.code, "Ц0000070687");
});

test("IP68 excludes 6300 A until its construction is approved", () => {
  assert.equal(isIp68SupportedCurrent(5000), true);
  assert.equal(isIp68SupportedCurrent(6300), false);
  assert.equal(calculateIp68Compound({ family:"FE", currentA:6300, poles:4, developedMm:3000 }), null);
});

test("IP68 5P joint uses its own 012.007 BOM and six insulators", () => {
  const joint = parseJointSpecificationRow({ article:"012.007.000-05", item:"Соединитель G-IP68 2000А 5P", quantity:2 });
  assert.equal(joint.ip, "IP68");
  assert.equal(joint.currentA, 2000);
  assert.deepEqual(joint.dimensionsMm, [0,0,0]);
  const lines = calculateJointMaterialLines(joint);
  assert.equal(lines.find((line) => line.name === "Изолятор IP68")?.qty, 12);
  assert.equal(lines.find((line) => line.name.includes("Шина стыка"))?.qty, 24);
  assert.equal(lines.find((line) => line.name.includes("M12×150"))?.qty, 6);
  assert.ok(lines.every((line) => line.basis.includes("012.007.000-05")));
  assert.ok(lines.every((line) => !line.name.includes("VeraBond")));
});

test("calculator exposes IP68 and insulates PE in IP68 without changing the IP55 rule", () => {
  const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<option value="IP68">IP68<\/option>/);
  assert.match(page, /const insulatedBarsTotal = isIp68 \? barsTotal : 4 \* cfg\.count/);
  assert.match(page, /ПЭТ IP68/);
  assert.match(page, /Шина PE в 5P не изолируется/);
});
