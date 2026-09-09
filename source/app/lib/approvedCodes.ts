import aliases from '../data/approvedCodeAliases.json';

type Alias = {
  number: number;
  contour: string;
  node: string;
  designation: string;
  name: string;
  unit: string;
  code: string;
  source: string;
  confidence: string;
};

const rows = aliases as Alias[];
const normalize = (value: unknown) => String(value ?? '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[×х]/g, '*')
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

export function findApprovedCode(input: { name?: string; designation?: string; contour?: string }) {
  const designation = normalize(input.designation);
  const name = normalize(input.name);
  const contour = normalize(input.contour);
  const byDesignation = designation && designation !== '-'
    ? rows.find((row) => normalize(row.designation) === designation && (!contour || normalize(row.contour) === contour))
    : undefined;
  if (byDesignation) return byDesignation;
  return rows.find((row) => normalize(row.name) === name && (!contour || normalize(row.contour) === contour));
}

export function approvedCodeRows() {
  return rows;
}
