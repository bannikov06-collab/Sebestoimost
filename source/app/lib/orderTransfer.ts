import type { ProjectOrder } from "../components/ProjectCompositionPanel";

export type UnsupportedOrderRow = { rowNumber: string; item: string; article: string; quantity: number; reason: string };
export type DefaultedOrderRow = { rowNumber: string; article: string; dimensions: string[] };
export type ConvertedOrderElement<Code extends string> = { code: Code; current: number; lengths: number[]; quantity: number };

type OrderConversionConfig<Code extends string> = {
  currentByArticle: Record<string, number>;
  codes: readonly Code[];
  currentExists: (current: number) => boolean;
  dimensionSpec: (code: Code, current: number) => { dims: number; defaults: number[] };
};

export function convertOrder<Code extends string>(order: ProjectOrder, config: OrderConversionConfig<Code>) {
  const unsupportedRows: UnsupportedOrderRow[] = [];
  const defaultedRows: DefaultedOrderRow[] = [];
  const parsed: ConvertedOrderElement<Code>[] = [];

  order.rows.forEach((row) => {
    const parts = row.article.split("-");
    const current = config.currentByArticle[parts[2] ?? ""];
    const code = config.codes.find((candidate) => row.article.includes(`-${candidate}`));
    let reason = "";
    if (!code) reason = "Тип элемента не поддерживается текущими ресурсными формулами";
    else if (!current || !config.currentExists(current)) reason = "Не распознан номинальный ток из артикула";
    else if (!(row.quantity > 0)) reason = "Количество должно быть больше нуля";
    if (reason || !code || !current) {
      unsupportedRows.push({ rowNumber: row.rowNumber, item: row.item, article: row.article, quantity: row.quantity, reason });
      return;
    }

    const dimensions = [row.l1, row.l2, row.l3].map((value) => Number(String(value).replace(/\u00a0/g, "").replace(/\s/g, "").replace(",", ".")) || 0);
    const specification = config.dimensionSpec(code, current);
    const defaultedDimensions: string[] = [];
    const lengths = Array.from({ length: specification.dims }, (_, index) => {
      if (dimensions[index] > 0) return dimensions[index];
      defaultedDimensions.push(`L${index + 1}=${specification.defaults[index]} мм`);
      return specification.defaults[index];
    });
    if (defaultedDimensions.length) defaultedRows.push({ rowNumber: row.rowNumber, article: row.article, dimensions: defaultedDimensions });
    parsed.push({ code, current, lengths, quantity: row.quantity });
  });

  const grouped = new Map<string, ConvertedOrderElement<Code>>();
  parsed.forEach((row) => {
    const key = `${row.code}|${row.current}|${row.lengths.join("|")}`;
    const old = grouped.get(key);
    grouped.set(key, { ...row, quantity: (old?.quantity ?? 0) + row.quantity });
  });

  return {
    elements: [...grouped.values()].filter((row) => row.quantity > 0),
    supportedRows: parsed.length,
    unsupportedRows,
    defaultedRows,
  };
}
