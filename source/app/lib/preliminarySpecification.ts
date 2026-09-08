export const COMMERCIAL_LENGTH_DEFAULTS_MM = {
  S1: 750,
  S2: 1500,
  S3: 2500,
} as const;

export type CommercialLengthClass = keyof typeof COMMERCIAL_LENGTH_DEFAULTS_MM;

export type PreliminarySpecificationRow = {
  id: string;
  rowNumber: string;
  article: string;
  item: string;
  quantity: number;
  unit: string;
  lengthClass: CommercialLengthClass | "";
  commercialLengthMm: number;
  sourcePriceRub: number;
};

export type PreliminarySpecification = {
  id: string;
  number: string;
  date: string;
  filename: string;
  projectName: string;
  customer: string;
  supplier: string;
  rows: PreliminarySpecificationRow[];
  markupPercent: number;
  vatPercent: number;
  loadedAt: string;
  recordId?: number;
  documentRecordId?: number;
};

export type CommercialRowEstimate = {
  rowId: string;
  unitCost: number;
  totalCost: number;
  status: "calculated" | "excluded";
  reason: string;
};

export type CommercialEstimate = {
  rows: CommercialRowEstimate[];
  baseCost: number;
  markupAmount: number;
  subtotalWithMarkup: number;
  vatAmount: number;
  contractTotal: number;
  calculatedRows: number;
  excludedRows: number;
};

const normalize = (value: unknown) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const normalizeHeader = (value: unknown) => normalize(value).toLowerCase();
const numberValue = (value: unknown) => {
  const parsed = Number(normalize(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

function findColumn(headers: unknown[], patterns: string[]) {
  return headers.findIndex((cell) => patterns.some((pattern) => normalizeHeader(cell).includes(pattern)));
}

function metadataValue(matrix: unknown[][], label: string) {
  for (const row of matrix) {
    const index = row.findIndex((cell) => normalizeHeader(cell) === label);
    if (index < 0) continue;
    const value = row.slice(index + 1).map(normalize).find(Boolean);
    if (value) return value;
  }
  return "";
}

export function inferCommercialLength(article: string) {
  const normalized = normalize(article).toUpperCase();
  const match = normalized.match(/-(S[123])(?:$|-)/);
  const lengthClass = (match?.[1] ?? "") as CommercialLengthClass | "";
  if (lengthClass) return { lengthClass, lengthMm: COMMERCIAL_LENGTH_DEFAULTS_MM[lengthClass] };
  if (/-FE(?:$|-)/.test(normalized)) return { lengthClass: "" as const, lengthMm: 3000 };
  return { lengthClass: "" as const, lengthMm: 0 };
}

export function parsePreliminaryMatrix(matrix: unknown[][], filename: string, loadedAt = new Date().toISOString()): PreliminarySpecification {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => normalizeHeader(cell).includes("part no./артикул")));
  if (headerIndex < 0) throw new Error("Не найдена строка заголовков предварительной спецификации.");
  const headers = matrix[headerIndex];
  const rowNumberIndex = findColumn(headers, ["№"]);
  const articleIndex = findColumn(headers, ["part no./артикул", "артикул"]);
  const itemIndex = findColumn(headers, ["name/наименование", "наименование"]);
  const unitIndex = findColumn(headers, ["ед. изм"]);
  const quantityIndex = findColumn(headers, ["q-ty/кол.", "кол.", "количество"]);
  const priceIndex = findColumn(headers, ["цена rub", "цена"]);
  if (articleIndex < 0 || itemIndex < 0 || quantityIndex < 0) throw new Error("В спецификации не найдены обязательные колонки: артикул, наименование и количество.");

  const rows = matrix.slice(headerIndex + 1).map((row, index): PreliminarySpecificationRow | null => {
    const article = normalize(row[articleIndex]);
    const item = normalize(row[itemIndex]);
    const quantity = numberValue(row[quantityIndex]);
    if (!article && !item) return null;
    if (!(quantity > 0)) return null;
    const inferred = inferCommercialLength(article);
    return {
      id: `${filename}-${index}`,
      rowNumber: normalize(row[rowNumberIndex]) || String(index + 1),
      article,
      item,
      quantity,
      unit: normalize(row[unitIndex]) || "шт.",
      lengthClass: inferred.lengthClass,
      commercialLengthMm: inferred.lengthMm,
      sourcePriceRub: numberValue(row[priceIndex]),
    };
  }).filter((row): row is PreliminarySpecificationRow => Boolean(row));
  if (!rows.length) throw new Error("В предварительной спецификации не найдено позиций с количеством.");

  let number = "";
  let date = "";
  for (const row of matrix.slice(0, headerIndex)) {
    const values = row.map(normalize);
    const specIndex = values.findIndex((value) => /specification\/спецификация №/i.test(value));
    if (specIndex >= 0) number = values.slice(specIndex + 1).find(Boolean) ?? number;
    const dateMarker = values.findIndex((value) => value.toLowerCase() === "от");
    if (dateMarker >= 0) date = values.slice(dateMarker + 1).find(Boolean) ?? date;
  }
  const fallbackNumber = filename.match(/(\d{4,})/)?.[1] ?? `Предв-${Date.now()}`;
  return {
    id: `${number || fallbackNumber}-${loadedAt}`,
    number: number || fallbackNumber,
    date: date || "Дата не определена",
    filename,
    projectName: metadataValue(matrix, "проект:") || filename.replace(/\.[^.]+$/, ""),
    customer: metadataValue(matrix, "заказчик:"),
    supplier: metadataValue(matrix, "поставщик:"),
    rows,
    markupPercent: 22,
    vatPercent: 20,
    loadedAt,
  };
}

export function commercialTotals(baseCost: number, markupPercent: number, vatPercent: number) {
  const safeBase = Math.max(0, Number(baseCost) || 0);
  const safeMarkup = Math.max(0, Number(markupPercent) || 0);
  const safeVat = Math.max(0, Number(vatPercent) || 0);
  const markupAmount = safeBase * safeMarkup / 100;
  const subtotalWithMarkup = safeBase + markupAmount;
  const vatAmount = subtotalWithMarkup * safeVat / 100;
  return { baseCost: safeBase, markupAmount, subtotalWithMarkup, vatAmount, contractTotal: subtotalWithMarkup + vatAmount };
}
