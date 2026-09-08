import fs from "node:fs";
import path from "node:path";

const project = process.argv[2];
if (!project) throw new Error("Project path argument is required.");
const file = path.join(project, "app", "components", "PreliminarySpecificationPanel.tsx");
if (!fs.existsSync(file)) throw new Error(`PreliminarySpecificationPanel.tsx not found: ${file}`);

const original = fs.readFileSync(file, "utf8");
let source = original;
source = source.replace("{(hasCopperRows || hasFivePoleRows) &&", "{hasCopperRows &&");
source = source.replace('{hasFivePoleRows ? "Позиции 5P не рассчитываются по правилу 4P. " : ""}', "");

if (source.includes("Позиции 5P не рассчитываются") || source.includes("(hasCopperRows || hasFivePoleRows)")) {
  throw new Error("The obsolete 5P exclusion is still present in PreliminarySpecificationPanel.tsx.");
}

if (source !== original) fs.writeFileSync(file, source, "utf8");
console.log(source !== original ? "5P preliminary warning updated." : "5P preliminary warning already updated or not present.");
