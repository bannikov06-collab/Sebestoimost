export type BreakerCatalogRow = {
  key: string;
  manufacturer: string;
  article: string;
  model?: string;
  name: string;
  currentA: number;
  poles?: number;
  komType?: string;
  sourcePrice: number;
  sourceDate: string;
  sourceFile: string;
  sourceSheet?: string;
  status?: string;
};

export type BreakerOrderRow = {
  rowNumber: string;
  item: string;
  article: string;
  marking?: string;
  drawingNumber?: string;
  quantity: number;
};

export type BreakerStockRow = {
  name: string;
  code: string;
  article: string;
  unit: string;
  balance: number;
};

export const normalizeBreakerArticle = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s"'«»¶]+/g, "")
    .trim();

export const normalizeBreakerName = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[×х]/g, "x")
    .replace(/["'«»¶(),.;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function isBreakerText(value: unknown) {
  const name = normalizeBreakerName(value);
  const match = name.match(
    /автоматическ[а-я]*\s+выключател[а-я]*|выключател[а-я]*\s+(?:дифференциальн[а-я]*\s+)?автоматическ[а-я]*|дифференциальн[а-я]*\s+автомат[а-я]*|авт\.?\s*выкл/,
  );
  if (!match || (match.index ?? 999) >= 55) return false;
  return !/(пластрон|панел|корпус|шкаф|аксессуар|принадлежн|комплект|расцепител|контакт|привод|рукоят|основан)/.test(
    name.slice(0, match.index),
  );
}

export function buildBreakerIndexes(catalog: BreakerCatalogRow[]) {
  const byArticle = new Map<string, BreakerCatalogRow>();
  const byName = new Map<string, BreakerCatalogRow[]>();
  for (const item of catalog) {
    const article = normalizeBreakerArticle(item.article);
    if (article && !byArticle.has(article)) byArticle.set(article, item);
    const name = normalizeBreakerName(item.name);
    const rows = byName.get(name) ?? [];
    rows.push(item);
    byName.set(name, rows);
  }
  return { byArticle, byName };
}

export function matchBreaker(
  row: BreakerOrderRow,
  indexes: ReturnType<typeof buildBreakerIndexes>,
) {
  const exactArticle = normalizeBreakerArticle(row.article);
  if (exactArticle && indexes.byArticle.has(exactArticle)) {
    return { item: indexes.byArticle.get(exactArticle), basis: "Точный артикул", confidence: "Высокая" as const };
  }

  const tokens = `${row.item} ${row.marking ?? ""} ${row.drawingNumber ?? ""}`
    .split(/[\s,;()]+/)
    .map(normalizeBreakerArticle)
    .filter((token) => token.length >= 5);
  for (const token of tokens) {
    const item = indexes.byArticle.get(token);
    if (item) {
      return { item, basis: "Артикул найден в наименовании/маркировке", confidence: "Высокая" as const };
    }
  }

  const nameMatches = indexes.byName.get(normalizeBreakerName(row.item)) ?? [];
  if (nameMatches.length === 1) {
    return { item: nameMatches[0], basis: "Точное нормализованное наименование", confidence: "Средняя" as const };
  }
  if (nameMatches.length > 1) {
    return { item: undefined, basis: "Наименование совпало с несколькими артикулами", confidence: "Низкая" as const };
  }
  return { item: undefined, basis: "Совпадение по артикулу и полному наименованию не найдено", confidence: "Низкая" as const };
}

export function matchBreakerStock(
  orderRow: BreakerOrderRow,
  catalogItem: BreakerCatalogRow | undefined,
  stock: BreakerStockRow[],
) {
  const orderArticle = normalizeBreakerArticle(orderRow.article);
  const vendorArticle = normalizeBreakerArticle(catalogItem?.article);
  const exact = stock.find((row) => {
    const code = normalizeBreakerArticle(row.code);
    const article = normalizeBreakerArticle(row.article);
    return Boolean(
      (orderArticle && (code === orderArticle || article === orderArticle)) ||
        (vendorArticle && article === vendorArticle),
    );
  });
  if (exact) return { item: exact, basis: "Артикул/код 1С" };

  const orderName = normalizeBreakerName(orderRow.item);
  const catalogName = normalizeBreakerName(catalogItem?.name);
  const nameMatches = stock.filter((row) => {
    const name = normalizeBreakerName(row.name);
    return name === orderName || Boolean(catalogName && name === catalogName);
  });
  if (nameMatches.length === 1) return { item: nameMatches[0], basis: "Точное наименование" };
  return { item: undefined, basis: nameMatches.length > 1 ? "Несколько строк склада" : "В остатках не найден" };
}
