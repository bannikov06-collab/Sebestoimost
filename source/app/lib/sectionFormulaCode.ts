export type SupportedSectionCode =
  | "FE" | "CD" | "CP" | "ZD" | "ZP" | "TP" | "ZDP" | "TD"
  | "ATT" | "CML" | "ATSC" | "ATCP" | "ATCD";

export type FormulaCatalogItem = { id: number; code: string; name?: string };

const defaultTypeIdByCode: Record<SupportedSectionCode, number> = {
  ZP: 9,
  ZDP: 19,
  ZD: 20,
  TP: 33,
  TD: 35,
  CML: 115,
  ATT: 137,
  FE: 104,
  CP: 113,
  CD: 122,
  ATSC: 145,
  ATCP: 148,
  ATCD: 150,
};

const directById = new Map<number, SupportedSectionCode>(
  Object.entries(defaultTypeIdByCode).map(([code, id]) => [id, code as SupportedSectionCode]),
);

const normalizeCode = (value: string) =>
  value.toUpperCase().replace(/Ё/g, "Е").replace(/[–—]/g, "-").replace(/\s+/g, "");

/**
 * Resolve a catalog row to an approved calculation family.
 * Aliases are intentionally conservative. Pi without EC is an ordinary straight
 * section and uses the FE straight-section formula. Pi-EC is NOT silently mapped
 * because the end-cap composition can differ and requires its own approved rule.
 */

/**
 * Resolve the calculation family directly from a specification article.
 * Important: S1/S2/S3 are commercial length classes, NOT the SA geometry suffix.
 * Article recognition therefore takes precedence over catalog-name matching.
 */
export function resolveFormulaCodeFromArticle(article: string): SupportedSectionCode | undefined {
  const code = normalizeCode(article || '');
  // Joint G is a separate assembly, never a section formula family.
  if (/(?:G\.001\.000|012\.001\.000|СТЫК|СТЫКОВОЧ|(?:^|-)G(?:-|$))/.test(code)) return undefined;
  const tokens = code.split('-').filter(Boolean);
  const has = (token: string) => tokens.includes(token);

  if (has('CML')) return 'CML';
  if (has('ATT')) return 'ATT';
  if (has('ATSC')) return 'ATSC';
  if (has('ATCP')) return 'ATCP';
  if (has('ATCD')) return 'ATCD';
  if (has('ZDP')) return 'ZDP';
  if (has('ZD')) return 'ZD';
  if (has('ZP')) return 'ZP';
  if (has('TP')) return 'TP';
  if (has('TD')) return 'TD';
  if (has('CP')) return 'CP';
  if (has('CD')) return 'CD';
  if (has('FE')) return 'FE';
  if (tokens.some((token) => /^PI(?:\d+)?$/.test(token)) && !has('EC')) return 'FE';
  return undefined;
}

export function resolveFormulaCode(item: FormulaCatalogItem | undefined): SupportedSectionCode | undefined {
  if (!item) return undefined;
  const direct = directById.get(item.id);
  if (direct) return direct;

  const code = normalizeCode(item.code || '');
  // Preliminary calculation aliases. End-cap (EC) variants remain blocked because their BOM differs.
  if (!/(?:^|-)EC(?:$|-)/.test(code) && /^PI(?:-?\d+)?$/.test(code)) return 'FE';
  if (!/(?:^|-)EC(?:$|-)/.test(code) && /^(?:FE(?:-S[0-9Z]+)?|FE4)$/.test(code)) return 'FE';
  if (/^CD(?:-?SA)?$/.test(code)) return 'CD';
  if (/^CP(?:-?SA)?$/.test(code)) return 'CP';
  if (/^ZD(?:-?SA)?$/.test(code)) return 'ZD';
  if (/^ZP(?:-?SA)?$/.test(code)) return 'ZP';
  if (/^TP$/.test(code)) return 'TP';
  if (/^ZDP(?:-?SA)?$/.test(code)) return 'ZDP';
  if (/^TD$/.test(code)) return 'TD';
  if (/^ATT$/.test(code)) return "ATT";
  if (/^CML$/.test(code)) return "CML";
  if (/^ATSC$/.test(code)) return "ATSC";
  if (/^ATCP$/.test(code)) return "ATCP";
  if (/^ATCD$/.test(code)) return "ATCD";
  return undefined;
}
