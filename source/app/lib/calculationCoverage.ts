export type CalculationCoverageStatus = "calculated" | "partial" | "missing";

export type CalculationCoverage = {
  family: string;
  status: CalculationCoverageStatus;
  reason: string;
  required: string[];
};

const FULL_CALCULATION = new Set(["FE", "CD", "CP", "ZD", "ZP", "TP", "ZDP", "TD", "ATCP", "ATCD", "G"]);

const ATSC_REQUIRED = [
  "полный подтверждённый BOM/состав ATSC по каждому исполнению",
  "сопоставление каждой позиции BOM с материалом и кодом 1С либо признаком собственного производства",
  "нормы производственных операций для деталей собственного производства",
];

const ATT_REQUIRED = [
  "для номиналов кроме 1000/3200/5000 А — соответствующая КД ATT",
  "недостающие коды 1С/цены для отдельных деталей и крепежа",
  "производственные нормы времени для ATT",
];

const CML_REQUIRED = [
  "для номиналов кроме 3200 А — соответствующая КД CML и базовая стандартная геометрия",
  "код/цена АД1М 0,3 мм для гибких пластин КША",
  "цены GM-3828 и термоусадки, код оцинкованного листа крышки",
  "производственная норма сборки CML/КША",
];

const GENERIC_REQUIRED = [
  "КД или сборочный чертёж элемента",
  "спецификация/BOM с количеством деталей",
  "таблица стандартных размеров по номиналу и 4P/5P, если геометрия меняется",
  "материалы и подтверждённые коды 1С либо признак собственного производства",
  "нормы производственных операций для собственных деталей",
];

export function normalizeElementFamily(value: string, knownCodes: string[] = []) {
  const source = String(value ?? "").toUpperCase().replace(/С/g, "C").replace(/Р/g, "P").replace(/\s+/g, " ").trim();
  const candidates = [...new Set(knownCodes.map((code) => String(code).toUpperCase().replace(/С/g, "C").replace(/Р/g, "P").trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, "i").test(source)) return candidate;
  }
  const match = source.match(/(?:^|[-\s])([A-Z]{1,8}(?:\+[A-Z]{1,8})?)(?=[-\s]|$)/);
  return match?.[1] ?? "НЕ РАСПОЗНАНО";
}

export function getCalculationCoverage(familyValue: string): CalculationCoverage {
  const family = String(familyValue || "НЕ РАСПОЗНАНО").toUpperCase().replace(/С/g, "C").replace(/Р/g, "P");
  if (FULL_CALCULATION.has(family)) {
    return {
      family,
      status: "calculated",
      reason: family === "G"
        ? "Расчёт разрешён только для отдельной строки G в спецификации; в состав секции G автоматически не добавляется."
        : "Для семейства включена действующая расчётная модель.",
      required: [],
    };
  }
  if (family === "ATT") {
    return {
      family,
      status: "partial",
      reason: "ATT 4P для 1000/3200/5000 А имеет материальную модель по КД и утверждённым правилам. Остальные номиналы не распространяются автоматически.",
      required: ATT_REQUIRED,
    };
  }
  if (family === "CML") {
    return {
      family,
      status: "partial",
      reason: "CML 3200 4P рассчитан по двум стандартным FE, КША и постоянному BOM. Для других номиналов модель не копируется без КД.",
      required: CML_REQUIRED,
    };
  }
  if (family === "ATSC") {
    return {
      family,
      status: "partial",
      reason: "ATSC выделен в отдельный блок и имеет стандартные размеры, но общий BOM обычной секции для него запрещён.",
      required: ATSC_REQUIRED,
    };
  }
  return {
    family,
    status: "missing",
    reason: "Полное расчётное правило для этого семейства не утверждено владельцем правил.",
    required: GENERIC_REQUIRED,
  };
}

export function buildCalculationAudit<T extends { family: string; quantity: number; article?: string; examples?: string[] }>(rows: T[]) {
  return rows.map((row) => ({ ...row, coverage: getCalculationCoverage(row.family) }));
}
