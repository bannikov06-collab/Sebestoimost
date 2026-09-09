import { standardDimensionsData as data } from "../data/standardDimensionsData.ts";

export type PoleCount = 4 | 5;
export type DimensionSource = "standard" | "specification" | "manual";

export type BusStandard = {
  overallHeight: number;
  coverWidth: number;
  packsPerPhase: number;
  barHeight: number;
  barThickness: number;
};

type SectionStandard = {
  dims: number;
  step: number;
  "4": Readonly<Record<string, readonly number[]>>;
  "5": Readonly<Record<string, readonly number[]>>;
};

type StandardData = {
  source: string;
  sheet: string;
  currents: readonly number[];
  bus: {
    "4": Readonly<Record<string, BusStandard>>;
    "5": Readonly<Record<string, BusStandard>>;
  };
  sections: Readonly<Record<string, SectionStandard>>;
};

const standards = data as unknown as StandardData;

export const STANDARD_DIMENSIONS_SOURCE = `${standards.source} · ${standards.sheet}`;
export const STANDARD_CURRENTS = [...standards.currents];

export function getBusStandard(current: number, poles: PoleCount = 4): BusStandard | null {
  return standards.bus[String(poles) as "4" | "5"]?.[String(current)] ?? null;
}

export function getCalculationBusConfig(current: number, poles: PoleCount = 4) {
  const row = getBusStandard(current, poles);
  if (!row) return null;
  return {
    count: row.packsPerPhase,
    height: row.barHeight,
    thickness: row.barThickness,
    overallHeight: row.overallHeight,
    coverWidth: row.coverWidth,
  };
}

export function getSectionStandard(code: string) {
  return standards.sections[code] ?? null;
}

export function getStandardDimensions(code: string, current: number, poles: PoleCount = 4): number[] {
  const section = getSectionStandard(code);
  if (!section) return [];
  const values = section[String(poles) as "4" | "5"]?.[String(current)] ?? [];
  return [...values];
}

export function getStandardDimensionMeta(code: string) {
  const section = getSectionStandard(code);
  return section ? { dims: section.dims, step: section.step } : null;
}

export function detectPoleCount(value: string): PoleCount {
  const normalized = String(value || "").toUpperCase().replace(/Р/g, "P").replace(/\s+/g, "");
  return /(?:^|[-_.])5P(?:$|[-_.])/.test(normalized) || /(?:^|[-_.])5(?:$|[-_.])/.test(normalized) ? 5 : 4;
}
