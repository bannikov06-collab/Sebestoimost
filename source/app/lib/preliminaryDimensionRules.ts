import { getStandardDimensionMeta, getStandardDimensions, type PoleCount } from './standardDimensions.ts';

export type PreliminaryLengthClass = 'S1' | 'S2' | 'S3' | '';

export const PRELIMINARY_CLASS_TARGET_MM = {
  S2: 1500,
  S3: 2500,
} as const;

/**
 * Approved preliminary-specification geometry rule (2026-08-30):
 * - Standard / S1 -> approved standard dimensions for family + nominal + poles.
 * - S2 / S3 -> for a one-dimension family change L1; for 2+ dimensions change only L2.
 * - All remaining dimensions stay standard.
 * - This helper is for preliminary estimation only and does not replace production/KD geometry.
 */
export function getPreliminaryDimensions(
  code: string,
  current: number,
  poles: PoleCount,
  lengthClass: PreliminaryLengthClass,
  requestedClassSizeMm = 0,
): number[] {
  const meta = getStandardDimensionMeta(code);
  if (!meta) return [];
  const standard = getStandardDimensions(code, current, poles).slice(0, meta.dims);
  if (standard.length !== meta.dims || standard.some((value) => !(value > 0))) return [];

  if (!lengthClass || lengthClass === 'S1') return standard;

  const fallbackTarget = PRELIMINARY_CLASS_TARGET_MM[lengthClass];
  const target = requestedClassSizeMm > 0 ? requestedClassSizeMm : fallbackTarget;
  if (!(target > 0)) return standard;

  const result = [...standard];
  if (meta.dims === 1) result[0] = target;
  else result[1] = target;
  return result;
}

export function preliminaryDimensionRuleText(code: string, lengthClass: PreliminaryLengthClass, requestedClassSizeMm = 0) {
  const meta = getStandardDimensionMeta(code);
  if (!meta) return 'нет подтверждённой стандартной геометрии';
  if (!lengthClass || lengthClass === 'S1') return 'стандартные размеры';
  const target = requestedClassSizeMm > 0 ? requestedClassSizeMm : PRELIMINARY_CLASS_TARGET_MM[lengthClass];
  return meta.dims === 1 ? `${lengthClass}: L1=${target} мм` : `${lengthClass}: L2=${target} мм; остальные L стандартные`;
}
