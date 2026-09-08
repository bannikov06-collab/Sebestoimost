export type AvailabilityStatus = "warehouse" | "in_transit" | "manufacturer_ready";

export type ControlDemand = {
  name: string;
  unit: string;
  qty: number;
  price?: number;
  total?: number;
  group?: string;
};

export type AvailabilityLine = {
  id?: number;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  status: AvailabilityStatus;
  source?: string;
  confirmed?: boolean;
};

export type ControlResultLine = {
  key: string;
  code: string;
  name: string;
  unit: string;
  requiredQty: number;
  coveredQty: number;
  procurementQty: number;
  unitPrice: number | null;
  baseCost: number | null;
  procurementCost: number | null;
  confidence: "confirmed" | "unresolved";
  reason: string;
};

export type ControlScenario = {
  statuses: AvailabilityStatus[];
  rows: ControlResultLine[];
  baseMaterialCost: number | null;
  procurementCost: number | null;
  coveredRows: number;
  unresolvedRows: number;
  unknownPriceRows: number;
};

export type ReferenceLine = { code: string; unit: string; quantity: number };

export type ControlValidation = {
  codesExact: boolean;
  quantitiesExact: boolean;
  costWithinTolerance: boolean | null;
  costDeviationPercent: number | null;
  passed: boolean;
};

const normalizeCode = (value: unknown) => {
  const code = String(value ?? "").trim().toUpperCase();
  return /^\d+$/.test(code) ? code.replace(/^0+(?=\d)/, "") : code;
};

export const normalizeControlUnit = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/пог\.?\s*м/g, "м")
    .replace(/бал\.?/g, "шт")
    .replace(/\s+/g, " ");

export const extractControlCode = (value: unknown) =>
  String(value ?? "")
    .trim()
    .match(/^(Ц\d{10}|УТ\d{9}|\d{11})\s*[·•-]/i)?.[1]
    ?.toUpperCase() ?? "";

const poolKey = (code: string, unit: string) =>
  `${normalizeCode(code)}|${normalizeControlUnit(unit)}`;

function monetaryValue(item: ControlDemand) {
  const qty = Number(item.qty);
  const total = Number(item.total);
  const price = Number(item.price);
  if (Number.isFinite(total) && total > 0) return { total, unitPrice: qty > 0 ? total / qty : null };
  if (Number.isFinite(price) && price > 0 && qty > 0) return { total: price * qty, unitPrice: price };
  return { total: null, unitPrice: null };
}

export function calculateControlScenario(
  demand: ControlDemand[],
  availability: AvailabilityLine[],
  statuses: AvailabilityStatus[],
): ControlScenario {
  const selected = new Set(statuses);
  const pool = new Map<string, number>();
  const unitsByCode = new Map<string, Set<string>>();

  availability.forEach((line) => {
    if (!selected.has(line.status) || !(line.quantity > 0) || !line.code.trim()) return;
    if (line.status !== "warehouse" && line.confirmed !== true) return;
    const code = normalizeCode(line.code);
    const unit = normalizeControlUnit(line.unit);
    const key = poolKey(code, unit);
    pool.set(key, (pool.get(key) ?? 0) + line.quantity);
    const units = unitsByCode.get(code) ?? new Set<string>();
    units.add(unit);
    unitsByCode.set(code, units);
  });

  const rows = demand.map<ControlResultLine>((item, index) => {
    const requiredQty = Math.max(0, Number(item.qty) || 0);
    const code = extractControlCode(item.name);
    const money = monetaryValue(item);
    const key = code ? poolKey(code, item.unit) : `unresolved|${index}`;
    let coveredQty = 0;
    let confidence: ControlResultLine["confidence"] = "confirmed";
    let reason = statuses.length
      ? "Точное совпадение по подтверждённому коду 1С и единице измерения"
      : "Полная потребность без учёта обеспеченности";

    if (!code) {
      confidence = "unresolved";
      reason = "Нет подтверждённого кода 1С — обеспеченность автоматически не списана";
    } else if (statuses.length) {
      const available = pool.get(key) ?? 0;
      coveredQty = Math.min(requiredQty, available);
      pool.set(key, Math.max(0, available - coveredQty));
      if (!available) {
        const codeUnits = unitsByCode.get(normalizeCode(code));
        if (codeUnits?.size) {
          confidence = "unresolved";
          reason = `Код найден, но единица «${item.unit}» не совпадает; коэффициент пересчёта не подтверждён`;
        } else {
          reason = "Подтверждённый код отсутствует в выбранных источниках обеспеченности";
        }
      }
    }

    const procurementQty = Math.max(0, requiredQty - coveredQty);
    const procurementCost = money.unitPrice === null ? null : money.unitPrice * procurementQty;
    return {
      key: `${index}|${code}|${item.name}|${item.unit}`,
      code,
      name: item.name,
      unit: item.unit,
      requiredQty,
      coveredQty,
      procurementQty,
      unitPrice: money.unitPrice,
      baseCost: money.total,
      procurementCost,
      confidence,
      reason,
    };
  });

  const baseValues = rows.map((row) => row.baseCost);
  const procurementValues = rows.map((row) => row.procurementCost);
  const unknownPriceRows = rows.filter((row) => row.requiredQty > 0 && row.unitPrice === null).length;
  return {
    statuses: [...statuses],
    rows,
    baseMaterialCost: baseValues.some((value) => value === null)
      ? null
      : baseValues.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    procurementCost: procurementValues.some((value) => value === null)
      ? null
      : procurementValues.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    coveredRows: rows.filter((row) => row.requiredQty > 0 && row.procurementQty === 0).length,
    unresolvedRows: rows.filter((row) => row.confidence === "unresolved").length,
    unknownPriceRows,
  };
}

export function reserveAvailability(
  availability: AvailabilityLine[],
  reservedDemands: ControlDemand[][],
): AvailabilityLine[] {
  const remaining = availability.map((line) => ({ ...line, quantity: Math.max(0, line.quantity) }));
  const indexes = new Map<string, number[]>();
  remaining.forEach((line, index) => {
    const key = poolKey(line.code, line.unit);
    indexes.set(key, [...(indexes.get(key) ?? []), index]);
  });
  reservedDemands.flat().forEach((item) => {
    const code = extractControlCode(item.name);
    if (!code) return;
    let quantity = Math.max(0, Number(item.qty) || 0);
    for (const index of indexes.get(poolKey(code, item.unit)) ?? []) {
      if (!(quantity > 0)) break;
      const used = Math.min(quantity, remaining[index].quantity);
      remaining[index].quantity -= used;
      quantity -= used;
    }
  });
  return remaining;
}

export function validateControlResult(
  actual: ControlResultLine[],
  reference: ReferenceLine[],
  actualCost: number | null,
  referenceCost: number | null,
  costTolerancePercent = 1,
): ControlValidation {
  const actualMap = new Map<string, number>();
  actual.forEach((row) => {
    if (!row.code) return;
    const key = poolKey(row.code, row.unit);
    actualMap.set(key, (actualMap.get(key) ?? 0) + row.requiredQty);
  });
  const referenceMap = new Map<string, number>();
  reference.forEach((row) => {
    const key = poolKey(row.code, row.unit);
    referenceMap.set(key, (referenceMap.get(key) ?? 0) + row.quantity);
  });
  const actualCodes = [...actualMap.keys()].sort();
  const referenceCodes = [...referenceMap.keys()].sort();
  const codesExact = actualCodes.length === referenceCodes.length && actualCodes.every((key, index) => key === referenceCodes[index]);
  const quantitiesExact = codesExact && actualCodes.every((key) => actualMap.get(key) === referenceMap.get(key));
  const costDeviationPercent = actualCost === null || referenceCost === null || referenceCost === 0
    ? null
    : Math.abs(actualCost - referenceCost) / Math.abs(referenceCost) * 100;
  const costWithinTolerance = costDeviationPercent === null ? null : costDeviationPercent <= costTolerancePercent;
  return {
    codesExact,
    quantitiesExact,
    costWithinTolerance,
    costDeviationPercent,
    passed: codesExact && quantitiesExact && costWithinTolerance === true,
  };
}
