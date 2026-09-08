"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { calculateSheetPieceConversion, calculateStockLengthMetrics, matchStock } from "../lib/materialPlanning";
import { CONFIRMED_M6X16_DIN6921_CODE } from "../lib/stockRules";
import {
  isDiscontinuedSintokarton,
  procurementMaterialGroup,
  procurementModeLabel,
  procurementOrderCost,
  procurementOrderQuantity,
  sortProcurementRows,
  summarizeComposition,
  type ProcurementStockMode,
} from "../lib/procurementExportRules";

export type MaterialDemand = {
  name: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
  group: string;
  stockLengthM?: number;
  massKg?: number;
  metricBasis?: string;
};

export type StockItem = {
  name: string;
  unit: string;
  code: string;
  article: string;
  group: string;
  balance: number;
};

type Mode = "requirements" | "procurement";
type SupplyPipelineItem = { key: string; code: string; name: string; unit: string; inTransit: number; paid: number; supplierProduction: number };
export type ProcurementComponentRow = { orderLabel: string; component: string; article: string; nominalA: number; poles: string; quantity: number; kind: "Секция" | "КОМ" | "Стык"; calculated: boolean };
type ReplacementRow = { id: string; sourceKey: string; replacementCode: string; replacementName: string; quantity: number; unitPrice: number; note: string };

type Props = {
  mode: Mode;
  projectName: string;
  items: MaterialDemand[];
  stock: StockItem[];
  setStock: (items: StockItem[]) => void;
  stockSource: string;
  setStockSource: (source: string) => void;
  onOpenRequirements: () => void;
  onOpenProcurement: () => void;
  onPersistStock?: (file: File, items: StockItem[], source: string) => Promise<void>;
  activeProjectKeys?: string[];
  selectedOrderLabels?: string[];
  calculationScenarioLabel?: string;
  comparisonComponents?: ProcurementComponentRow[];
};

export const initialStock: StockItem[] = [
  { name: "Порошковый материал порошок припойный ПОС 61", unit: "кг", code: "Ц0000059919", article: "", group: "материалы ДИМЕТ", balance: 345 },
  { name: "Пленка ПЭТ-Э, толщ. 250 мкм, ширина 1000 мм, Гост 24238-80", unit: "кг", code: "Ц0000078237", article: "", group: "ПЭТ пленки", balance: 1000.8 },
  { name: "Скотч электротехнический термостойкий 25мм*66м", unit: "шт", code: "УТ000000404", article: "Р.31/FY100", group: "ПЭТ пленки", balance: 1781 },
  { name: "Профиль алюминиевый АП 4178 E-V.68.140 крышка АД31 3000мм RAL7035 Шагрень", unit: "пог.м", code: "Ц0000074662", article: "АП 4178", group: "Листовые материалы и шины", balance: 5462.41 },
  { name: "Профиль алюминиевый АП 4977 E-V.180 полукорпус (боковина) секции 200 мм", unit: "пог.м", code: "Ц0000077016", article: "АП 4977", group: "Листовые материалы и шины", balance: 1977.31 },
  { name: "Болт М6*12, DIN 6921, с фланцем, цинк, кл. 8.8", unit: "шт", code: "Ц0000056270", article: "", group: "МЕТИЗЫ", balance: 8992 },
  { name: "Болт М6*16, DIN 6921, с фланцем, цинк, кл. 8.8", unit: "шт", code: CONFIRMED_M6X16_DIN6921_CODE, article: "", group: "МЕТИЗЫ", balance: 24000 },
  { name: "Гайка М6, DIN 6923, ГОСТ 50592-93, с фланцем, цинк", unit: "шт", code: "УТ000002046", article: "", group: "МЕТИЗЫ", balance: 7100 },
  { name: "Заклёпка 4,8*10 ст/ст", unit: "шт", code: "Ц0000039669", article: "", group: "МЕТИЗЫ", balance: 25500 },
  { name: "Герметик", unit: "шт", code: "2130", article: "", group: "Материалы на производство", balance: 226 },
  { name: "Стрейч-плёнка ручная, рулон 2,2 кг", unit: "шт", code: "00000004273", article: "", group: "Упаковочные материалы", balance: 0 },
  { name: "Шина АД0 6*30*3000 (R=3.0)", unit: "кг", code: "УТ000002292", article: "", group: "Листовые материалы и шины", balance: 408 },
  { name: "Шина АД0 6*50*3000 (R3)", unit: "кг", code: "Ц0000077017", article: "", group: "Листовые материалы и шины", balance: 1695 },
  { name: "Шина АД0 6*65*3000 (R=3)", unit: "кг", code: "Ц0000079245", article: "", group: "Листовые материалы и шины", balance: 0 },
  { name: "Шина АД0 6*100*3000 (R=3)", unit: "кг", code: "Ц0000072703", article: "", group: "Листовые материалы и шины", balance: 318 },
  { name: "Шина АД0 6*130*3000 (R=3)", unit: "кг", code: "Ц0000078399", article: "", group: "Листовые материалы и шины", balance: 12585 },
  { name: "Шина АД0 6*160*3000 (R=3)", unit: "кг", code: "Ц0000072624", article: "", group: "Листовые материалы и шины", balance: 12466 },
  { name: "Шина АД0 6*200*3000 (R=3)", unit: "кг", code: "Ц0000072623", article: "", group: "Листовые материалы и шины", balance: 11296 },
];

const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/ё/g, "е").replace(/[×х]/g, "*").replace(/\s+/g, " ").trim();
const numeric = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/\u00a0/g, "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

async function parseStockFile(file: File): Promise<StockItem[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  let selected: unknown[][] | null = null;
  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    if (matrix.some((row) => row.some((cell) => normalize(cell) === "конечный остаток"))) {
      selected = matrix;
      break;
    }
  }
  if (!selected) throw new Error("Не найден лист с колонкой «Конечный остаток».");
  const headerIndex = selected.findIndex((row) => row.some((cell) => normalize(cell) === "номенклатура") && row.some((cell) => normalize(cell) === "конечный остаток"));
  if (headerIndex < 0) throw new Error("Не найдена строка заголовков складского отчёта.");
  const headers = selected[headerIndex].map(normalize);
  const column = (name: string) => headers.findIndex((header) => header === normalize(name));
  const nameIndex = column("Номенклатура");
  const unitIndex = column("Базовая единица измерения");
  const codeIndex = column("Код");
  const articleIndex = column("Артикул");
  const groupIndex = headers.findIndex((header) => header.includes("группа"));
  const balanceIndex = column("Конечный остаток");
  const rows = selected.slice(headerIndex + 1).map((row) => ({
    name: String(row[nameIndex] ?? "").trim(),
    unit: String(row[unitIndex] ?? "").trim(),
    code: String(row[codeIndex] ?? "").trim(),
    article: String(row[articleIndex] ?? "").trim(),
    group: String(row[groupIndex] ?? "").trim(),
    balance: numeric(row[balanceIndex]),
  })).filter((row) => row.name && row.code && row.name !== "Основной склад-2");
  if (!rows.length) throw new Error("В складском отчёте не найдено строк номенклатуры.");
  return rows;
}

function createCompositionSheet(projectName: string, orderLabels: string[], components: ProcurementComponentRow[], scenarioLabel: string, stockMode: ProcurementStockMode) {
  const scope = orderLabels.length ? orderLabels : [projectName];
  const summary = summarizeComposition(components);
  const matrix: (string | number)[][] = [
    ["КОНТРОЛЬНЫЙ СОСТАВ ПРОЕКТА"],
    ["Режим заказа материалов", procurementModeLabel(stockMode)],
    ["Расчётный сценарий", scenarioLabel],
    ["В выгрузку включены проекты и заказы"],
    ...scope.map((label, index) => [index + 1, label]),
    [],
    ["Проект / заказ", "Категория", "Тип / наименование", "Артикул", "Номинал, А", "Проводность", "Всего, шт.", "Рассчитано, шт.", "Не рассчитано, шт."],
    ...summary.map((row) => [row.orderLabel, row.kind, row.component, row.article, row.nominalA || "", row.poles, row.quantity, row.calculatedQuantity, row.uncalculatedQuantity]),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  const headerRow = 6 + scope.length;
  styleSheet(worksheet, [1, 4, headerRow], [44, 16, 52, 24, 16, 16, 16, 18, 20], [4, 6, 7, 8]);
  worksheet["!merges"] = [XLSX.utils.decode_range("A1:I1"), XLSX.utils.decode_range("A4:I4")];
  worksheet["!autofilter"] = summary.length ? { ref: `A${headerRow}:I${headerRow + summary.length}` } : undefined;
  return worksheet;
}

function downloadXlsx(projectName: string, rows: PlannedRow[], orderLabels: string[] = [], components: ProcurementComponentRow[] = [], scenarioLabel = "Исходный номинал", stockMode: ProcurementStockMode = "with-stock") {
  const calculationScope = orderLabels.length ? orderLabels.join("\n") : projectName;
  const sortedRows = sortProcurementRows(rows);
  const header = ["Группа материалов", "Проекты / заказы расчёта", "Код 1С", "Номенклатура", "Ед. изм.", "Общая потребность", "Масса потребности, кг", "Шины / профиль 3000 мм, шт.", "Листы, шт.", "Остаток", "Резерв", "К заказу", "Стоимость за единицу, руб.", "Расчётная сумма, руб.", "Статус"];
  const body = sortedRows.map((row) => {
    const orderQty = procurementOrderQuantity(row, stockMode);
    return [
      procurementMaterialGroup(row),
      calculationScope,
      row.code,
      row.stock?.name ?? row.name.replace(/^.*?\s*[·•-]\s*/, ""),
      row.stockUnit,
      row.demand,
      row.massKg === undefined ? "" : Math.round(row.massKg * 1000) / 1000,
      row.pieces3m ?? "",
      row.pieceLabel ? Math.ceil(row.demand) : "",
      row.stock ? row.balance : "",
      row.stock ? row.reserved ?? 0 : "",
      orderQty,
      row.unitPrice,
      Math.round(procurementOrderCost(row, stockMode) * 100) / 100,
      stockMode === "without-stock" ? "Полная потребность без вычета склада" : row.stock ? "Потребность за вычетом доступного обеспечения" : "Проверить остаток / единицу измерения",
    ];
  });
  // Keep the original source contract used by the cumulative CHANGE 05P tests.
  // `rows` is already the selected procurement scope; row order does not affect the sum.
  const totalAmount = rows.reduce((sum, row) => sum + procurementOrderCost(row, stockMode), 0);
  const totalRow = ["", "", "", "", "", "", "", "", "", "", "", "ИТОГО", "", Math.round(totalAmount * 100) / 100, "Общая сумма заказа материалов"];
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body, totalRow]);
  worksheet["!cols"] = [22,42,16,52,12,16,20,22,12,14,14,14,24,20,38].map((wch) => ({ wch }));
  worksheet["!rows"] = [{ hpt: 34 }, ...body.map(() => ({ hpt: Math.max(34, orderLabels.length * 18) })), { hpt: 28 }];
  worksheet["!autofilter"] = { ref: `A1:O${body.length + 1}` };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  for (let row = 2; row <= body.length + 2; row++) {
    for (const column of ["G", "M", "N"]) if (worksheet[`${column}${row}`]) worksheet[`${column}${row}`].z = "0.00";
    for (let columnIndex = 0; columnIndex < header.length; columnIndex++) {
      const address = XLSX.utils.encode_cell({ r: row - 1, c: columnIndex });
      if (worksheet[address]) worksheet[address].s = { alignment: { wrapText: true, vertical: "top" } };
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Заказ материалов");
  XLSX.utils.book_append_sheet(workbook, createCompositionSheet(projectName, orderLabels, components, scenarioLabel, stockMode), "Состав выгрузки");
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true });
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Заказ_материалов_${projectName.replace(/[^a-zа-я0-9]+/gi, "_")}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadRequirementsXlsx(projectName: string, rows: PlannedRow[], orderLabels: string[] = []) {
  const calculationScope = orderLabels.length ? orderLabels.join("\n") : projectName;
  const header = ["Проекты / заказы расчёта", "Материал расчёта", "Код позиции", "Позиция склада", "Ед. изм.", "Требуется", "На складе", "В резерве", "Свободно на складе", "В дороге", "Оплачено", "В производстве у поставщика", "Доступно всего", "Дефицит", "Потребуется заказать", "Статус"];
  const body = rows.map((row) => [
    calculationScope,
    `${row.group}\n${row.name}`,
    row.code,
    row.stock?.name ?? (row.code ? "Код подтверждён; позиция отсутствует в остатках" : "Код не подтверждён"),
    row.stockUnit,
    row.demand,
    row.stock ? row.balance : "",
    row.stock ? row.reserved ?? 0 : "",
    row.stock ? row.freeWarehouse ?? 0 : "",
    row.inTransit ?? 0,
    row.paid ?? 0,
    row.supplierProduction ?? 0,
    row.stock ? row.availableTotal ?? 0 : "",
    row.stock ? row.shortage : "",
    row.stock ? row.requiredOrder ?? 0 : "",
    !row.stock ? row.code ? `Нет в остатках. ${row.reason}` : `Уточнить код. ${row.reason}` : row.shortage > 0 ? `Дефицит. ${row.reason}` : `Покрыто. ${row.reason}`,
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  worksheet["!cols"] = [42, 42, 18, 48, 12, 14, 14, 14, 18, 14, 14, 24, 16, 14, 20, 48].map((wch) => ({ wch }));
  worksheet["!rows"] = [{ hpt: 34 }, ...body.map(() => ({ hpt: Math.max(46, orderLabels.length * 18) }))];
  worksheet["!autofilter"] = { ref: `A1:P${body.length + 1}` };
  worksheet["!freeze"] = { xSplit: 4, ySplit: 1 };
  for (let rowIndex = 1; rowIndex <= body.length + 1; rowIndex++) {
    for (let columnIndex = 0; columnIndex < header.length; columnIndex++) {
      const address = XLSX.utils.encode_cell({ r: rowIndex - 1, c: columnIndex });
      if (!worksheet[address]) continue;
      worksheet[address].s = {
        alignment: { wrapText: true, vertical: "top", horizontal: columnIndex >= 5 && columnIndex <= 14 ? "right" : "left" },
        font: rowIndex === 1 ? { bold: true, color: { rgb: "FFFFFF" } } : undefined,
        fill: rowIndex === 1 ? { patternType: "solid", fgColor: { rgb: "355C7D" } } : undefined,
      };
      if (rowIndex > 1 && columnIndex >= 5 && columnIndex <= 14 && typeof worksheet[address].v === "number") worksheet[address].z = "#,##0.000";
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Потребность и склад");
  const scopeSheet = XLSX.utils.aoa_to_sheet([["В выгрузку включены проекты и заказы"], ...(orderLabels.length ? orderLabels : [projectName]).map((label, index) => [index + 1, label])]);
  scopeSheet["!cols"] = [{ wch: 8 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(workbook, scopeSheet, "Состав выгрузки");
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true });
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Потребность_и_склад_${projectName.replace(/[^a-zа-я0-9]+/gi, "_")}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function procurementPriority(row: PlannedRow, stockMode: ProcurementStockMode = "with-stock") {
  if (stockMode === "without-stock") return "Полная потребность";
  if (!row.stock) return "Требует проверки";
  if (row.shortage <= 0) return "Не требуется";
  if ((row.availableTotal ?? 0) <= 0) return "1 · Критический";
  if (row.demand > 0 && row.shortage / row.demand >= 0.5) return "2 · Высокий";
  return "3 · Средний";
}

function styleSheet(worksheet: XLSX.WorkSheet, headerRows: number[], widths: number[], numericColumns: number[] = []) {
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  worksheet["!freeze"] = { xSplit: 0, ySplit: Math.max(...headerRows, 1) };
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
  for (let row = range.s.r; row <= range.e.r; row++) {
    worksheet["!rows"] ||= [];
    worksheet["!rows"]![row] = { hpt: headerRows.includes(row + 1) ? 30 : 34 };
    for (let column = range.s.c; column <= range.e.c; column++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      const header = headerRows.includes(row + 1);
      cell.s = {
        alignment: { wrapText: true, vertical: "top", horizontal: numericColumns.includes(column) ? "right" : "left" },
        font: header ? { bold: true, color: { rgb: "FFFFFF" } } : undefined,
        fill: header ? { patternType: "solid", fgColor: { rgb: "355C7D" } } : undefined,
      };
      if (!header && numericColumns.includes(column) && typeof cell.v === "number") cell.z = "#,##0.00";
    }
  }
}

function downloadProcurementComparisonXlsx(projectName: string, rows: PlannedRow[], orderLabels: string[], components: ProcurementComponentRow[], replacements: ReplacementRow[], scenarioLabel: string, stockMode: ProcurementStockMode) {
  const workbook = XLSX.utils.book_new();
  const scope = orderLabels.length ? orderLabels : [projectName];
  const sortedRows = sortProcurementRows(rows);
  const purchaseRows = sortProcurementRows(rows.filter((row) => procurementOrderQuantity(row, stockMode) > 0));
  const purchaseHeader = ["Группа материалов", "Код позиции", "Номенклатура для закупки", "Ед.", "Количество к закупке", "Цена за ед., руб.", "Стоимость, руб.", "Приоритет", "Статус"];
  const purchaseBody = purchaseRows.map((row) => {
    return [procurementMaterialGroup(row), row.code, row.stock?.name ?? row.name, row.stockUnit, procurementOrderQuantity(row, stockMode), row.unitPrice, procurementOrderCost(row, stockMode), procurementPriority(row, stockMode), stockMode === "without-stock" ? "Без вычета склада" : row.stock ? "Рассчитано" : "Проверить код и остаток"];
  });
  const warehouseHeader = ["Код позиции", "Номенклатура", "Ед.", "На складе", "В резерве", "Свободно на складе", "В дороге", "Оплачено", "В производстве у поставщика", "Доступно всего"];
  const warehouseBody = sortedRows.map((row) => [row.code, row.stock?.name ?? row.name, row.stockUnit, row.stock ? row.balance : "", row.stock ? row.reserved ?? 0 : "", row.stock ? row.freeWarehouse ?? 0 : "", row.inTransit ?? 0, row.paid ?? 0, row.supplierProduction ?? 0, row.stock ? row.availableTotal ?? 0 : ""]);
  const finalHeader = ["Код позиции", "Номенклатура", "Ед.", "Общая потребность", "Доступно всего", "Итог к закупке", "Цена за ед., руб.", "Бюджет закупки, руб.", "Приоритет", "Основание"];
  const finalBody = sortedRows.map((row) => {
    return [row.code, row.stock?.name ?? row.name, row.stockUnit, row.demand, row.stock ? row.availableTotal ?? 0 : "", procurementOrderQuantity(row, stockMode), row.unitPrice, procurementOrderCost(row, stockMode), procurementPriority(row, stockMode), `${procurementModeLabel(stockMode)}. ${row.reason}`];
  });
  const comparison = XLSX.utils.aoa_to_sheet([
    ["СРАВНИТЕЛЬНАЯ ТАБЛИЦА ДЛЯ ЗАКУПОК"],
    ["Сценарий расчёта", `${scenarioLabel}; ${procurementModeLabel(stockMode)}`],
    ["Проекты / заказы", scope.join("\n")],
    [],
    ["РАЗДЕЛ 1. НОМЕНКЛАТУРА ДЛЯ ЗАКУПКИ"],
    purchaseHeader,
    ...purchaseBody,
    ["", "ИТОГО", "", "", "", "", purchaseRows.reduce((sum, row) => sum + procurementOrderCost(row, stockMode), 0)],
    [],
    ["РАЗДЕЛ 2. НАЛИЧИЕ НА СКЛАДЕ И В ПОСТАВКАХ"],
    warehouseHeader,
    ...warehouseBody,
    [],
    ["РАЗДЕЛ 3. ИТОГОВЫЙ ОБЪЁМ И БЮДЖЕТ ЗАКУПКИ"],
    finalHeader,
    ...finalBody,
    ["", "ИТОГО", "", "", "", "", "", sortedRows.reduce((sum, row) => sum + procurementOrderCost(row, stockMode), 0)],
  ]);
  comparison["!merges"] = [XLSX.utils.decode_range("A1:J1"), XLSX.utils.decode_range("A5:J5"), XLSX.utils.decode_range(`A${9 + purchaseBody.length}:J${9 + purchaseBody.length}`), XLSX.utils.decode_range(`A${12 + purchaseBody.length + warehouseBody.length}:J${12 + purchaseBody.length + warehouseBody.length}`)];
  const headerRows = [1, 5, 6, 7 + purchaseBody.length, 9 + purchaseBody.length, 10 + purchaseBody.length, 12 + purchaseBody.length + warehouseBody.length, 13 + purchaseBody.length + warehouseBody.length, 14 + purchaseBody.length + warehouseBody.length + finalBody.length];
  styleSheet(comparison, headerRows, [18, 48, 12, 18, 18, 20, 22, 22, 22, 48], [3, 4, 5, 6, 7, 8]);
  comparison["!freeze"] = { xSplit: 2, ySplit: 6 };
  XLSX.utils.book_append_sheet(workbook, comparison, "Сводная закупка");

  const componentSheet = XLSX.utils.aoa_to_sheet([["Проект / заказ", "Категория", "Комплектующий элемент", "Артикул", "Номинал, А", "Проводность", "Количество", "Рассчитано"], ...components.map((row) => [row.orderLabel, row.kind, row.component, row.article, row.nominalA, row.poles, row.quantity, row.calculated ? "Да" : "Нет"])]);
  styleSheet(componentSheet, [1], [44, 16, 52, 22, 16, 16, 14, 14], [4, 6]);
  componentSheet["!autofilter"] = { ref: `A1:H${Math.max(components.length + 1, 1)}` };
  XLSX.utils.book_append_sheet(workbook, componentSheet, "Номиналы комплектующих");

  const replacementSheet = XLSX.utils.aoa_to_sheet([["Исходная позиция", "Код замены", "Позиция для замены", "Количество", "Цена за ед., руб.", "Стоимость, руб.", "Обоснование"], ...replacements.map((replacement) => {
    const source = rows.find((row) => row.key === replacement.sourceKey);
    return [source ? `${source.code} · ${source.stock?.name ?? source.name}` : "", replacement.replacementCode, replacement.replacementName, replacement.quantity, replacement.unitPrice, replacement.quantity * replacement.unitPrice, replacement.note];
  })]);
  styleSheet(replacementSheet, [1], [52, 18, 48, 16, 18, 20, 42], [3, 4, 5]);
  XLSX.utils.book_append_sheet(workbook, replacementSheet, "Позиции для замены");

  XLSX.utils.book_append_sheet(workbook, createCompositionSheet(projectName, orderLabels, components, scenarioLabel, stockMode), "Состав выгрузки");
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true });
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Сравнение_закупки_${projectName.replace(/[^a-zа-я0-9]+/gi, "_")}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type PlannedRow = {
  key: string;
  name: string;
  group: string;
  demand: number;
  stockUnit: string;
  balance: number;
  available: number;
  shortage: number;
  shortageCost: number;
  unitPrice: number;
  code: string;
  stock?: StockItem;
  reason: string;
  massKg?: number;
  pieces3m?: number;
  pieceMassKg?: number;
  pieceLabel?: string;
  rawDemand?: number;
  metricBasis?: string;
  stockLengthM?: number;
  inTransit?: number;
  paid?: number;
  supplierProduction?: number;
  reserved?: number;
  freeWarehouse?: number;
  availableTotal?: number;
  requiredOrder?: number;
};

export default function MaterialsPlanningPanel(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [pipeline, setPipeline] = useState<SupplyPipelineItem[]>([]);
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [reservations, setReservations] = useState<Array<{projectKey:string;code:string;qty:number}>>([]);
  const [replacements, setReplacements] = useState<ReplacementRow[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(true);
  const [procurementStockMode, setProcurementStockMode] = useState<ProcurementStockMode>("with-stock");

  useEffect(() => {
    let cancelled = false;
    fetch('/api/workspace?category=supply_pipeline&project=GLOBAL').then(r => r.ok ? r.json() : null).then(data => {
      if (cancelled) return;
      const latest = data?.records?.[0]?.payload?.items;
      if (Array.isArray(latest)) setPipeline(latest);
    }).catch(() => {});
    fetch('/api/workspace?category=material_reservation').then(r=>r.ok?r.json():null).then(data=>{if(cancelled)return;const latest=data?.records?.[0]?.payload?.rows;if(Array.isArray(latest))setReservations(latest)}).catch(()=>{});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("klm-procurement-replacements-v1") || "[]");
      if (Array.isArray(saved)) setReplacements(saved);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("klm-procurement-replacements-v1", JSON.stringify(replacements));
  }, [replacements]);

  async function savePipeline() {
    setPipelineMessage('');
    const response = await fetch('/api/workspace', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ category:'supply_pipeline', projectKey:'GLOBAL', entityKey:new Date().toISOString(), payload:{ items:pipeline, savedAt:new Date().toISOString() } }) });
    setPipelineMessage(response.ok ? 'Состояния поставок сохранены.' : 'Не удалось сохранить состояния поставок.');
  }
  function updatePipeline(row: PlannedRow, patch: Partial<SupplyPipelineItem>) {
    const key = row.code || row.key;
    setPipeline(current => {
      const index = current.findIndex(item => item.key === key);
      const base: SupplyPipelineItem = index >= 0 ? current[index] : { key, code:row.code, name:row.stock?.name ?? row.name, unit:row.stockUnit, inTransit:0, paid:0, supplierProduction:0 };
      const next = { ...base, ...patch };
      if (index >= 0) return current.map((item,i)=>i===index?next:item);
      return [...current,next];
    });
  }
  const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
  const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });

  const planned = useMemo<PlannedRow[]>(() => {
    const rows = new Map<string, PlannedRow>();
    props.items.filter((item) => !isDiscontinuedSintokarton(`${item.name} ${item.group}`)).forEach((item) => {
      const match = matchStock(item, props.stock);
      const code = match.stock?.code || match.demandCode;
      const key = code || `unmatched:${item.name}`;
      const sheet = calculateSheetPieceConversion(item, match.stock);
      const conversionFactor = sheet ? 1 / sheet.massPerSheetKg : match.factor;
      const rawDemand = (rows.get(key)?.rawDemand ?? 0) + item.qty * conversionFactor;
      const totalDemand = sheet ? Math.ceil(rawDemand) : rawDemand;
      const rawBalance = match.stock?.balance ?? 0;
      const balance = match.stock
        ? sheet
          ? Math.floor(Math.max(rawBalance, 0) * (match.stockBalanceFactor ?? (match.stock.unit.toLowerCase().includes('кг') ? 1 / sheet.massPerSheetKg : 1)))
          : rawBalance
        : 0;
      const old = rows.get(key);
      const pipelineRow = pipeline.find((entry) => entry.key === (code || key));
      const inTransit = Math.max(Number(pipelineRow?.inTransit) || 0, 0);
      const paid = Math.max(Number(pipelineRow?.paid) || 0, 0);
      const supplierProduction = Math.max(Number(pipelineRow?.supplierProduction) || 0, 0);
      const activeKeys = props.activeProjectKeys?.length ? props.activeProjectKeys : [props.projectName];
      const reservedOther = reservations.filter((entry) => entry.code === code && !activeKeys.includes(entry.projectKey)).reduce((sum,entry)=>sum+(Number(entry.qty)||0),0);
      const reservedTotal = reservations.filter((entry) => entry.code === code).reduce((sum,entry)=>sum+(Number(entry.qty)||0),0);
      const freeWarehouse = Math.max(balance - reservedTotal, 0);
      const supplyAvailable = Math.max(balance - reservedOther, 0) + inTransit + paid + supplierProduction;
      const shortage = match.stock ? Math.max(totalDemand - Math.max(supplyAvailable, 0), 0) : 0;
      const totalStockLengthM = (old?.stockLengthM ?? 0) + (item.stockLengthM ?? 0);
      const totalMassKg = (old?.massKg ?? 0) + (sheet ? item.qty : (item.massKg ?? 0));
      const metrics = calculateStockLengthMetrics({
        name: item.name,
        unit: item.unit,
        qty: sheet ? item.qty : totalDemand,
        price: item.price,
        stockLengthM: item.stockLengthM === undefined ? undefined : totalStockLengthM,
        massKg: item.massKg === undefined ? undefined : totalMassKg,
        metricBasis: item.metricBasis,
      });
      rows.set(key, {
        key,
        name: item.name,
        group: item.group,
        demand: totalDemand,
        rawDemand,
        stockUnit: sheet ? 'шт' : (match.convertedUnit ?? match.stock?.unit ?? item.unit),
        balance,
        available: match.stock ? Math.min(totalDemand, Math.max(supplyAvailable, 0)) : 0,
        shortage,
        shortageCost: shortage * item.price * (sheet?.massPerSheetKg ?? match.priceFactor),
        unitPrice: item.price * (sheet?.massPerSheetKg ?? match.priceFactor),
        code,
        stock: match.stock,
        reason: sheet ? `${match.reason}; ${sheet.basis}` : match.reason,
        massKg: sheet ? totalMassKg : metrics.massKg,
        pieces3m: metrics.pieces3m,
        pieceMassKg: sheet?.massPerSheetKg,
        pieceLabel: sheet?.label,
        metricBasis: sheet?.basis ?? metrics.basis,
        stockLengthM: item.stockLengthM === undefined ? undefined : totalStockLengthM,
        inTransit, paid, supplierProduction, reserved:reservedTotal, freeWarehouse, availableTotal:supplyAvailable, requiredOrder:shortage,
      });
    });
    return [...rows.values()].sort((a, b) => Number(Boolean(b.shortage)) - Number(Boolean(a.shortage)) || a.name.localeCompare(b.name, "ru"));
  }, [props.items, props.stock, pipeline, reservations, props.activeProjectKeys, props.projectName]);

  const matched = planned.filter((row) => row.stock);
  const unresolved = planned.filter((row) => !row.stock);
  const missingBalance = unresolved.filter((row) => row.code);
  const missingCode = unresolved.filter((row) => !row.code);
  const procurement = sortProcurementRows(planned.filter((row) => row.code && procurementOrderQuantity(row, procurementStockMode) > 0));
  const confirmedShortage = matched.filter((row) => row.shortage > 0);
  const totalNeed = procurement.reduce((sum, row) => sum + procurementOrderCost(row, procurementStockMode), 0);
  const coverage = matched.reduce((sum, row) => sum + row.demand, 0) ? matched.reduce((sum, row) => sum + row.available, 0) / matched.reduce((sum, row) => sum + row.demand, 0) * 100 : 0;

  async function handleStock(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const rows = await parseStockFile(file);
      const source = `${file.name} · лист с колонкой «Конечный остаток»`;
      if (props.onPersistStock) await props.onPersistStock(file, rows, source);
      props.setStock(rows);
      props.setStockSource(source);
      setLastUpdated(new Date().toLocaleString("ru-RU"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось прочитать складской файл.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  function addReplacement() {
    const source = planned.find((row) => procurementOrderQuantity(row, procurementStockMode) > 0) ?? planned[0];
    setReplacements((current) => [...current, { id: `${Date.now()}-${current.length}`, sourceKey: source?.key ?? "", replacementCode: "", replacementName: "", quantity: source ? procurementOrderQuantity(source, procurementStockMode) : 0, unitPrice: 0, note: "" }]);
  }

  function updateReplacement(id: string, patch: Partial<ReplacementRow>) {
    setReplacements((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  return <div className="materials-planning">
    <div className="materials-head panel">
      <div>
        <p className="eyebrow">Проект / заказ</p>
        <h2>{props.selectedOrderLabels?.length ? `Общая потребность: ${props.selectedOrderLabels.length} заказ(а)` : props.projectName}</h2>
        {props.selectedOrderLabels?.length ? <div className="selected-order-scope"><strong>В расчёт включены:</strong>{props.selectedOrderLabels.map((label) => <span key={label}>{label}</span>)}</div> : null}
        <div className="material-nominal-scenario"><strong>Расчётный сценарий:</strong><span>{props.calculationScenarioLabel || "Исходный номинал"}</span><small>Потребность, заказ материалов и резервы сформированы по этому же варианту калькулятора.</small></div>
        <span>Источник остатков: {props.stockSource}</span>
        <small>Последнее успешное обновление: {lastUpdated || "в текущем сеансе ещё не выполнялось"} · режим: ручной{error ? ` · последняя ошибка: ${error}` : " · ошибок последнего импорта нет"}</small>
      </div>
      <div className="materials-actions">
        <input ref={inputRef} type="file" accept=".xlsm,.xlsx,.xls" onChange={handleStock} hidden />
        <button className="stock-upload" onClick={() => inputRef.current?.click()} disabled={loading}>{loading ? "Читаю остатки…" : "Обновить остатки из Excel"}</button>
        <small>Используется «Конечный остаток» по каждой позиции</small>
      </div>
    </div>
    {error && <p className="import-error">{error}</p>}

    <div className="material-tabs" role="tablist" aria-label="Планирование материалов">
      <button className={props.mode === "requirements" ? "active" : ""} onClick={props.onOpenRequirements}>Потребность и склад</button>
      <button className={props.mode === "procurement" ? "active" : ""} onClick={props.onOpenProcurement}>Заказ материалов <span>{procurement.length}</span></button>
    </div>

    {props.mode === "requirements" ? <>
      <div className="composition-kpis materials-kpis">
        <div><span>Материалов в расчёте</span><strong>{planned.length}</strong><small>сводные позиции</small></div>
        <div><span>Сопоставлено со складом</span><strong>{matched.length}</strong><small>по коду или строгому правилу</small></div>
        <div className={confirmedShortage.length ? "risk" : "ok"}><span>Дефицитных позиций</span><strong>{confirmedShortage.length}</strong><small>{missingBalance.length} позиций требуют проверки остатка</small></div>
        <div className={missingCode.length ? "risk" : "ok"}><span>Без подтверждённого кода</span><strong>{missingCode.length}</strong><small>{missingBalance.length} кодов нет в остатках</small></div>
      </div>
      <div className="panel composition material-table-panel">
        <div className="panel-title"><div><span>01</span><h2>Потребность с учётом остатков</h2></div><div className="requirements-export-actions"><small>покрытие подтверждённых позиций {number.format(coverage)}%</small><button type="button" onClick={() => downloadRequirementsXlsx(props.projectName, planned, props.selectedOrderLabels)}>Выгрузить потребность в Excel</button></div></div>
        <div className="supply-ledger-toolbar"><strong>Доступность материалов</strong><span>Свободный склад + в дороге + оплачено + в производстве у изготовителя; чужие резервы исключены</span><button onClick={() => void savePipeline()}>Сохранить состояния</button>{pipelineMessage && <small>{pipelineMessage}</small>}</div><div className="table-wrap"><table className="materials-table requirements-ledger"><thead><tr><th>Материал расчёта</th><th>Код / позиция склада</th><th>Требуется</th><th>На складе</th><th>В резерве</th><th>Свободно на складе</th><th>В дороге</th><th>Оплачено</th><th>В производстве у поставщика</th><th>Доступно всего</th><th>Дефицит</th><th>Требуется заказать</th><th>Статус</th></tr></thead><tbody>
          {planned.map((row) => <tr key={row.key} className={!row.stock ? "mapping-row" : row.shortage > 0 ? "shortage-row" : "covered-row"}>
            <td><small>{row.group}</small><strong>{row.name}</strong></td>
            <td>{row.stock ? <><small>{row.stock.code}</small><span>{row.stock.name}</span></> : row.code ? <><small>{row.code}</small><span>Код подтверждён; нет строки в остатках</span></> : <span>Код не подтверждён</span>}</td>
            <td>{number.format(row.demand)} {row.stockUnit}{row.massKg !== undefined && <small>{number.format(row.massKg)} кг{row.pieceLabel ? ` · лист ${row.pieceLabel} · ${number.format(row.pieceMassKg ?? 0)} кг/лист` : row.pieces3m !== undefined ? ` · ${row.pieces3m} шт. × 3000 мм` : ''}</small>}</td><td>{row.stock ? `${number.format(row.balance)} ${row.stockUnit}` : "—"}</td><td>{row.stock ? `${number.format(row.reserved ?? 0)} ${row.stockUnit}` : "—"}</td><td>{row.stock ? `${number.format(row.freeWarehouse ?? 0)} ${row.stockUnit}` : "—"}</td>
            <td><input className="supply-qty-input" type="number" min="0" step="0.001" value={row.inTransit || ''} onChange={e=>updatePipeline(row,{inTransit:Number(e.target.value)||0})}/></td>
            <td><input className="supply-qty-input" type="number" min="0" step="0.001" value={row.paid || ''} onChange={e=>updatePipeline(row,{paid:Number(e.target.value)||0})}/></td>
            <td><input className="supply-qty-input" type="number" min="0" step="0.001" value={row.supplierProduction || ''} onChange={e=>updatePipeline(row,{supplierProduction:Number(e.target.value)||0})}/></td>
            <td>{row.stock ? `${number.format(row.availableTotal ?? 0)} ${row.stockUnit}` : "—"}</td><td>{row.stock ? <strong>{number.format(row.shortage)} {row.stockUnit}</strong> : "—"}</td><td>{row.stock ? <strong>{number.format(row.requiredOrder ?? 0)} {row.stockUnit}</strong> : "—"}</td>
            <td><span className={`planning-status ${!row.stock ? row.code ? "no-stock" : "mapping" : row.shortage > 0 ? "shortage" : "covered"}`}>{!row.stock ? row.code ? "Нет в остатках" : "Уточнить код" : row.shortage > 0 ? "Дефицит" : "Покрыто"}</span><small>{row.reason}</small></td>
          </tr>)}
        </tbody></table></div>
      </div>
    </> : <>
      <div className="procurement-stock-mode panel">
        <div><strong>Расчёт заказа материалов</strong><small>Выберите, вычитать ли склад, резервы и подтверждённые поставки.</small></div>
        <div className="procurement-stock-mode-actions">
          <button type="button" className={procurementStockMode === "with-stock" ? "active" : ""} onClick={() => setProcurementStockMode("with-stock")}>С учётом складских остатков</button>
          <button type="button" className={procurementStockMode === "without-stock" ? "active" : ""} onClick={() => setProcurementStockMode("without-stock")}>Без учёта складских остатков</button>
        </div>
      </div>
      <div className="procurement-summary">
        <div><span>Позиций к заказу / проверке</span><strong>{procurement.length}</strong></div>
        <div><span>Расчётная сумма</span><strong>{money.format(totalNeed)}</strong><small>{procurementModeLabel(procurementStockMode)}</small></div>
        <button disabled={!procurement.length} onClick={() => downloadXlsx(props.projectName, procurement, props.selectedOrderLabels, props.comparisonComponents ?? [], props.calculationScenarioLabel || "Исходный номинал", procurementStockMode)}>Скачать XLSX для снабжения</button>
      </div>
      <div className="notice procurement-note"><b>Контроль перед отправкой</b><span>{procurementModeLabel(procurementStockMode)}. Материалы отсортированы: шины → профили → листы → прочие. Синтокартон исключён. Без кода 1С: {missingCode.length}. Требуют проверки остатка или единицы: {missingBalance.length}.</span></div>
      <div className="panel composition material-table-panel">
        <div className="panel-title"><div><span>02</span><h2>Заказ материалов для отдела снабжения</h2></div><small>{procurement.length} позиций с подтверждённым кодом</small></div>
        {procurement.length ? <div className="table-wrap"><table className="materials-table procurement-table"><thead><tr><th>Группа</th><th>Код 1С / номенклатура</th><th>Ед.</th><th>Потребность</th><th>Масса, кг</th><th>Заготовки 3000 мм, шт.</th><th>Листы, шт.</th><th>Остаток</th><th>Заказать</th><th>Цена за единицу</th><th>Расчётная сумма</th></tr></thead><tbody>
          {procurement.map((row) => <tr key={row.key} className={!row.stock ? "mapping-row" : "shortage-row"}><td><strong>{procurementMaterialGroup(row)}</strong></td><td><small>{row.code}</small><strong>{row.stock?.name ?? row.name.replace(/^.*?\s*[·•-]\s*/, "")}</strong>{row.metricBasis && <small>{row.metricBasis}</small>}</td><td>{row.stockUnit}</td><td>{number.format(row.demand)}</td><td>{row.massKg === undefined ? "—" : row.massKg.toFixed(3)}</td><td>{row.pieces3m === undefined ? "—" : <strong>{row.pieces3m}</strong>}</td><td>{row.pieceLabel ? <strong>{Math.ceil(row.demand)}</strong> : "—"}</td><td>{row.stock ? number.format(row.balance) : "—"}</td><td><strong>{number.format(procurementOrderQuantity(row, procurementStockMode))}</strong></td><td>{money.format(row.unitPrice)}</td><td>{money.format(procurementOrderCost(row, procurementStockMode))}</td></tr>)}
        </tbody></table></div> : <div className="empty">По подтверждённым складским позициям дефицита нет.</div>}
      </div>
      {missingCode.length > 0 && <div className="panel unresolved-panel"><div className="panel-title"><div><span>!</span><h2>Не включено в заказ</h2></div><small>{missingCode.length} позиций без кода 1С</small></div>{missingCode.map((row) => <div key={row.key}><strong>{row.name}</strong><span>{number.format(row.demand)} {row.stockUnit}</span><small>{row.reason}</small></div>)}</div>}
    </>}

    <section className="panel procurement-comparison-panel">
      <div className="panel-title"><div><span>03</span><h2>Сравнительные таблицы закупки</h2></div><button type="button" className="comparison-toggle" onClick={() => setComparisonOpen((value) => !value)}>{comparisonOpen ? "Свернуть" : "Открыть"}</button></div>
      {comparisonOpen && <>
        <div className="comparison-summary-grid">
          <div><span>Проектов / заказов</span><strong>{props.selectedOrderLabels?.length || 1}</strong><small>{props.calculationScenarioLabel || "Исходный номинал"}</small></div>
          <div><span>Позиций к закупке</span><strong>{procurement.length}</strong><small>включая позиции для проверки</small></div>
          <div><span>Расчётный бюджет</span><strong>{money.format(totalNeed)}</strong><small>{procurementModeLabel(procurementStockMode)}</small></div>
          <button type="button" className="primary comparison-export" onClick={() => downloadProcurementComparisonXlsx(props.projectName, planned, props.selectedOrderLabels ?? [], props.comparisonComponents ?? [], replacements, props.calculationScenarioLabel || "Исходный номинал", procurementStockMode)}>Выгрузить сравнительную таблицу в Excel</button>
        </div>

        <div className="comparison-block">
          <div className="comparison-block-title"><div><strong>Комплектующие и номиналы</strong><small>Все элементы выбранных заказов; одинаковые строки сохраняют привязку к своему заказу.</small></div><span>{props.comparisonComponents?.length ?? 0} строк</span></div>
          <div className="table-wrap"><table className="comparison-components-table"><thead><tr><th>Проект / заказ</th><th>Категория</th><th>Комплектующий элемент</th><th>Артикул</th><th>Номинал</th><th>Проводность</th><th>Количество</th><th>Рассчитано</th></tr></thead><tbody>
            {(props.comparisonComponents ?? []).map((row, index) => <tr key={`${row.orderLabel}-${row.article}-${index}`}><td>{row.orderLabel}</td><td>{row.kind}</td><td>{row.component}</td><td>{row.article || "—"}</td><td>{row.nominalA ? `${row.nominalA} А` : "—"}</td><td>{row.poles}</td><td>{number.format(row.quantity)}</td><td>{row.calculated ? "Да" : "Нет"}</td></tr>)}
            {!props.comparisonComponents?.length && <tr><td colSpan={8} className="empty">Выберите один или несколько заказов на производство.</td></tr>}
          </tbody></table></div>
        </div>

        <div className="comparison-block">
          <div className="comparison-block-title"><div><strong>Бюджет и приоритетные позиции</strong><small>{procurementStockMode === "with-stock" ? "Итог к закупке рассчитан после вычета доступного склада, резервов и подтверждённых поставок." : "Итог к закупке равен полной потребности: склад, резервы и поставки не вычитаются."}</small></div><span>{money.format(totalNeed)}</span></div>
          <div className="table-wrap"><table className="comparison-budget-table"><thead><tr><th>Код / материал</th><th>Требуется</th><th>Доступно</th><th>К закупке</th><th>Цена за ед.</th><th>Бюджет</th><th>Приоритет</th></tr></thead><tbody>
            {procurement.map((row) => <tr key={row.key}><td><small>{row.code || "Код не подтверждён"}</small><strong>{row.stock?.name ?? row.name}</strong></td><td>{number.format(row.demand)} {row.stockUnit}</td><td>{row.stock ? `${number.format(row.availableTotal ?? 0)} ${row.stockUnit}` : "—"}</td><td><strong>{number.format(procurementOrderQuantity(row, procurementStockMode))}</strong></td><td>{money.format(row.unitPrice)}</td><td><strong>{money.format(procurementOrderCost(row, procurementStockMode))}</strong></td><td><span className="purchase-priority">{procurementPriority(row, procurementStockMode)}</span></td></tr>)}
            {!procurement.length && <tr><td colSpan={7} className="empty">Закупка не требуется: подтверждённая потребность покрыта.</td></tr>}
          </tbody></table></div>
        </div>

        <div className="comparison-block replacement-workspace">
          <div className="comparison-block-title"><div><strong>Позиции для замены</strong><small>Укажите допустимый аналог, его количество, цену и обоснование. Строки сохраняются в этом браузере и попадают в Excel.</small></div><button type="button" onClick={addReplacement}>+ Добавить замену</button></div>
          <div className="table-wrap"><table className="replacement-table"><thead><tr><th>Исходная позиция</th><th>Код замены</th><th>Наименование замены</th><th>Количество</th><th>Цена за ед.</th><th>Стоимость</th><th>Обоснование</th><th></th></tr></thead><tbody>
            {replacements.map((replacement) => <tr key={replacement.id}>
              <td><select value={replacement.sourceKey} onChange={(event) => { const source = planned.find((row) => row.key === event.target.value); updateReplacement(replacement.id, { sourceKey: event.target.value, quantity: source ? procurementOrderQuantity(source, procurementStockMode) : replacement.quantity }); }}><option value="">Выберите позицию</option>{planned.map((row) => <option key={row.key} value={row.key}>{row.code || "Без кода"} · {row.stock?.name ?? row.name}</option>)}</select></td>
              <td><input value={replacement.replacementCode} onChange={(event) => updateReplacement(replacement.id, { replacementCode: event.target.value })} placeholder="Код 1С" /></td>
              <td><input value={replacement.replacementName} onChange={(event) => updateReplacement(replacement.id, { replacementName: event.target.value })} placeholder="Наименование аналога" /></td>
              <td><input type="number" min="0" step="0.001" value={replacement.quantity || ""} onChange={(event) => updateReplacement(replacement.id, { quantity: Number(event.target.value) || 0 })} /></td>
              <td><input type="number" min="0" step="0.01" value={replacement.unitPrice || ""} onChange={(event) => updateReplacement(replacement.id, { unitPrice: Number(event.target.value) || 0 })} /></td>
              <td><strong>{money.format(replacement.quantity * replacement.unitPrice)}</strong></td>
              <td><input value={replacement.note} onChange={(event) => updateReplacement(replacement.id, { note: event.target.value })} placeholder="Почему допустима замена" /></td>
              <td><button type="button" className="danger-link" onClick={() => setReplacements((current) => current.filter((row) => row.id !== replacement.id))}>Удалить</button></td>
            </tr>)}
            {!replacements.length && <tr><td colSpan={8} className="empty">Позиции для замены ещё не добавлены.</td></tr>}
          </tbody></table></div>
        </div>
      </>}
    </section>
  </div>;
}
