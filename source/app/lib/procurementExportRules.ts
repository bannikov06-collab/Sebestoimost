export type ProcurementStockMode = "with-stock" | "without-stock";

export type ProcurementRowLike = {
  name: string;
  stock?: { name?: string };
  demand: number;
  shortage: number;
  requiredOrder?: number;
  unitPrice: number;
};

export type CompositionRowLike = {
  orderLabel: string;
  component: string;
  article: string;
  nominalA: number;
  poles: string;
  quantity: number;
  kind: "Секция" | "КОМ" | "Стык";
  calculated: boolean;
};

export const procurementModeLabel = (mode: ProcurementStockMode) =>
  mode === "with-stock" ? "С учётом складских остатков" : "Без учёта складских остатков";

export function procurementOrderQuantity(row: ProcurementRowLike, mode: ProcurementStockMode) {
  if (mode === "without-stock" || !row.stock) return Math.max(0, row.demand);
  return Math.max(0, row.requiredOrder ?? row.shortage);
}

export function procurementOrderCost(row: ProcurementRowLike, mode: ProcurementStockMode) {
  return procurementOrderQuantity(row, mode) * Math.max(0, row.unitPrice || 0);
}

export function procurementMaterialGroup(row: Pick<ProcurementRowLike, "name" | "stock">) {
  const text = `${row.stock?.name ?? ""} ${row.name}`.toLowerCase().replace(/ё/g, "е");
  if (/шина/.test(text)) return "01 · Шина";
  if (/профил/.test(text)) return "02 · Профиль";
  if (/лист|листов/.test(text)) return "03 · Лист";
  return "04 · Прочие материалы";
}

export function sortProcurementRows<T extends ProcurementRowLike>(rows: T[]) {
  return [...rows].sort((left, right) =>
    procurementMaterialGroup(left).localeCompare(procurementMaterialGroup(right), "ru") ||
    (left.stock?.name ?? left.name).localeCompare(right.stock?.name ?? right.name, "ru"),
  );
}

export type CompositionSummaryRow = {
  orderLabel: string;
  kind: CompositionRowLike["kind"];
  component: string;
  article: string;
  nominalA: number;
  poles: string;
  quantity: number;
  calculatedQuantity: number;
  uncalculatedQuantity: number;
};

export function summarizeComposition(rows: CompositionRowLike[]): CompositionSummaryRow[] {
  const result = new Map<string, CompositionSummaryRow>();
  for (const row of rows) {
    const key = [row.orderLabel, row.kind, row.component, row.article, row.nominalA, row.poles].join("|");
    const old = result.get(key);
    const quantity = Math.max(0, Number(row.quantity) || 0);
    result.set(key, {
      orderLabel: row.orderLabel,
      kind: row.kind,
      component: row.component,
      article: row.article,
      nominalA: row.nominalA,
      poles: row.poles,
      quantity: (old?.quantity ?? 0) + quantity,
      calculatedQuantity: (old?.calculatedQuantity ?? 0) + (row.calculated ? quantity : 0),
      uncalculatedQuantity: (old?.uncalculatedQuantity ?? 0) + (row.calculated ? 0 : quantity),
    });
  }
  const order = { "Секция": 0, "КОМ": 1, "Стык": 2 } as const;
  return [...result.values()].sort((left, right) =>
    left.orderLabel.localeCompare(right.orderLabel, "ru") ||
    order[left.kind] - order[right.kind] ||
    left.nominalA - right.nominalA ||
    left.component.localeCompare(right.component, "ru"),
  );
}

export function isDiscontinuedSintokarton(value: unknown) {
  const text = String(value ?? "").toLowerCase().replace(/ё/g, "е");
  return text.includes("синтокартон") || text.includes("пск-515") || text.includes("ц0000056495");
}
