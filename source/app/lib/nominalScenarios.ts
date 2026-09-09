import type { PreliminarySpecification, PreliminarySpecificationRow } from './preliminarySpecification';

export const NOMINAL_SCALE_A = [250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300] as const;

const currentByArticle: Record<string, number> = {
  '02': 250, '03': 315, '04': 400, '05': 500, '06': 630, '08': 800,
  '10': 1000, '12': 1250, '16': 1600, '20': 2000, '25': 2500,
  '32': 3200, '40': 4000, '50': 5000, '63': 6300,
};
const articleByCurrent = Object.fromEntries(Object.entries(currentByArticle).map(([code, current]) => [current, code])) as Record<number, string>;

export type NominalShift = { rowId: string; from: number | null; to: number | null; supported: boolean };

export function shiftArticleNominal(article: string, steps: 0 | 1 | 2) {
  if (steps === 0) {
    const current = article.split('-').map((part) => part.toUpperCase()).map((part) => currentByArticle[part]).find(Boolean) ?? null;
    return { article, from: current, to: current, supported: current !== null };
  }
  const parts = article.split('-');
  const index = parts.findIndex((part) => currentByArticle[part.toUpperCase()]);
  if (index < 0) return { article, from: null, to: null, supported: false };
  const from = currentByArticle[parts[index].toUpperCase()];
  const scaleIndex = NOMINAL_SCALE_A.indexOf(from as typeof NOMINAL_SCALE_A[number]);
  const targetIndex = scaleIndex - steps;
  if (scaleIndex < 0 || targetIndex < 0) return { article, from, to: null, supported: false };
  const to = NOMINAL_SCALE_A[targetIndex];
  const targetCode = articleByCurrent[to];
  if (!targetCode) return { article, from, to, supported: false };
  const next = [...parts];
  next[index] = targetCode;
  return { article: next.join('-'), from, to, supported: true };
}

export function shiftPreliminaryNominal(specification: PreliminarySpecification, steps: 0 | 1 | 2) {
  const shifts: NominalShift[] = [];
  const rows = specification.rows.map((row: PreliminarySpecificationRow) => {
    const shifted = shiftArticleNominal(row.article, steps);
    shifts.push({ rowId: row.id, from: shifted.from, to: shifted.to, supported: shifted.supported });
    return shifted.supported ? { ...row, article: shifted.article } : row;
  });
  return { specification: { ...specification, rows }, shifts };
}
