import { ALUMINIUM_DENSITY_KG_M3, calculateBusStock } from "./busStock.ts";
import { getCalculationBusConfig, type PoleCount } from "./standardDimensions.ts";

export type ParametricSectionCode =
  | "FE" | "CD" | "CP" | "ZD" | "ZP" | "TP" | "ZDP" | "TD"
  | "ATSC" | "ATCP" | "ATCD";

export type ParametricMaterialGeometry = {
  current: number;
  poles: PoleCount;
  sectionCode: ParametricSectionCode;
  developedMm: number;
  developedM: number;
  packsPerPhase: number;
  barsTotal: number;
  barHeightMm: number;
  barThicknessMm: number;
  coverWidthMm: number;
  barPerimeterM: number;
  petBlankWidthM: number;
  petInsulatedLengthM: number;
  busLengthM: number;
  busMassKg: number;
  sidewallHeightMm: number;
  sidewallSheetMassKg: number;
  tapeLengthM: number;
  tapeFactor: number;
  genericResourceCalculationAllowed: boolean;
  gaps: string[];
};

const SHAPED = new Set<ParametricSectionCode>(["CD", "CP", "ZD", "ZP", "TP", "ZDP", "TD", "ATCP", "ATCD"]);
const SHEET_SIDEWALL = new Set<ParametricSectionCode>(["CD", "CP", "ZD", "ZP", "TP", "ZDP", "TD", "ATCP", "ATCD"]);

/**
 * Approved parametric geometry layer.
 * It only derives quantities from dimensions and approved standard bus data.
 * It intentionally does NOT invent a powder kg/m² coefficient or an ATSC BOM.
 */
export function calculateParametricMaterialGeometry(input: {
  current: number;
  poles: PoleCount;
  sectionCode: ParametricSectionCode;
  dimensionsMm: number[];
  weldedVertical?: boolean;
}): ParametricMaterialGeometry | null {
  const cfg = getCalculationBusConfig(input.current, input.poles);
  const developedMm = input.dimensionsMm.slice(0, 3).reduce((sum, value) => sum + Math.max(value || 0, 0), 0);
  if (!cfg || developedMm <= 0) return null;

  const developedM = developedMm / 1000;
  const bus = calculateBusStock(cfg, developedMm, input.poles);
  const barPerimeterM = (2 * (cfg.height + cfg.thickness)) / 1000;
  const petBlankWidthM = barPerimeterM + 0.03;

  // Existing approved section-specific cutback from KDs is preserved; no cross-nominal scaling.
  const cdBusDevelopedMm = input.sectionCode === "CD" ? Math.max(developedMm - 166.05, 0) : developedMm;
  const petInsulatedLengthM = input.sectionCode === "CD"
    ? Math.max(cdBusDevelopedMm - 60, 0) / 1000
    : Math.max(developedMm - 210, 0) / 1000;

  const tapeFactor = SHAPED.has(input.sectionCode) || Boolean(input.weldedVertical) ? 2.5 : 1;
  // 14 wraps on each of two ends of every bar. Rewritten via barsTotal so 5P scales correctly.
  const tapeLengthM = bus.barsTotal * 2 * 14 * barPerimeterM * tapeFactor;

  // Sidewall development follows busbar height. This is used only for families whose sidewalls are sheet parts.
  const sidewallHeightMm = cfg.height + 60;
  const sidewallSheetMassKg = SHEET_SIDEWALL.has(input.sectionCode)
    ? 2 * developedM * (sidewallHeightMm / 1000) * 0.002 * 2700
    : 0;

  const gaps: string[] = [];
  if (input.sectionCode === "ATSC") {
    gaps.push("ATSC: требуется отдельный BOM по КД; общий BOM обычной секции запрещён");
  }
  gaps.push("Порошковая окраска: расход кг/м² не утверждён; сохраняется действующая базовая норма до отдельного правила");

  return {
    current: input.current,
    poles: input.poles,
    sectionCode: input.sectionCode,
    developedMm,
    developedM,
    packsPerPhase: cfg.count,
    barsTotal: bus.barsTotal,
    barHeightMm: cfg.height,
    barThicknessMm: cfg.thickness,
    coverWidthMm: cfg.coverWidth,
    barPerimeterM,
    petBlankWidthM,
    petInsulatedLengthM,
    busLengthM: bus.busLengthM,
    busMassKg: bus.busMass,
    sidewallHeightMm,
    sidewallSheetMassKg,
    tapeLengthM,
    tapeFactor,
    genericResourceCalculationAllowed: input.sectionCode !== "ATSC",
    gaps,
  };
}

export function calculatePetMassKg(geometry: ParametricMaterialGeometry, densityKgM3 = 1400, thicknessM = 0.00025) {
  return geometry.barsTotal * geometry.petBlankWidthM * geometry.petInsulatedLengthM * thicknessM * densityKgM3;
}

export function calculateBusMassFromDevelopedLengthKg(geometry: ParametricMaterialGeometry, effectiveDevelopedMm = geometry.developedMm) {
  const crossSectionM2 = (geometry.barThicknessMm / 1000) * (geometry.barHeightMm / 1000);
  return geometry.barsTotal * (effectiveDevelopedMm / 1000) * crossSectionM2 * ALUMINIUM_DENSITY_KG_M3;
}
