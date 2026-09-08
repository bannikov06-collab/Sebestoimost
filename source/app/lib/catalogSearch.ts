export type SearchableCatalogItem = {
  id: number;
  sourceNumber: number;
  code: string;
  name: string;
};

const normalize = (value: string) =>
  value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export function searchCatalog<T extends SearchableCatalogItem>(items: T[], query: string) {
  const normalized = normalize(query);
  if (!normalized) return items;
  return items.filter((item) =>
    normalize(`${item.sourceNumber} ${item.code} ${item.name}`).includes(normalized),
  );
}
