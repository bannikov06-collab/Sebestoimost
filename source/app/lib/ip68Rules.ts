import { getCalculationBusConfig, type PoleCount } from "./standardDimensions.ts";

export const IP68_COMPOUND = {
  code: "Ц0000066360",
  designation: "VeraBond IZC-10",
  manufacturer: "ООО «МИРОТЭК»",
  ratioA: 100,
  ratioB: 30,
  densityKgL: 1.44,
  pricePerKg: 416,
  lossPercent: 0,
  equipmentGramsPerSecond: 95,
} as const;

export const IP68_SIDEWALL_ALLOWANCE_MM = 33;
export const IP68_SUPPORTED_CURRENTS = [160,250,315,400,500,630,800,1000,1250,1600,2000,2500,3200,4000,5000] as const;
export const IP68_COMPOUND_FAMILIES = ["FE", "CP", "CD", "ZD", "ZDP", "ZP"] as const;

type CompoundFamily = typeof IP68_COMPOUND_FAMILIES[number];
type CompoundAnchor = { currentA: number; poles: PoleCount; developedMm: number; volumeL: number; source: string; effectiveLengthOffsetMm?: number };

const anchors: Record<CompoundFamily, CompoundAnchor> = {
  FE: { currentA:1600, poles:4, developedMm:3000, volumeL:18.871463, effectiveLengthOffsetMm:222, source:"134.16.FE.001.Компаунд.STEP" },
  CP: { currentA:1600, poles:4, developedMm:900, volumeL:3.359705, source:"134.16.CP.001.компаунд.STEP" },
  CD: { currentA:2000, poles:4, developedMm:870, volumeL:4.239151918, source:"134.20.CD.001.Компаунд.STEP" },
  ZD: { currentA:2000, poles:4, developedMm:1285, volumeL:6.173059327, source:"134.20.ZD.001.008.компаунд.STEP" },
  ZDP:{ currentA:2000, poles:4, developedMm:1335, volumeL:6.563011071, source:"134.20.ZDP.001.Компаунд.STEP" },
  ZP: { currentA:2000, poles:4, developedMm:1280, volumeL:7.008215057, source:"134.20.ZP.001.компаунд.STEP" },
};

const controlAnchors: Partial<Record<CompoundFamily, CompoundAnchor[]>> = {
  FE: [{ currentA:3200, poles:5, developedMm:3000, volumeL:57.58 / IP68_COMPOUND.densityKgL, effectiveLengthOffsetMm:222, source:"123.32.FE.002.000 · 57,58 кг на двухпакетную секцию подтверждено пользователем" }],
  CD: [{ currentA:1600, poles:4, developedMm:870, volumeL:3.481516, source:"контрольный расчёт CD 1600 А, подтверждён к внедрению" }],
  ZD: [{ currentA:3200, poles:4, developedMm:1285, volumeL:10.139578, source:"контрольный расчёт ZD 3200 А, подтверждён к внедрению" }],
};

export function isIp68SupportedCurrent(currentA: number) {
  return IP68_SUPPORTED_CURRENTS.includes(currentA as typeof IP68_SUPPORTED_CURRENTS[number]);
}

export function isIp68CompoundFamily(family: string): family is CompoundFamily {
  return IP68_COMPOUND_FAMILIES.includes(family as CompoundFamily);
}

export function calculateIp68Compound(input: { family: string; currentA: number; poles: PoleCount; developedMm: number }) {
  if (!isIp68SupportedCurrent(input.currentA) || !isIp68CompoundFamily(input.family) || !(input.developedMm > 0)) return null;
  const config = getCalculationBusConfig(input.currentA, input.poles);
  const anchor = controlAnchors[input.family]?.find((candidate) => candidate.currentA === input.currentA && candidate.poles === input.poles) ?? anchors[input.family];
  const anchorConfig = getCalculationBusConfig(anchor.currentA, anchor.poles);
  if (!config || !anchorConfig) return null;
  const offset = anchor.effectiveLengthOffsetMm ?? 0;
  const activeLengthMm = Math.max(input.developedMm - offset, 0);
  const anchorActiveLengthMm = Math.max(anchor.developedMm - offset, 1);
  const lengthFactor = activeLengthMm / anchorActiveLengthMm;
  const heightFactor = (config.height + IP68_SIDEWALL_ALLOWANCE_MM) / (anchorConfig.height + IP68_SIDEWALL_ALLOWANCE_MM);
  const packageFactor = config.count / anchorConfig.count;
  const fivePoleCalibration = (57.58 / IP68_COMPOUND.densityKgL) / (anchors.FE.volumeL * 2);
  const conductorFactor = input.poles === anchor.poles ? 1 : input.poles === 5 ? fivePoleCalibration : 1 / fivePoleCalibration;
  const exactAnchor = input.currentA === anchor.currentA && input.poles === anchor.poles && Math.abs(input.developedMm - anchor.developedMm) < 0.001;
  const volumeL = anchor.volumeL * lengthFactor * heightFactor * packageFactor * conductorFactor;
  const massKg = volumeL * IP68_COMPOUND.densityKgL;
  const ratioTotal = IP68_COMPOUND.ratioA + IP68_COMPOUND.ratioB;
  const componentAKg = massKg * IP68_COMPOUND.ratioA / ratioTotal;
  const componentBKg = massKg * IP68_COMPOUND.ratioB / ratioTotal;
  return {
    volumeL,
    massKg,
    componentAKg,
    componentBKg,
    cost: massKg * IP68_COMPOUND.pricePerKg,
    dispensingSeconds: massKg * 1000 / IP68_COMPOUND.equipmentGramsPerSecond,
    sidewallHeightMm: config.height + IP68_SIDEWALL_ALLOWANCE_MM,
    exactAnchor,
    confidence: exactAnchor ? "Подтверждено" as const : "Расчётно" as const,
    source: anchor.source,
    basis: exactAnchor
      ? `точный объём STEP ${anchor.source}: ${anchor.volumeL.toFixed(6)} л`
      : `пересчёт от ${anchor.source}: длина ×${lengthFactor.toFixed(4)}, высота корпуса ×${heightFactor.toFixed(4)}, пакеты ×${packageFactor.toFixed(4)}, проводники ×${conductorFactor.toFixed(4)}`,
  };
}

export function selectIp68SidewallResource(input: { family: string; currentA: number; busHeightMm: number; busThicknessMm: number; packagesPerPhase: number }) {
  const heightMm = Math.max(0, input.busHeightMm) + IP68_SIDEWALL_ALLOWANCE_MM;
  return {
    kind: "sheet" as const,
    code: "Ц0000070687",
    designation: `Лист алюминий АМг3 2,0×1200×3000 — боковина IP68 ${heightMm} мм`,
    heightMm,
    thicknessMm: 2,
    densityKgM3: 2700,
    pricePerKg: 592.9,
    basis: `${input.family} IP68 ${input.currentA} А; шина ${input.busThicknessMm}×${input.busHeightMm} мм; ${input.packagesPerPhase} шт./фазу; боковина ${input.busHeightMm}+${IP68_SIDEWALL_ALLOWANCE_MM}=${heightMm} мм; подтверждённого профиля IP68 этой высоты нет — изготовление из листа`,
  };
}
