import { findM6x16Din6921 } from "./stockRules.ts";

export type PlanningDemand = {
  name: string;
  unit: string;
  qty: number;
  price?: number;
  stockLengthM?: number;
  massKg?: number;
  metricBasis?: string;
};

export type PlanningStockItem = {
  name: string;
  unit: string;
  code: string;
  article: string;
  balance: number;
};

export type StockMatch<T extends PlanningStockItem = PlanningStockItem> = {
  stock?: T;
  demandCode: string;
  factor: number;
  priceFactor: number;
  reason: string;
  convertedUnit?: string;
  roundDemandUp?: boolean;
  stockBalanceFactor?: number;
  pieceMassKg?: number;
  pieceLabel?: string;
};

const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/ё/g, "е").replace(/[×х]/g, "*").replace(/\s+/g, " ").trim();
const extractConfirmedCode = (value: unknown) => String(value ?? "").trim().match(/^(Ц\d{10}|УТ\d{9}|\d{11})\s*[·•-]/i)?.[1]?.toUpperCase() ?? "";
const normalizeCode = (value: unknown) => {
  const code = String(value ?? "").trim().toUpperCase();
  return /^\d+$/.test(code) ? code.replace(/^0+(?=\d)/, "") : code;
};
const sameUnit = (a: string, b: string) => {
  const left = normalize(a).replace("пог.м", "м").replace("бал.", "шт");
  const right = normalize(b).replace("пог.м", "м").replace("бал.", "шт");
  return left === right;
};

const isPosAlias = (value: unknown) => {
  const normalized = normalize(value).replace(/[^a-zа-я0-9]+/g, " ").trim();
  return /(^| )пос(?: 61)?( |$)/.test(normalized) || /(^| )тр 63 25( |$)/.test(normalized);
};

const STOCK_LENGTH_M = 3;
const ALUMINIUM_DENSITY_KG_M3 = 2710;
const STEEL_DENSITY_KG_M3 = 7850;

export type SheetPieceConversion = {
  massKg: number;
  massPerSheetKg: number;
  pieces: number;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  densityKgM3: number;
  label: string;
  basis: string;
};

/** Convert sheet demand from kg to whole stock sheets using the known sheet gauge. */
export function calculateSheetPieceConversion(item: PlanningDemand, stock?: PlanningStockItem): SheetPieceConversion | undefined {
  if (!sameUnit(item.unit, 'кг')) return undefined;
  const text = normalize(`${item.name} ${stock?.name ?? ''} ${stock?.article ?? ''}`);
  if (!text.includes('лист')) return undefined;
  const triples = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*[×*xх]\s*(\d{3,4})\s*[×*xх]\s*(\d{3,4})/g)];
  const dimensions = triples
    .map((match) => [Number(match[1].replace(',', '.')), Number(match[2]), Number(match[3])] as const)
    .find(([thicknessMm, widthMm, lengthMm]) => thicknessMm > 0 && thicknessMm <= 20 && widthMm >= 500 && lengthMm >= 500);
  if (!dimensions) return undefined;
  const [thicknessMm, widthMm, lengthMm] = dimensions;
  const densityKgM3 = /амг|алюм/.test(text) ? ALUMINIUM_DENSITY_KG_M3 : /оцинк|\bоц\b|сталь/.test(text) ? STEEL_DENSITY_KG_M3 : 0;
  if (!(densityKgM3 > 0)) return undefined;
  const massPerSheetKg = (thicknessMm / 1000) * (widthMm / 1000) * (lengthMm / 1000) * densityKgM3;
  if (!(massPerSheetKg > 0)) return undefined;
  const massKg = Math.max(0, Number(item.qty) || 0);
  return {
    massKg,
    massPerSheetKg,
    pieces: Math.ceil(massKg / massPerSheetKg),
    thicknessMm,
    widthMm,
    lengthMm,
    densityKgM3,
    label: `${thicknessMm}×${widthMm}×${lengthMm} мм`,
    basis: `Лист ${thicknessMm}×${widthMm}×${lengthMm} мм; масса 1 листа ${massPerSheetKg.toFixed(3)} кг; потребность округляется вверх до целого листа`,
  };
}

function sheetStockMatch<T extends PlanningStockItem>(item: PlanningDemand, row: T, demandCode: string): StockMatch<T> | undefined {
  const conversion = calculateSheetPieceConversion(item, row);
  if (!conversion) return undefined;
  const stockIsKg = sameUnit(row.unit, 'кг');
  const stockIsPieces = sameUnit(row.unit, 'шт');
  if (!stockIsKg && !stockIsPieces) return undefined;
  return {
    stock: row,
    demandCode,
    factor: 1 / conversion.massPerSheetKg,
    priceFactor: conversion.massPerSheetKg,
    reason: `${conversion.basis}; исходная масса ${conversion.massKg.toFixed(3)} кг`,
    convertedUnit: 'шт',
    roundDemandUp: true,
    stockBalanceFactor: stockIsKg ? 1 / conversion.massPerSheetKg : 1,
    pieceMassKg: conversion.massPerSheetKg,
    pieceLabel: conversion.label,
  };
}

const PROFILE_KG_PER_M: Record<string, { kgPerM: number; basis: string }> = {
  "Ц0000074662": {
    kgPerM: 1.381,
    basis: "АП 4178: 1,381 кг/м по формуле цены в ресурсной спецификации",
  },
  "Ц0000077015": {
    kgPerM: 2.388,
    basis: "АП 4976: расчётно 2,388 кг/м по действующей цене 1 313,40 руб./м и ставке 550 руб./кг ресурсной спецификации",
  },
  "Ц0000077016": {
    kgPerM: 2.388,
    basis: "АП 4977: 2,388 кг/м по формуле цены в ресурсной спецификации",
  },
};

export type StockLengthMetrics = {
  massKg?: number;
  pieces3m?: number;
  basis?: string;
};

export function calculateStockLengthMetrics(item: PlanningDemand): StockLengthMetrics {
  if (item.stockLengthM !== undefined) {
    return {
      massKg: item.massKg,
      pieces3m: Math.ceil(item.stockLengthM / STOCK_LENGTH_M),
      basis: item.metricBasis,
    };
  }

  const demandCode = extractConfirmedCode(item.name);
  const profile = PROFILE_KG_PER_M[demandCode];
  if (profile && sameUnit(item.unit, "м")) {
    return {
      massKg: item.qty * profile.kgPerM,
      pieces3m: Math.ceil(item.qty / STOCK_LENGTH_M),
      basis: profile.basis,
    };
  }

  const normalizedName = normalize(item.name);
  const busDimensions = normalizedName.match(/шина(?:\s+ал\.)?\s+ад0\s+(\d+(?:[.,]\d+)?)\s*[×*xх]\s*(\d+(?:[.,]\d+)?)\s*[×*xх]\s*3000/);
  if (busDimensions && sameUnit(item.unit, "кг")) {
    const thicknessMm = Number(busDimensions[1].replace(",", "."));
    const heightMm = Number(busDimensions[2].replace(",", "."));
    const massPer3m = (thicknessMm / 1000) * (heightMm / 1000) * STOCK_LENGTH_M * ALUMINIUM_DENSITY_KG_M3;
    return {
      massKg: item.qty,
      pieces3m: massPer3m > 0 ? Math.ceil(item.qty / massPer3m) : undefined,
      basis: `Шина ${thicknessMm}×${heightMm}×3000 мм; плотность алюминия 2710 кг/м³`,
    };
  }

  return {};
}

export function matchStock<T extends PlanningStockItem>(item: PlanningDemand, stock: T[]): StockMatch<T> {
  const demand = normalize(item.name);
  const demandCode = extractConfirmedCode(item.name);
  const find = (predicate: (row: T, normalized: string) => boolean) => stock.filter((row) => predicate(row, normalize(`${row.name} ${row.article}`)));
  let matches: T[] = [];
  let factor = 1;
  let priceFactor = 1;
  let reason = "Точное правило";

  if (String(item.name ?? "").toLowerCase().replace(/ё/g, "е").includes("ухо pe")) {
    const peEarMaterialCode = "Ц0000069668";
    const codeMatches = stock.filter((row) => normalizeCode(row.code) === normalizeCode(peEarMaterialCode));
    if (codeMatches.length === 1) {
      const sheet = sheetStockMatch(item, codeMatches[0], peEarMaterialCode);
      if (sheet) return { ...sheet, reason: `${sheet.reason}; Ухо PE — собственное производство, снабжение идёт по исходному листу ${peEarMaterialCode}` };
      if (sameUnit(item.unit, codeMatches[0].unit)) {
        return {
          stock: codeMatches[0],
          demandCode: peEarMaterialCode,
          factor,
          priceFactor,
          reason: "Ухо PE — собственное производство; готовый код 1С не требуется. Для снабжения используется материал лист АМг3 2,0, код Ц0000069668",
        };
      }
    }
    if (codeMatches.length > 1) {
      const unitMatches = codeMatches.filter((row) => sameUnit(item.unit, row.unit));
      if (unitMatches.length === 1) {
        return {
          stock: unitMatches[0],
          demandCode: peEarMaterialCode,
          factor,
          priceFactor,
          reason: "Ухо PE — собственное производство; готовый код 1С не требуется. Для снабжения используется материал лист АМг3 2,0, код Ц0000069668",
        };
      }
    }
    return {
      demandCode: peEarMaterialCode,
      factor,
      priceFactor,
      reason: "Ухо PE — собственное производство; готовый код 1С не требуется. Материал подтверждён: лист АМг3 2,0, код Ц0000069668; требуется только проверить остаток материала",
    };
  }

  if (isPosAlias(item.name)) {
    const aliases = stock.filter((row) => isPosAlias(`${row.name} ${row.article}`) && sameUnit(item.unit, row.unit));
    if (aliases.length) {
      const representative = aliases.find((row) => demandCode && normalizeCode(row.code) === normalizeCode(demandCode)) ?? aliases[0];
      const combined = { ...representative, balance: aliases.reduce((sum, row) => sum + Math.max(0, row.balance), 0) } as T;
      return {
        stock: combined,
        demandCode: demandCode || representative.code,
        factor,
        priceFactor,
        reason: `Объединённый остаток по подтверждённым вариантам ПОС / ПОС 61 / ТР-63-25 (${aliases.length} строк); в заказе сохранена номенклатура 1С`,
      };
    }
    return { demandCode, factor, priceFactor, reason: "В остатках не найдены варианты ПОС / ПОС 61 / ТР-63-25" };
  }

  if (demandCode === "Ц0000077668") {
    factor = 1;
    priceFactor = 1;
    reason = "GM-3828 25 мм: потребность считается в метрах по длине гибкой части; пересчёт в рулоны не применяется без отдельного подтверждённого метража рулона";
  } else if (demand.includes("скотч электр")) {
    factor = 1 / 66;
    priceFactor = 66;
    reason = "Совпадение по подтверждённому коду 1С; пересчёт метров в рулоны по 66 м";
  } else if (demand.includes("пленка стрейч") || demand.includes("стрейч-пленка")) {
    factor = 1 / 2.2;
    priceFactor = 2.2;
    reason = "Совпадение по подтверждённому коду 1С; пересчёт килограммов в рулоны по 2,2 кг";
  }

  if (demandCode) {
    const codeMatches = stock.filter((row) => normalizeCode(row.code) === normalizeCode(demandCode));
    if (codeMatches.length === 1) {
      const sheet = sheetStockMatch(item, codeMatches[0], demandCode);
      if (sheet) return sheet;
      if (sameUnit(item.unit, codeMatches[0].unit) || factor !== 1) {
        return { stock: codeMatches[0], demandCode, factor, priceFactor, reason: reason === "Точное правило" ? "Совпадение по подтверждённому коду 1С" : reason };
      }
      return {
        demandCode,
        factor,
        priceFactor,
        reason: `Код ${demandCode} найден, но единицы «${item.unit}» и «${codeMatches[0].unit}» требуют подтверждённого коэффициента пересчёта`,
      };
    }
    if (codeMatches.length > 1) {
      const unitMatches = codeMatches.filter((row) => sameUnit(item.unit, row.unit) || factor !== 1);
      if (unitMatches.length === 1) return { stock: unitMatches[0], demandCode, factor, priceFactor, reason: "Совпадение по подтверждённому коду 1С и единице измерения" };
      return { demandCode, factor, priceFactor, reason: `Код ${demandCode} встречается в остатках несколько раз — требуется выбрать строку` };
    }
    return { demandCode, factor, priceFactor, reason: `Код ${demandCode} подтверждён; позиция отсутствует в загруженном файле остатков` };
  }

  const busMatch = demand.match(/шина ал\. ад0\s+(\d+)\*(\d+)/);
  if (busMatch) matches = find((_row, value) => value.includes(`шина ад0 ${busMatch[1]}*${busMatch[2]}*3000`) && _row.unit === "кг");
  else if (demand.includes("пленка пет-э 250")) matches = find((_row, value) => value.includes("пленка пет-э, толщ. 250 мкм") && value.includes("ширина 1000"));
  else if (demand.includes("скотч электроизоляционный")) { matches = find((_row, value) => value.includes("скотч электротехнический термостойкий") && value.includes("66м")); factor = 1 / 66; priceFactor = 66; reason = "Пересчёт метров в рулоны по 66 м"; }
  else if (demand.includes("профиль ап 4178")) matches = find((row) => normalize(row.article) === "ап 4178" && row.balance > 0);
  else if (demand.includes("профиль ап 4977")) matches = find((row) => normalize(row.article) === "ап 4977");
  else if (demand.includes("болт с фланцем м6*12")) matches = find((_row, value) => value.includes("болт м6*12") && value.includes("din 6921"));
  else if (demand.includes("болт") && demand.includes("м6*16") && demand.includes("din 6921")) matches = findM6x16Din6921(item.name, stock) as T[];
  else if (demand === "гайка м6") { matches = []; reason = "В расчёте не указан тип гайки; на складе есть DIN 6923, DIN 934, DIN 985 и другие"; }
  else if (demand.includes("заклепка 4,8*10")) matches = find((_row, value) => value.includes("заклепка 4,8*10 ст/ст"));
  else if (demand.includes("герметик серый")) { matches = []; reason = "В файле несколько герметиков; требуется код 1С серого герметика"; }
  else if (demand.includes("пленка стрейч") || demand.includes("стрейч-пленка")) { matches = find((_row, value) => value.includes("стрейч-пленка") || value.includes("стрейч пленка")); factor = 1 / 2.2; priceFactor = 2.2; reason = "Пересчёт килограммов в рулоны по 2,2 кг"; }
  else reason = "Нет подтверждённого кода 1С или однозначного наименования";

  const compatible = matches.filter((row) => sameUnit(item.unit, row.unit) || factor !== 1);
  if (compatible.length === 1) return { stock: compatible[0], demandCode, factor, priceFactor, reason };
  if (compatible.length > 1) return { demandCode, factor, priceFactor, reason: "Найдено несколько складских позиций — требуется выбрать код 1С" };
  return { demandCode, factor, priceFactor, reason };
}
