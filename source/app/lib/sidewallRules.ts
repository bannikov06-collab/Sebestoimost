export const SIDEWALL_HEIGHT_ALLOWANCE_MM = 3;
export const SIDEWALL_SHEET_THICKNESS_MM = 2;
export const SIDEWALL_SHEET_CODE = "Ц0000070687";
export const SIDEWALL_PROFILE_200_CODE = "Ц0000077016";

export type SidewallResource =
  | {
      kind: "profile";
      code: string;
      designation: string;
      heightMm: number;
      kgPerM: number;
      pricePerM: number;
      basis: string;
    }
  | {
      kind: "sheet";
      code: string;
      designation: string;
      heightMm: number;
      thicknessMm: number;
      densityKgM3: number;
      pricePerKg: number;
      basis: string;
    };

type SidewallSelectionInput = {
  family: string;
  currentA: number;
  busHeightMm: number;
  busThicknessMm: number;
  packagesPerPhase: number;
  familyRequiresSheet: boolean;
};

/**
 * Confirmed owner rule:
 * 1. Family is resolved first.
 * 2. Current, bus section and package count are retained in the audit basis.
 * 3. Sidewall height is always bus height + 3 mm.
 * 4. A profile is allowed only when its documented height matches exactly.
 * 5. Otherwise the sidewall is made from the confirmed sheet material.
 */
export function selectSidewallResource(input: SidewallSelectionInput): SidewallResource {
  const heightMm = Math.max(0, input.busHeightMm) + SIDEWALL_HEIGHT_ALLOWANCE_MM;
  const audit = `${input.family} ${input.currentA} А; шина ${input.busThicknessMm}×${input.busHeightMm} мм; ${input.packagesPerPhase} шт./фазу; боковина ${input.busHeightMm}+${SIDEWALL_HEIGHT_ALLOWANCE_MM}=${heightMm} мм`;

  // 131.20.FE.001.004: AP 4977 has documented height 203 mm for a 200 mm bus.
  if (!input.familyRequiresSheet && input.busHeightMm === 200) {
    return {
      kind: "profile",
      code: SIDEWALL_PROFILE_200_CODE,
      designation: "Профиль алюминиевый АП 4977 — боковина секции 200 мм",
      heightMm,
      kgPerM: 2.388,
      pricePerM: 1313.4,
      basis: `${audit}; профиль выбран по КД 131.20.FE.001.004, высота 203 мм`,
    };
  }

  return {
    kind: "sheet",
    code: SIDEWALL_SHEET_CODE,
    designation: `Лист алюминий АМг3 ${SIDEWALL_SHEET_THICKNESS_MM},0×1200×3000 — боковина ${heightMm} мм`,
    heightMm,
    thicknessMm: SIDEWALL_SHEET_THICKNESS_MM,
    densityKgM3: 2700,
    pricePerKg: 592.9,
    basis: `${audit}; точный профиль этой высоты в подтверждённом реестре отсутствует — расчёт из листа ${SIDEWALL_SHEET_CODE}`,
  };
}

export function calculateSidewallSheetMassKg(resource: SidewallResource, developedM: number) {
  if (resource.kind !== "sheet") return 0;
  return 2 * Math.max(0, developedM) * (resource.heightMm / 1000) * (resource.thicknessMm / 1000) * resource.densityKgM3;
}
