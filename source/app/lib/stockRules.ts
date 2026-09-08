export const CONFIRMED_M6X16_DIN6921_CODE = "УТ000003151";

const normalize = (value: unknown) => String(value ?? "")
  .toLowerCase()
  .replace(/ё/g, "е")
  .replace(/[×х]/g, "*")
  .replace(/\s+/g, " ")
  .trim();

export function findM6x16Din6921<T extends { name: string; article: string }>(demandName: string, stock: T[]) {
  const demand = normalize(demandName);
  if (!(demand.includes("болт") && demand.includes("м6*16") && demand.includes("din 6921"))) return [];
  return stock.filter((row) => {
    const value = normalize(`${row.name} ${row.article}`);
    return value.includes("болт м6*16") && value.includes("din 6921");
  });
}
