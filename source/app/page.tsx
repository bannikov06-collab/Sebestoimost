"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import ProjectCompositionPanel, {
  parseProductionOrder,
  ProjectOrder,
  ProjectRow,
} from "./components/ProjectCompositionPanel";
import CurrentOrdersPanel, {
  OrderTransferPreview,
} from "./components/CurrentOrdersPanel";
import MaterialsPlanningPanel, {
  initialStock,
  ProcurementComponentRow,
  StockItem,
} from "./components/MaterialsPlanningPanel";
import CalculationGapsPanel from "./components/CalculationGapsPanel";
import DepartmentResponsibilityPanel from "./components/DepartmentResponsibilityPanel";
import EnterpriseWorkspacePanel from "./components/EnterpriseWorkspacePanel";
import IlliquidPanel from "./components/IlliquidPanel";
import ManufacturingRulesPanel from "./components/ManufacturingRulesPanel";
import PreliminarySpecificationPanel, { parsePreliminarySpecification, PreliminaryScenarioBuild } from "./components/PreliminarySpecificationPanel";
import ApprovedRulesRegistryPanel from "./components/ApprovedRulesRegistryPanel";
import ExternalCostDataPanel from "./components/ExternalCostDataPanel";
import ControlCalculationPanel, { ControlPilotDocument } from "./components/ControlCalculationPanel";
import MultiProjectSelector from "./components/MultiProjectSelector";
import ReservationsPanel from "./components/ReservationsPanel";
import {
  ALUMINIUM_DENSITY_KG_M3,
  calculateBusStock,
  STOCK_BUS_LENGTH_M,
} from "./lib/busStock";
import { DefaultedOrderRow, UnsupportedOrderRow } from "./lib/orderTransfer";
import {
  resolveSectionRule,
  SECTION_RULES_SOURCE,
  SECTION_RULES_VERSION,
} from "./lib/sectionRules";
import { calculatePeEarBlank, calculateJointMaterialLines, parseJointSpecificationRow, type JointDemandRow, BUSWAY_BUS_SECTION_BY_THICKNESS } from "./lib/manufacturingRules";
import {
  CommercialEstimate,
  commercialTotals,
  inferCommercialLength,
  PreliminarySpecification,
} from "./lib/preliminarySpecification";
import { searchCatalog } from "./lib/catalogSearch";
import { resolveFormulaCode, resolveFormulaCodeFromArticle } from "./lib/sectionFormulaCode";
import { getPreliminaryDimensions, preliminaryDimensionRuleText } from "./lib/preliminaryDimensionRules";
import { findApprovedCode } from "./lib/approvedCodes";
import { shiftPreliminaryNominal } from "./lib/nominalScenarios";
import elementCatalogSource from "./data/elementCatalog.json";
import { detectPoleCount, getCalculationBusConfig, getStandardDimensions, STANDARD_DIMENSIONS_SOURCE, type DimensionSource, type PoleCount } from "./lib/standardDimensions";
import { calculateParametricMaterialGeometry, calculatePetMassKg } from "./lib/parametricMaterials";
import { calculateAtt, isApprovedAttCurrent } from "./lib/attCmlRules";
import { calculateCmlStandard, CML_STANDARD_FE_MM, CML_STANDARD_OVERALL_MM, CML_SUPPORTED_CURRENTS } from "./lib/cmlStandardRules";
import { calculateQueueDates, estimateProductionHours } from "./lib/projectPlanning";
import type { DemandLine, AvailabilityLine } from "./lib/reservations";
import { calculateSidewallSheetMassKg, selectSidewallResource } from "./lib/sidewallRules";

type Item = {
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
type Saved = {
  id: number;
  projectName: string;
  sectionName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  createdAt: string;
};
type SectionCode =
  | "FE"
  | "CD"
  | "CP"
  | "ZD"
  | "ZP"
  | "TP"
  | "ZDP"
  | "TD"
  | "ATT"
  | "CML"
  | "ATSC"
  | "ATCP"
  | "ATCD";
type ElementCatalogItem = {
  id: number;
  sourceNumber: number;
  code: string;
  name: string;
};
type NetworkElement = {
  id: number;
  typeId: number;
  current: number;
  poles: PoleCount;
  lengths: number[];
  dimensionSources: DimensionSource[];
  dimensionOriginals: number[];
  quantity: number;
  weldedVertical: boolean;
};
type OrderTransferReport = {
  orderNumber: string;
  supportedRows: number;
  unsupportedRows: UnsupportedOrderRow[];
  defaultedRows: DefaultedOrderRow[];
};
type ProjectStage =
  | "ПО"
  | "КО"
  | "ТО"
  | "Снабжение"
  | "Производство"
  | "ОТК"
  | "Отгрузка"
  | "Монтаж";
type WorkObject = {
  id: number;
  name: string;
  customer: string;
  volume: number;
  priority: "Высокий" | "Средний" | "Низкий";
  departmentId: string;
  owner: string;
  stage: ProjectStage;
  checklist: string[];
  checklistDone: boolean[];
  completed: boolean;
  due: string;
  orderNumber?: string;
  priorityOrder: number | null;
  productionHours: number;
  productionLoads?: Record<string, number>;
  scheduleWarnings?: string[];
  loadedAt?: string;
  plannedStart?: string;
  plannedReady?: string;
  autoFromOrder?: boolean;
};
type BusStockSummary = {
  key: string;
  section: string;
  lengthM: number;
  massKg: number;
  equivalent3m: number;
  stockPieces3m: number;
};

const projectStages: ProjectStage[] = [
  "ПО",
  "КО",
  "ТО",
  "Снабжение",
  "Производство",
  "ОТК",
  "Отгрузка",
  "Монтаж",
];
const stageProgress = (stage: ProjectStage, completed = false) =>
  completed
    ? 100
    : Math.round((projectStages.indexOf(stage) / projectStages.length) * 100);
const aluminiumDensity = ALUMINIUM_DENSITY_KG_M3;
const initialObjects: WorkObject[] = [];
const departments = [
  {
    id: "project",
    number: "01",
    name: "Проектный отдел",
    short: "ПО",
    accent: "#526f8a",
    members: [
      "Елдин Егор",
      "Плакущая Любовь",
      "Захаров Дмитрий",
      "Волчкевич Олег",
      "Лисин Алексей",
      "Давлатов Сухроб",
      "Сергейцев Никита",
      "Фомин Вадим",
    ],
    tasks: [
      "Проработка объекта и трассы шинопровода",
      "Подготовка исходных данных для выпуска КД",
      "Согласование проектных решений и изменений",
    ],
    handoff: "Результат: согласованные исходные данные по объекту",
  },
  {
    id: "design",
    number: "02",
    name: "Конструкторский отдел",
    short: "КД",
    accent: "#466f63",
    members: [
      "Стожаров Дмитрий",
      "Михайлова Татьяна",
      "Клещевникова Ирина",
      "Мочанов Александр",
      "Банников Евгений",
      "Новиков Андрей",
    ],
    tasks: [
      "Разработка и корректировка КД",
      "Проверка компоновки и типоразмеров",
      "Передача утверждённой КД технологам",
    ],
    handoff: "Результат: утверждённый комплект КД",
  },
  {
    id: "technology",
    number: "03",
    name: "Технологический отдел",
    short: "ТО",
    accent: "#8c7a39",
    members: ["Безруков Александр", "Шенева Екатерина"],
    tasks: [
      "Проверка технологичности конструкции",
      "Разработка маршрута и технологических карт",
      "Нормирование материалов и операций",
    ],
    handoff: "Результат: готовность заказа к запуску",
  },
  {
    id: "production",
    number: "04",
    name: "Производство",
    short: "ПР",
    accent: "#a55743",
    members: ["Заготовительный цех", "Покраска", "Сборочный цех"],
    tasks: [
      "Формирование сменных заданий",
      "Выпуск и пооперационный контроль",
      "Фиксация факта, брака и отклонений",
    ],
    handoff: "Результат: изготовленные и принятые секции",
  },
];
const assignmentDepartments = [
  {
    id: "project",
    name: "Проектный отдел",
    members: departments.find((d) => d.id === "project")?.members ?? [],
  },
  {
    id: "design",
    name: "Конструкторский отдел",
    members: departments.find((d) => d.id === "design")?.members ?? [],
  },
  {
    id: "technology",
    name: "Технологический отдел",
    members: departments.find((d) => d.id === "technology")?.members ?? [],
  },
  { id: "supply", name: "Снабжение", members: [] as string[] },
  { id: "production", name: "Производство", members: [] as string[] },
  { id: "quality", name: "ОТК", members: [] as string[] },
  { id: "shipping", name: "Отгрузка", members: [] as string[] },
  { id: "installation", name: "Монтаж", members: [] as string[] },
];
const stageDepartment: Record<ProjectStage, string> = {
  ПО: "project",
  КО: "design",
  ТО: "technology",
  Снабжение: "supply",
  Производство: "production",
  ОТК: "quality",
  Отгрузка: "shipping",
  Монтаж: "installation",
};

const currents = [
  160, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000,
  5000, 6300,
];
const bus: Record<
  number,
  { count: number; height: number; thickness: number }
> = {
  160: { count: 1, height: 30, thickness: 6 },
  250: { count: 1, height: 30, thickness: 6 },
  315: { count: 1, height: 30, thickness: 6 },
  400: { count: 1, height: 30, thickness: 6 },
  500: { count: 1, height: 40, thickness: 6 },
  630: { count: 1, height: 50, thickness: 6 },
  800: { count: 1, height: 65, thickness: 6 },
  1000: { count: 1, height: 100, thickness: 6 },
  1250: { count: 1, height: 130, thickness: 6 },
  1600: { count: 1, height: 160, thickness: 6 },
  2000: { count: 1, height: 200, thickness: 6 },
  2500: { count: 2, height: 130, thickness: 6 },
  3200: { count: 2, height: 160, thickness: 6 },
  4000: { count: 2, height: 200, thickness: 6 },
  5000: { count: 4, height: 130, thickness: 6 },
  6300: { count: 4, height: 160, thickness: 6 },
};

const busCodeByHeight: Partial<Record<number, string>> = {
  30: "УТ000002292",
  50: "Ц0000077017",
  65: "Ц0000079245",
  100: "Ц0000072703",
  130: "Ц0000078399",
  160: "Ц0000072624",
  200: "Ц0000072623",
};
const sectionInfo: Record<
  SectionCode,
  {
    name: string;
    dims: number;
    step: number;
    defaults: Record<number, number[]>;
  }
> = {
  FE: {
    name: "Прямая секция",
    dims: 1,
    step: 10,
    defaults: Object.fromEntries(currents.map((i) => [i, [3000]])),
  },
  CD: {
    name: "Угловая горизонтальная",
    dims: 2,
    step: 50,
    defaults: Object.fromEntries(currents.map((i) => [i, [435, 435]])),
  },
  CP: {
    name: "Угловая вертикальная",
    dims: 2,
    step: 50,
    defaults: {
      160: [300, 300],
      250: [300, 300],
      315: [300, 300],
      400: [300, 300],
      500: [300, 300],
      630: [300, 300],
      800: [300, 300],
      1000: [450, 450],
      1250: [450, 450],
      1600: [450, 450],
      2000: [450, 450],
      2500: [600, 600],
      3200: [650, 650],
      4000: [750, 750],
      5000: [950, 950],
      6300: [1100, 1100],
    },
  },
  ZD: {
    name: "Z-образная горизонтальная",
    dims: 3,
    step: 50,
    defaults: Object.fromEntries(currents.map((i) => [i, [435, 415, 435]])),
  },
  ZP: {
    name: "Z-образная вертикальная",
    dims: 3,
    step: 50,
    defaults: {
      160: [300, 180, 300],
      250: [300, 180, 300],
      315: [300, 180, 300],
      400: [300, 180, 300],
      500: [300, 180, 300],
      630: [300, 220, 300],
      800: [300, 260, 300],
      1000: [450, 260, 450],
      1250: [450, 300, 450],
      1600: [450, 340, 450],
      2000: [450, 380, 450],
      2500: [600, 480, 600],
      3200: [650, 550, 650],
      4000: [750, 630, 750],
      5000: [950, 850, 950],
      6300: [1100, 970, 1100],
    },
  },
  TP: {
    name: "Тройниковая вертикальная",
    dims: 3,
    step: 50,
    defaults: {
      160: [530, 300, 265],
      250: [530, 300, 265],
      315: [530, 300, 265],
      400: [530, 300, 265],
      500: [530, 300, 265],
      630: [530, 300, 265],
      800: [530, 300, 265],
      1000: [760, 450, 380],
      1250: [730, 450, 365],
      1600: [700, 450, 350],
      2000: [660, 450, 330],
      2500: [850, 600, 425],
      3200: [890, 650, 445],
      4000: [1010, 750, 505],
      5000: [1200, 950, 600],
      6300: [1380, 1100, 690],
    },
  },
  ZDP: {
    name: "Угловая комбинированная",
    dims: 3,
    step: 50,
    defaults: {
      160: [300, 300, 435],
      250: [300, 300, 435],
      315: [300, 300, 435],
      400: [300, 300, 435],
      500: [300, 300, 435],
      630: [300, 300, 435],
      800: [300, 300, 435],
      1000: [450, 450, 435],
      1250: [450, 450, 435],
      1600: [450, 450, 435],
      2000: [450, 450, 435],
      2500: [600, 600, 435],
      3200: [650, 650, 435],
      4000: [750, 750, 435],
      5000: [950, 950, 435],
      6300: [1100, 1100, 435],
    },
  },
  TD: {
    name: "Тройниковая горизонтальная",
    dims: 3,
    step: 50,
    defaults: {
      160: [680, 485, 340],
      250: [680, 485, 340],
      315: [680, 485, 340],
      400: [680, 485, 340],
      500: [700, 485, 350],
      630: [720, 485, 360],
      800: [750, 485, 375],
      1000: [820, 485, 410],
      1250: [880, 485, 440],
      1600: [940, 485, 470],
      2000: [1020, 485, 510],
      2500: [1140, 485, 570],
      3200: [1260, 485, 630],
      4000: [1420, 485, 710],
      5000: [1660, 485, 830],
      6300: [1900, 485, 950],
    },
  },
  ATT: {
    name: "Терминальная секция трансформаторная ATT",
    dims: 3,
    step: 10,
    defaults: {},
  },
  CML: {
    name: "Компенсационная секция CML",
    dims: 1,
    step: 10,
    defaults: Object.fromEntries(CML_SUPPORTED_CURRENTS.map((current) => [current, [CML_STANDARD_OVERALL_MM]])),
  },
  ATSC: {
    name: "Терминальная секция ATSC",
    dims: 2,
    step: 50,
    defaults: Object.fromEntries(currents.map((i) => [i, [240, 450]])),
  },
  ATCP: {
    name: "Присоединительная вертикальная",
    dims: 3,
    step: 50,
    defaults: {
      160: [190, 400, 300],
      250: [190, 400, 300],
      315: [190, 400, 300],
      400: [190, 400, 300],
      500: [200, 410, 300],
      630: [210, 420, 300],
      800: [225, 435, 300],
      1000: [260, 470, 450],
      1250: [290, 500, 450],
      1600: [320, 530, 450],
      2000: [360, 570, 450],
      2500: [470, 680, 600],
      3200: [530, 740, 650],
      4000: [610, 820, 750],
      5000: [825, 1035, 950],
      6300: [945, 1155, 1100],
    },
  },
  ATCD: {
    name: "Присоединительная горизонтальная",
    dims: 3,
    step: 50,
    defaults: Object.fromEntries(currents.map((i) => [i, [260, 470, 435]])),
  },
};
const elementCatalog = elementCatalogSource as ElementCatalogItem[];
const elementCatalogById = new Map(
  elementCatalog.map((item) => [item.id, item]),
);
const defaultTypeIdByCode: Record<SectionCode, number> = {
  ZP: 9,
  ZDP: 19,
  ZD: 20,
  TP: 33,
  TD: 35,
  CML: 115,
  ATT: 137,
  FE: 104,
  CP: 113,
  CD: 122,
  ATSC: 145,
  ATCP: 148,
  ATCD: 150,
};
const AMG3_DENSITY_KG_M3 = 2700;

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const articleFor = (current: number, code: SectionCode, poles: PoleCount = 4) =>
  `${String(current / 100).replace(".", ",")}.${code}.${poles}Р`;

const getApprovedDimensions = (code: SectionCode, current: number, poles: PoleCount) => {
  if (code === "CML") return CML_SUPPORTED_CURRENTS.includes(current as typeof CML_SUPPORTED_CURRENTS[number]) && (poles === 4 || poles === 5) ? [CML_STANDARD_OVERALL_MM] : [];
  if (code === "ATT") return [];
  return getStandardDimensions(code, current, poles);
};

function preliminaryToOrder(specification: PreliminarySpecification): ProjectOrder {
  const rows: ProjectRow[] = specification.rows.map((row) => ({
    id: row.id,
    rowNumber: row.rowNumber,
    priority: "",
    checked: "",
    specification: specification.number,
    line: specification.projectName,
    item: row.item,
    article: row.article,
    quantity: row.quantity,
    unit: row.unit,
    marking: "",
    drawingNumber: "",
    l1: row.commercialLengthMm > 0 ? String(row.commercialLengthMm) : "",
    l2: "",
    l3: "",
    version: "",
    constructionType: "",
    extra: row.lengthClass ? `Коммерческая длина ${row.lengthClass}` : "",
  }));
  return {
    id: `preliminary-${specification.id}`,
    number: `ПР-${specification.number}`,
    date: specification.date,
    filename: specification.filename,
    specification: specification.number,
    workflow: "received",
    rows,
    loadedAt: new Date().toISOString(),
    projectName: specification.projectName,
    documentRecordId: specification.documentRecordId,
    sourceKind: "preliminary_specification",
  };
}

function orderToElements(order: ProjectOrder) {
  const currentByArticle: Record<string, number> = {
    "02": 250,
    "03": 315,
    "04": 400,
    "05": 500,
    "06": 630,
    "08": 800,
    "10": 1000,
    "12": 1250,
    "16": 1600,
    "20": 2000,
    "25": 2500,
    "32": 3200,
    "40": 4000,
    "50": 5000,
    "63": 6300,
  };
  const normalize = (value: string) =>
    value
      .toUpperCase()
      .replace(/Ё/g, "Е")
      .replace(/Р/g, "P")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, "");
  const catalogByCodeLength = [...elementCatalog].sort(
    (left, right) => right.code.length - left.code.length,
  );
  const unsupportedRows: UnsupportedOrderRow[] = [];
  const defaultedRows: DefaultedOrderRow[] = [];
  const parsed: NetworkElement[] = [];
  const jointRows: JointDemandRow[] = [];
  order.rows.forEach((row) => {
    const joint = parseJointSpecificationRow(row, "production");
    if (joint) { jointRows.push(joint); return; }
    const article = normalize(row.article);
    const itemName = normalize(row.item);
    const currentCode = article
      .split("-")
      .find((part) => currentByArticle[part]);
    const current = currentCode ? currentByArticle[currentCode] : undefined;
    const poles = detectPoleCount(row.article);
    const articleFamily = resolveFormulaCodeFromArticle(row.article);
    const catalog =
      (articleFamily ? elementCatalogById.get(defaultTypeIdByCode[articleFamily]) : undefined) ??
      catalogByCodeLength.find((item) => {
        const code = normalize(item.code);
        return code.length >= 2 && article.includes(`-${code}`);
      }) ??
      catalogByCodeLength.find(
        (item) =>
          item.code && itemName && itemName.includes(normalize(item.name)),
      );
    let reason = "";
    if (!catalog) reason = "Тип элемента не сопоставлен со справочником";
    else if (!current || !getCalculationBusConfig(current, detectPoleCount(row.article)))
      reason = "Не распознан номинальный ток или конфигурация проводников из артикула";
    else if (!(row.quantity > 0)) reason = "Количество должно быть больше нуля";
    const approvedCode = catalog ? resolveFormulaCode(catalog) : undefined;
    if (!reason && approvedCode === "ATT" && (poles !== 4 || !isApprovedAttCurrent(current))) reason = `ATT ${current} А ${poles}P: расчёт подтверждён только для 4P 1000/3200/5000 А`;
    if (!reason && approvedCode === "CML" && (!CML_SUPPORTED_CURRENTS.includes(current as typeof CML_SUPPORTED_CURRENTS[number]) || (poles !== 4 && poles !== 5))) reason = `CML ${current} А ${poles}P: поддерживается стандартный ряд 4P/5P от 630 до 6300 А`;
    if (reason || !catalog || !current) {
      unsupportedRows.push({
        rowNumber: row.rowNumber,
        item: row.item,
        article: row.article,
        quantity: row.quantity,
        reason,
      });
      return;
    }
    const dimensions = [row.l1, row.l2, row.l3].map(
      (value) =>
        Number(
          String(value)
            .replace(/\u00a0/g, "")
            .replace(/\s/g, "")
            .replace(",", "."),
        ) || 0,
    );
    const knownCode = resolveFormulaCode(catalog);
    const defaults = knownCode ? getApprovedDimensions(knownCode, current, poles) : [];
    const preliminaryClass = order.sourceKind === "preliminary_specification" ? inferCommercialLength(row.article, row.item).lengthClass : "";
    const preliminaryRuleDimensions = order.sourceKind === "preliminary_specification" && knownCode && knownCode !== "ATT" && knownCode !== "CML"
      ? getPreliminaryDimensions(knownCode, current, poles, preliminaryClass, dimensions[0])
      : [];
    const defaultedDimensions: string[] = [];
    const dimensionSources: DimensionSource[] = [];
    const dimensionOriginals: number[] = [];
    const lengths = dimensions.map((value, index) => {
      const preliminaryValue = preliminaryRuleDimensions[index] ?? 0;
      if (preliminaryRuleDimensions.length && preliminaryValue > 0) {
        defaultedDimensions.push(`L${index + 1}=${preliminaryValue} мм${preliminaryClass ? ` (${preliminaryClass})` : " (Стандарт)"}`);
        dimensionSources[index] = "standard";
        dimensionOriginals[index] = preliminaryValue;
        return preliminaryValue;
      }
      if (value > 0) {
        dimensionSources[index] = "specification";
        dimensionOriginals[index] = value;
        return value;
      }
      const standard = defaults[index] ?? 0;
      if (standard > 0) {
        defaultedDimensions.push(`L${index + 1}=${standard} мм`);
        dimensionSources[index] = "standard";
        dimensionOriginals[index] = standard;
        return standard;
      }
      dimensionSources[index] = "standard";
      dimensionOriginals[index] = 0;
      return 0;
    });
    if (defaultedDimensions.length)
      defaultedRows.push({
        rowNumber: row.rowNumber,
        article: row.article,
        dimensions: defaultedDimensions,
      });
    parsed.push({
      id: parsed.length + 1,
      typeId: catalog.id,
      current,
      poles,
      lengths,
      dimensionSources,
      dimensionOriginals,
      quantity: row.quantity,
      weldedVertical: resolveFormulaCode(catalog) === "CP",
    });
  });
  // Keep the same row order as the uploaded specification in the cost calculator.
  // Material requirements are aggregated later in the planning contour, where the
  // purchase/stock sorting rule belongs. Do not merge or reorder calculation rows here.
  return {
    elements: parsed,
    supportedRows: parsed.length,
    unsupportedRows,
    defaultedRows,
    jointRows,
  };
}

function analyzeOrder(order: ProjectOrder): OrderTransferPreview {
  const converted = orderToElements(order);
  return {
    supportedRows: converted.supportedRows,
    unsupportedRows: converted.unsupportedRows.length,
    totalQuantity: converted.elements.reduce(
      (sum, row) => sum + row.quantity,
      0,
    ),
    groupedElements: converted.elements.length,
  };
}

function specializedLinesToItems(lines: Array<Omit<Item, "total">>): Item[] {
  return lines.map((line) => ({ ...line, total: line.qty * line.price }));
}

function calculateSpecializedElement(
  element: NetworkElement,
  laborRate: number,
  catalog: ElementCatalogItem,
  code: "ATT" | "CML",
) {
  const cfg = getCalculationBusConfig(element.current, element.poles);
  if (!cfg) return null;
  const rule = resolveSectionRule(catalog);
  const massPer3m = (cfg.thickness / 1000) * (cfg.height / 1000) * STOCK_BUS_LENGTH_M * ALUMINIUM_DENSITY_KG_M3;

  if (code === "ATT") {
    const att = calculateAtt(element.current, element.poles);
    if (!att) return null;
    const items = specializedLinesToItems(att.lines);
    const materials = items.reduce((sum, item) => sum + item.total, 0);
    const developedMm = element.lengths.reduce((sum, value) => sum + Math.max(value || 0, 0), 0);
    return {
      code, rule, items, materials, labor: 0, welding: 0, gas: 0, electricity: 0,
      unitCost: materials, totalCost: materials * element.quantity,
      busMass: att.outputBusMassKg, busLengthM: 0, massPer3m, equivalent3m: 0, stockPieces3m: 0,
      developedMm, petBlankWidthM: 0, cfg, tapeFactor: 1, peEar: undefined,
      specialized: { kind: "ATT" as const, designation: att.designation, outputBusCount: att.outputBusCount, insulatorCount: att.insulatorCount, packs: att.packs },
    };
  }

  const overallMm = element.lengths[0] > 0 ? element.lengths[0] : CML_STANDARD_OVERALL_MM;
  let cml;
  try { cml = calculateCmlStandard(element.current, element.poles, cfg, overallMm); } catch { return null; }
  const feCatalog = elementCatalogById.get(defaultTypeIdByCode.FE);
  if (!feCatalog) return null;
  const feElement: NetworkElement = {
    ...element,
    id: -1,
    typeId: defaultTypeIdByCode.FE,
    current: element.current,
    poles: element.poles,
    lengths: [cml.feMm, 0, 0],
    dimensionSources: ["standard", "standard", "standard"],
    dimensionOriginals: [cml.feMm, 0, 0],
    quantity: 1,
    weldedVertical: false,
  };
  const fe = calculateElement(feElement, laborRate, feCatalog);
  if (!fe) return null;
  const feItems = fe.items.map((item) => ({
    ...item,
    name: `2× FE ${element.current} ${element.poles}P L=${cml.feMm} мм · ${item.name}`,
    qty: item.qty * 2,
    total: item.total * 2,
    stockLengthM: item.stockLengthM === undefined ? undefined : item.stockLengthM * 2,
    massKg: item.massKg === undefined ? undefined : item.massKg * 2,
    group: `CML · 2 стандартные FE · ${item.group}`,
  }));
  const ownItems = specializedLinesToItems(cml.lines);
  const items = [...feItems, ...ownItems];
  const materials = items.reduce((sum, item) => sum + item.total, 0);
  const labor = fe.labor * 2;
  const welding = fe.welding * 2;
  const gas = fe.gas * 2;
  const electricity = fe.electricity * 2;
  const unitCost = materials + labor + welding + gas + electricity;
  const contactLengthM = (cml.kshaCount * cml.contactLengthPerKshaMm) / 1000;
  const busLengthM = fe.busLengthM * 2 + contactLengthM;
  const busMass = fe.busMass * 2 + cml.contactMassKg;
  return {
    code, rule, items, materials, labor, welding, gas, electricity, unitCost, totalCost: unitCost * element.quantity,
    busMass, busLengthM, massPer3m, equivalent3m: busLengthM / STOCK_BUS_LENGTH_M, stockPieces3m: Math.ceil(busLengthM / STOCK_BUS_LENGTH_M),
    developedMm: cml.overallMm, petBlankWidthM: fe.petBlankWidthM, cfg, tapeFactor: 1, peEar: undefined,
    specialized: { kind: "CML" as const, flexibleMm: cml.flexibleMm, kshaCount: cml.kshaCount, platesPerKsha: cml.platesPerKsha, mountingNodeCount: cml.mountingNodeCount, thermalShrink: cml.thermalShrink.name },
  };
}

function calculateElement(
  element: NetworkElement,
  laborRate: number,
  catalog: ElementCatalogItem,
) {
  const code = resolveFormulaCode(catalog);
  if (!code) return null;
  if (code === "ATT" || code === "CML") return calculateSpecializedElement(element, laborRate, catalog, code);
  const cfg = getCalculationBusConfig(element.current, element.poles);
  const developedMm = element.lengths
    .slice(0, 3)
    .reduce((s, v) => s + Math.max(v || 0, 0), 0);
  if (!cfg || developedMm <= 0) return null;
  const rule = resolveSectionRule(catalog);
  const geometry = calculateParametricMaterialGeometry({
    current: element.current,
    poles: element.poles,
    sectionCode: code,
    dimensionsMm: element.lengths,
    weldedVertical: element.weldedVertical,
  });
  if (!geometry || !geometry.genericResourceCalculationAllowed) return null;
  const developedM = geometry.developedM;
  const barPerimeterM = geometry.barPerimeterM;
  const petBlankWidthM = geometry.petBlankWidthM;
  const barsTotal = geometry.barsTotal;
  const insulatedBarsTotal = 4 * cfg.count;
  const insulationShare = barsTotal > 0 ? insulatedBarsTotal / barsTotal : 1;
  const posPerBusKg = 0.144 / 4;
  const posQtyKg = posPerBusKg * barsTotal;
  const busLengthM = geometry.busLengthM;
  const busMass = geometry.busMassKg;
  const massPer3m = (cfg.thickness / 1000) * (cfg.height / 1000) * STOCK_BUS_LENGTH_M * ALUMINIUM_DENSITY_KG_M3;
  const isFe = code === "FE";
  const isCd = code === "CD";
  const isCp = code === "CP";
  const cdBusDevelopedMm = Math.max(developedMm - 166.05, 0);
  const effectiveBusLengthM = isCd
    ? barsTotal * (cdBusDevelopedMm / 1000)
    : busLengthM;
  const effectiveBusMass =
    isCd && element.current === 1000
      ? 4.5 * (cdBusDevelopedMm / 703.95)
      : isCd
        ? effectiveBusLengthM * (cfg.thickness / 1000) * (cfg.height / 1000) * ALUMINIUM_DENSITY_KG_M3
      : isCp && element.current === 1000
      ? 4.74 * (developedMm / 900)
      : busMass;
  const effectiveEquivalent3m = effectiveBusLengthM / STOCK_BUS_LENGTH_M;
  const effectiveStockPieces3m = Math.ceil(effectiveEquivalent3m);
  const petInsulatedM = geometry.petInsulatedLengthM;
  const effectiveWelding = rule.verticalAngle && (element.weldedVertical || isCp);
  const tapeFactor = geometry.tapeFactor;
  const sidewallResource = selectSidewallResource({
    family: code,
    currentA: element.current,
    busHeightMm: cfg.height,
    busThicknessMm: cfg.thickness,
    packagesPerPhase: cfg.count,
    familyRequiresSheet: rule.sheetSidewall,
  });
  const sidewallMassKg = calculateSidewallSheetMassKg(sidewallResource, developedM);
  const peEar = calculatePeEarBlank(element.current);
  const items: Item[] = [
    {
      name: `${busCodeByHeight[cfg.height] ?? "Код 1С не подтверждён"} · Шина АД0 ${cfg.thickness}×${cfg.height}×3000 (R=3), ${cfg.count} шт./фазу${isCd && element.current === 1000 ? " · масса 4,50 кг по КД CD" : isCp && element.current === 1000 ? " · масса 4,74 кг по КД CP" : ""}`,
      unit: "кг",
      qty: effectiveBusMass,
      price: 450,
      total: 0,
      group: "Шины",
      stockLengthM: effectiveBusLengthM,
      massKg: effectiveBusMass,
      metricBasis: `Параметрический расчёт: ${barsTotal} шин (${element.poles}P × ${cfg.count} пакет/фазу), ${cfg.thickness}×${cfg.height} мм; длина из L1/L2/L3`,
    },
    {
      name: "Ц0000059919 · Порошковый материал порошок припойный ПОС 61",
      unit: "кг",
      qty: posQtyKg,
      price: 5600,
      total: 0,
      group: "Изоляция",
      metricBasis: `ПОС: ${barsTotal} шин × ${posPerBusKg.toFixed(3)} кг/шину. Для 4P базовая норма 0,144 кг; для 5P добавлена одна шина PE.`,
    },
    {
      name: `Ц0000078237 · Плёнка ПЭТ-Э 250 мкм, развёртка ${Math.round(petBlankWidthM * 1000)} мм`,
      unit: "кг",
      qty: calculatePetMassKg(geometry) * insulationShare,
      price: 311,
      total: 0,
      group: "Изоляция",
      metricBasis: `ПЭТ: ${insulatedBarsTotal} изолируемых шин A/B/C/N × развёртка ${Math.round(petBlankWidthM * 1000)} мм × длина ${Math.round(petInsulatedM * 1000)} мм × 250 мкм. Шина PE в 5P не изолируется.`,
    },
    {
      name: `УТ000000404 · Скотч электротехнический 25×66 м, периметр шины ${Math.round(barPerimeterM * 1000)} мм${tapeFactor === 2.5 ? " · добавлено 150%, итог ×2,5" : ""}`,
      unit: "м",
      qty: geometry.tapeLengthM * insulationShare,
      price: 186 / 66,
      total: 0,
      group: "Изоляция",
      metricBasis: `Скотч: ${insulatedBarsTotal} изолируемых шин A/B/C/N × 2 конца × 14 витков × периметр ${Math.round(barPerimeterM * 1000)} мм × коэффициент ${tapeFactor}; PE без ПЭТ и скотча`,
    },
    ...(isCd
      ? [{ name: "Ц0000069207 · Лист алюминий АМг3М 3,0×1200×3000 — крышки CD .007 и .010 · ширина крышки 140 мм", unit: "кг", qty: 1.4 * (developedMm / 870), price: 592.9, total: 0, group: "Корпус", metricBasis: "Геометрическое масштабирование только по длине: 1,40 кг при 870 мм; ширина крышки фиксирована 140 мм" }]
      : isCp
      ? [{ name: "Ц0000069207 · Лист алюминий АМг3М 3,0×1200×3000 — 2 крышки CP · ширина крышки 140 мм", unit: "кг", qty: 1.47 * (developedMm / 900), price: 592.9, total: 0, group: "Корпус", metricBasis: "Геометрическое масштабирование только по длине: 1,47 кг при 900 мм; ширина крышки фиксирована 140 мм" }]
      : [{ name: "Ц0000074662 · Профиль АП 4178 — крышки", unit: "м", qty: 2 * developedM, price: 759.55, total: 0, group: "Корпус", stockLengthM: 2 * developedM, massKg: 2 * developedM * 1.381, metricBasis: "АП 4178: единая позиция без разделения по окраске; 1,381 кг/м по формуле цены в ресурсной спецификации" }]),
    ...(sidewallResource.kind === "sheet"
      ? [
          {
            name: `${sidewallResource.code} · ${sidewallResource.designation} — 2 боковины`,
            unit: "кг",
            qty: sidewallMassKg,
            price: sidewallResource.pricePerKg,
            total: 0,
            group: "Корпус",
            massKg: sidewallMassKg,
            metricBasis: `${sidewallResource.basis}; 2 боковины × ${developedMm} мм × ${sidewallResource.heightMm} мм × ${sidewallResource.thicknessMm},0 мм × ${sidewallResource.densityKgM3} кг/м³; без коэффициента отходов`,
          },
        ]
      : [
          {
            name: `${sidewallResource.code} · ${sidewallResource.designation} — 2 боковины; расчёт потребности в пог.м и эквиваленте заготовок 3000 мм`,
            unit: "м",
            qty: 2 * developedM,
            price: sidewallResource.pricePerM,
            total: 0,
            group: "Корпус",
            stockLengthM: 2 * developedM,
            massKg: 2 * developedM * sidewallResource.kgPerM,
            metricBasis: `${sidewallResource.basis}; ${sidewallResource.kgPerM.toFixed(3)} кг/м`,
          },
        ]),
    ...(peEar ? [{
      name: `${peEar.designation} · Ухо PE, L=${peEar.lengthMm} мм · изготовление из листа АМг3 2,0×1200×3000 мм · 4 шт.`,
      unit: "кг",
      qty: peEar.totalKg,
      price: 592.9,
      total: 0,
      group: "Изготавливаемые детали",
      massKg: peEar.totalKg,
      metricBasis: peEar.basis,
    }] : []),
    {
      name: "Ц0000078870 · Вставка крышки секции 28×15×133,4 (KD-LZJ-K-R2) · строка 87727",
      unit: "шт",
      qty: 4,
      price: 129.06,
      total: 0,
      group: "Постоянные",
    },
    {
      name: "Ц0000056270 · Болт с фланцем М6×12 DIN 6921",
      unit: "шт",
      qty: isFe ? 8 : 16,
      price: 2.1,
      total: 0,
      group: "Постоянные",
    },
    {
      name: "УТ000003151 · Болт с фланцем М6×16 DIN 6921",
      unit: "шт",
      qty: isFe ? 24 : 16,
      price: 2.2,
      total: 0,
      group: "Постоянные",
    },
    {
      name: "УТ000005297 · Гайка М6 DIN 934, оцинкованная, кл. 8",
      unit: "шт",
      qty: 16,
      price: 0.5,
      total: 0,
      group: "Постоянные",
    },
    {
      name: "Ц0000039669 · Заклёпка 4,8×10 сталь/сталь",
      unit: "шт",
      qty: 48,
      price: 1.11,
      total: 0,
      group: "Постоянные",
    },
    {
      name: "00000002130 · Герметик серый · норма ресурсной спецификации",
      unit: "бал.",
      qty: 0.13,
      price: 417,
      total: 0,
      group: "Постоянные",
    },
    {
      name: "00000004273 · Стрейч-плёнка ручная",
      unit: "кг",
      qty: 0.024,
      price: 210,
      total: 0,
      group: "Постоянные",
    },
  ].map((i) => ({ ...i, total: i.qty * i.price }));
  const materials = items.reduce((s, i) => s + i.total, 0),
    labor = (materials * laborRate) / 100;
  const gas = (17.3 / 1.8) * 11.5,
    electricity = (8.7 / 1.8) * 11.28;
  const costBeforeWelding = materials + labor + gas + electricity;
  const welding = effectiveWelding ? costBeforeWelding * 0.12 : 0;
  const unitCost = costBeforeWelding + welding;
  return {
    code,
    rule,
    items,
    materials,
    labor,
    welding,
    gas,
    electricity,
    unitCost,
    totalCost: unitCost * element.quantity,
    busMass: effectiveBusMass,
    busLengthM: effectiveBusLengthM,
    massPer3m,
    equivalent3m: effectiveEquivalent3m,
    stockPieces3m: effectiveStockPieces3m,
    developedMm,
    petBlankWidthM,
    cfg,
    tapeFactor,
    peEar,
  };
}

export default function Home() {
  const [projectName, setProjectName] = useState("Расчёт шинопровода");
  const [controlProjectKey, setControlProjectKey] = useState("Расчёт шинопровода");
  const [controlDocumentKey, setControlDocumentKey] = useState("manual");
  const [controlDocumentKind, setControlDocumentKind] = useState<"production" | "preliminary" | "manual">("manual");
  const [elements, setElements] = useState<NetworkElement[]>([
    {
      id: 1,
      typeId: defaultTypeIdByCode.FE,
      current: 2000,
      poles: 4,
      lengths: [3000, 0, 0],
      dimensionSources: ["standard", "standard", "standard"],
      dimensionOriginals: [3000, 0, 0],
      quantity: 1,
      weldedVertical: false,
    },
  ]);
  const [jointDemandRows, setJointDemandRows] = useState<JointDemandRow[]>([]);
  const [expandedJointIds, setExpandedJointIds] = useState<string[]>([]);
  const [nominalScenarioStep, setNominalScenarioStep] = useState<0 | 1 | 2>(0);
  const [nominalBaseCurrents, setNominalBaseCurrents] = useState<Record<number, number>>({ 1: 2000 });
  const [jointNominalBaseCurrents, setJointNominalBaseCurrents] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<ProjectOrder[]>([]);
  const [preliminarySpecifications, setPreliminarySpecifications] = useState<PreliminarySpecification[]>([]);
  const [compositionMode, setCompositionMode] = useState<"production" | "preliminary">("production");
  const [transferReport, setTransferReport] =
    useState<OrderTransferReport | null>(null);
  const [expandedElements, setExpandedElements] = useState<number[]>([]);
  const [focusedOrderNumber, setFocusedOrderNumber] = useState("");
  const [laborRate, setLaborRate] = useState(20);
  const [technologyLossPct, setTechnologyLossPct] = useState(1);
  const [vatPct, setVatPct] = useState(20);
  const [markupPct, setMarkupPct] = useState(0);
  const [elementSearch, setElementSearch] = useState("");
  const [active, setActive] = useState<
    | "objects"
    | "composition"
    | "orders"
    | "departments"
    | "calc"
    | "materials"
    | "procurement"
    | "illiquid"
    | "analytics"
    | "rules"
    | "projects"
    | "commercial"
    | "reservations"
    | "models"
    | "breakers"
    | "shifts"
  >("objects");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [themeReady, setThemeReady] = useState(false);
  const [history, setHistory] = useState<Saved[]>([]);
  const [objects, setObjects] = useState<WorkObject[]>(initialObjects);
  const [productionQueueReady, setProductionQueueReady] = useState(false);
  const [selectedProductionProjects, setSelectedProductionProjects] = useState<string[]>([]);
  const [selectedCalculatorSpecifications, setSelectedCalculatorSpecifications] = useState<string[]>([]);
  const [selectedResourceElementIds, setSelectedResourceElementIds] = useState<number[]>([]);
  const [selectedResourceJointIds, setSelectedResourceJointIds] = useState<string[]>([]);
  const [checklistDrafts, setChecklistDrafts] = useState<
    Record<number, string>
  >({});
  const [status, setStatus] = useState("");
  const [stock, setStock] = useState<StockItem[]>(initialStock);
  const [stockSource, setStockSource] = useState(
    "Остатки ТМЦ (34).xlsm · лист «Отчет Склад-2»",
  );
  const filteredElementCatalog = useMemo(
    () => searchCatalog(elementCatalog, elementSearch),
    [elementSearch],
  );
  const controlPilotDocuments = useMemo<ControlPilotDocument[]>(() => [
    ...orders.map((order) => ({ key: `production|${order.projectName || "Без проекта"}|${order.number}`, projectKey: order.projectName || "Без проекта", number: order.number, date: order.date, kind: "production" as const, filename: order.filename })),
    ...preliminarySpecifications.map((specification) => ({ key: `preliminary|${specification.projectName}|${specification.number}`, projectKey: specification.projectName || "Без проекта", number: specification.number, date: specification.date, kind: "preliminary" as const, filename: specification.filename })),
  ], [orders, preliminarySpecifications]);
  const calculatorSpecificationOptions = useMemo(() => [
    ...orders.map((order) => ({ key: `production|${order.projectName ?? "Без проекта"}|${order.number}`, label: `Заказ № ${order.number} · ${order.projectName || "Без проекта"}`, kind: "production" as const, order })),
    ...preliminarySpecifications.map((specification) => ({ key: `preliminary|${specification.projectName}|${specification.number}`, label: `Предварительная спецификация № ${specification.number} · ${specification.projectName || "Без проекта"}`, kind: "preliminary" as const, specification })),
  ], [orders, preliminarySpecifications]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/workspace?category=production_order").then((response) => response.ok ? response.json() : null),
      fetch("/api/workspace?category=stock_snapshot").then((response) => response.ok ? response.json() : null),
      fetch("/api/workspace?category=preliminary_specification").then((response) => response.ok ? response.json() : null),
      fetch("/api/workspace?category=production_queue&project=GLOBAL").then((response) => response.ok ? response.json() : null),
    ]).then(([orderData, stockData, preliminaryData, queueData]) => {
      if (cancelled) return;
      const unique = new Map<string, ProjectOrder>();
      for (const record of orderData?.records ?? []) {
        const raw = record.payload?.order;
        if (!raw || typeof raw !== "object") continue;
        const order = { ...(raw as ProjectOrder), uploadedAt: record.createdAt ?? record.payload?.savedAt, recordId: record.id, documentRecordId: Number(record.payload?.documentRecordId) || undefined };
        const key = `${order.projectName ?? record.projectKey}|${order.number}`;
        if (!unique.has(key)) unique.set(key, order);
      }
      setOrders([...unique.values()]);
      const latestStock = stockData?.records?.[0];
      if (latestStock && Array.isArray(latestStock.payload?.items)) {
        setStock(latestStock.payload.items as StockItem[]);
        setStockSource(String(latestStock.payload.source ?? latestStock.payload.fileName ?? "Сохранённый снимок остатков"));
      }
      const preliminary = new Map<string, PreliminarySpecification>();
      for (const record of preliminaryData?.records ?? []) {
        const raw = record.payload?.specification;
        if (!raw || typeof raw !== "object") continue;
        const specification = { ...(raw as PreliminarySpecification), recordId: record.id, documentRecordId: Number(record.payload?.documentRecordId) || undefined };
        const key = `${specification.projectName}|${specification.number}`;
        if (!preliminary.has(key)) preliminary.set(key, specification);
      }
      setPreliminarySpecifications([...preliminary.values()]);
      const savedQueue = queueData?.records?.[0]?.payload?.objects;
      if (Array.isArray(savedQueue)) setObjects(savedQueue as WorkObject[]);
      setProductionQueueReady(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!productionQueueReady) return;
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      void fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "production_queue", projectKey: "GLOBAL", entityKey: savedAt, payload: { objects, savedAt } }),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [objects, productionQueueReady]);

  async function importProductionOrders(files: File[], forcedProjectName?: string) {
    const parsed = await Promise.all(files.map((file) => parseProductionOrder(file, forcedProjectName)));
    const saved: ProjectOrder[] = [];
    for (let index = 0; index < parsed.length; index++) {
      const order = parsed[index];
      const file = files[index];
      const projectKey = order.projectName?.trim() || forcedProjectName?.trim() || "Без проекта";
      const form = new FormData();
      form.set("file", file);
      form.set("projectKey", projectKey);
      form.set("docType", `Заказ на производство №${order.number}`);
      form.set("category", "production_order_file");
      form.set("snapshot", JSON.stringify({ capturedAt: new Date().toISOString(), orderNumber: order.number, orderDate: order.date }));
      const fileResponse = await fetch("/api/documents", { method: "POST", body: form });
      const fileData = await fileResponse.json();
      if (!fileResponse.ok || !fileData.record) throw new Error(fileData.error || `Не удалось сохранить файл заказа № ${order.number}`);
      const documentRecordId = Number(fileData.record.id);
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "production_order", projectKey, entityKey: order.number, payload: { order: { ...order, projectName: projectKey }, documentRecordId, fileName: file.name, storageKey: fileData.record.payload?.storageKey } }),
      });
      const data = await response.json();
      if (!response.ok || !data.record) throw new Error(data.error || `Не удалось сохранить состав заказа № ${order.number}`);
      saved.push({ ...order, projectName: projectKey, uploadedAt: new Date().toISOString(), recordId: Number(data.record.id), documentRecordId } as ProjectOrder);
    }
    setOrders((current) => {
      const next = [...current];
      for (const order of saved) {
        const existing = next.findIndex((row) => row.number === order.number && row.projectName === order.projectName);
        if (existing >= 0) next[existing] = order;
        else next.push(order);
      }
      return next;
    });
    return saved;
  }

  async function importPreliminarySpecifications(files: File[]) {
    const parsed = await Promise.all(files.map(parsePreliminarySpecification));
    const saved: PreliminarySpecification[] = [];
    for (let index = 0; index < parsed.length; index++) {
      const specification = parsed[index];
      const file = files[index];
      const projectKey = specification.projectName || "Без проекта";
      const form = new FormData();
      form.set("file", file);
      form.set("projectKey", projectKey);
      form.set("docType", `Предварительная спецификация №${specification.number}`);
      form.set("category", "preliminary_specification_file");
      form.set("snapshot", JSON.stringify({ capturedAt: new Date().toISOString(), specificationNumber: specification.number, markupPercent: specification.markupPercent, vatPercent: specification.vatPercent }));
      const fileResponse = await fetch("/api/documents", { method: "POST", body: form });
      const fileData = await fileResponse.json();
      if (!fileResponse.ok || !fileData.record) throw new Error(fileData.error || `Не удалось сохранить спецификацию № ${specification.number}`);
      const documentRecordId = Number(fileData.record.id);
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "preliminary_specification", projectKey, entityKey: specification.number, payload: { specification, documentRecordId, fileName: file.name, storageKey: fileData.record.payload?.storageKey } }),
      });
      const data = await response.json();
      if (!response.ok || !data.record) throw new Error(data.error || `Не удалось сохранить расчёт № ${specification.number}`);
      saved.push({ ...specification, recordId: Number(data.record.id), documentRecordId });
    }
    setPreliminarySpecifications((current) => {
      const next = [...current];
      for (const specification of saved) {
        const existing = next.findIndex((item) => item.number === specification.number && item.projectName === specification.projectName);
        if (existing >= 0) next[existing] = specification;
        else next.unshift(specification);
      }
      return next;
    });
    return saved;
  }

  async function savePreliminarySpecification(specification: PreliminarySpecification) {
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "preliminary_specification", projectKey: specification.projectName || "Без проекта", entityKey: specification.number, payload: { specification, documentRecordId: specification.documentRecordId, fileName: specification.filename } }),
    });
    const data = await response.json();
    if (!response.ok || !data.record) throw new Error(data.error || "Не удалось сохранить коммерческие параметры.");
    const saved = { ...specification, recordId: Number(data.record.id) };
    setPreliminarySpecifications((current) => current.map((item) => item.id === specification.id ? saved : item));
    return saved;
  }

  async function deletePreliminarySpecification(specification: PreliminarySpecification) {
    const projectKey = specification.projectName || "Без проекта";
    const response = await fetch(`/api/workspace?category=preliminary_specification&project=${encodeURIComponent(projectKey)}&entity=${encodeURIComponent(specification.number)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Не удалось удалить сохранённую предварительную спецификацию.");
    await fetch(`/api/documents?category=preliminary_specification_file&project=${encodeURIComponent(projectKey)}&docType=${encodeURIComponent(`Предварительная спецификация №${specification.number}`)}`, { method: "DELETE" });
    setPreliminarySpecifications((current) => current.filter((item) => !(item.number === specification.number && item.projectName === specification.projectName)));
  }

  async function convertPreliminarySpecification(specification: PreliminarySpecification) {
    const order = preliminaryToOrder(specification);
    const projectKey = order.projectName || "Без проекта";
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "production_order", projectKey, entityKey: order.number, payload: { order, documentRecordId: specification.documentRecordId, fileName: specification.filename, source: "Предварительная спецификация" } }),
    });
    const data = await response.json();
    if (!response.ok || !data.record) throw new Error(data.error || "Не удалось создать черновик заказа на производство.");
    const savedOrder = { ...order, recordId: Number(data.record.id) };
    setOrders((current) => {
      const next = current.filter((item) => !(item.number === savedOrder.number && item.projectName === savedOrder.projectName));
      return [...next, savedOrder];
    });
    setCompositionMode("production");
  }

  async function deleteProductionOrder(order: ProjectOrder) {
    const projectKey = order.projectName ?? "";
    const response = await fetch(`/api/workspace?category=production_order&project=${encodeURIComponent(projectKey)}&entity=${encodeURIComponent(order.number)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Не удалось удалить сохранённый состав заказа.");
    await fetch(`/api/documents?category=production_order_file&project=${encodeURIComponent(projectKey)}&docType=${encodeURIComponent(`Заказ на производство №${order.number}`)}`, { method: "DELETE" });
    setOrders((current) => current.filter((row) => !(row.number === order.number && row.projectName === order.projectName)));
  }

  async function persistStock(file: File, items: StockItem[], source: string) {
    const form = new FormData();
    form.set("file", file);
    form.set("projectKey", "__STOCK__");
    form.set("docType", "Остатки склада");
    form.set("category", "stock_file");
    form.set("snapshot", JSON.stringify({ capturedAt: new Date().toISOString(), rows: items.length }));
    const fileResponse = await fetch("/api/documents", { method: "POST", body: form });
    const fileData = await fileResponse.json();
    if (!fileResponse.ok || !fileData.record) throw new Error(fileData.error || "Не удалось сохранить файл остатков.");
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "stock_snapshot", projectKey: "__STOCK__", entityKey: file.name, payload: { fileName: file.name, source, items, documentRecordId: fileData.record.id } }),
    });
    if (!response.ok) throw new Error("Не удалось сохранить распознанные остатки.");
  }
  useEffect(() => {
    const saved = window.localStorage.getItem("klm-color-theme");
    queueMicrotask(() => {
      if (saved === "light" || saved === "dark") setTheme(saved);
      setThemeReady(true);
    });
  }, []);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("klm-color-theme", theme);
  }, [theme, themeReady]);
  function updateElement(id: number, patch: Partial<NetworkElement>) {
    setElements((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
  function changeType(row: NetworkElement, typeId: number) {
    const code = resolveFormulaCode(elementCatalogById.get(typeId));
    const defaults = code ? getApprovedDimensions(code, row.current, row.poles) : row.lengths;
    const lengths = [...defaults, 0, 0].slice(0, 3);
    updateElement(row.id, {
      typeId,
      lengths,
      dimensionSources: lengths.map(() => "standard" as DimensionSource),
      dimensionOriginals: [...lengths],
      weldedVertical: code === "CP",
    });
  }
  function changeCurrent(row: NetworkElement, current: number) {
    const code = resolveFormulaCode(elementCatalogById.get(row.typeId));
    const defaults = code ? getApprovedDimensions(code, current, row.poles) : row.lengths;
    const lengths = [...defaults, 0, 0].slice(0, 3);
    updateElement(row.id, {
      current,
      lengths,
      dimensionSources: lengths.map(() => "standard" as DimensionSource),
      dimensionOriginals: [...lengths],
      weldedVertical: code === "CP" || row.weldedVertical,
    });
    setNominalBaseCurrents((base) => ({ ...base, [row.id]: current }));
    setNominalScenarioStep(0);
  }

  function scenarioCurrent(baseCurrent: number, targetStep: 0 | 1 | 2) {
    const baseIndex = currents.indexOf(baseCurrent);
    if (baseIndex < 0) return baseCurrent;
    return currents[Math.max(0, baseIndex - targetStep)];
  }

  function applyNominalScenario(targetStep: 0 | 1 | 2) {
    setElements((rows) => rows.map((row) => {
      const current = scenarioCurrent(nominalBaseCurrents[row.id] ?? row.current, targetStep);
      const code = resolveFormulaCode(elementCatalogById.get(row.typeId));
      const defaults = code ? getApprovedDimensions(code, current, row.poles) : row.lengths;
      const lengths = [...defaults, 0, 0].slice(0, 3);
      return {
        ...row,
        current,
        lengths,
        dimensionSources: lengths.map(() => "standard" as DimensionSource),
        dimensionOriginals: [...lengths],
      };
    }));
    setJointDemandRows((rows) => rows.map((row) => ({ ...row, currentA: scenarioCurrent(jointNominalBaseCurrents[row.id] ?? row.currentA, targetStep) })));
    setNominalScenarioStep(targetStep);
    setExpandedElements([]);
    setStatus(targetStep === 0 ? "Восстановлен номинальный ток заказа." : `Выполнен перерасчёт всех материалов на ${targetStep === 1 ? "один" : "два"} номинала ниже.`);
  }
  function changePoles(row: NetworkElement, poles: PoleCount) {
    const code = resolveFormulaCode(elementCatalogById.get(row.typeId));
    const defaults = code ? getApprovedDimensions(code, row.current, poles) : row.lengths;
    const lengths = [...defaults, 0, 0].slice(0, 3);
    updateElement(row.id, {
      poles,
      lengths,
      dimensionSources: lengths.map(() => "standard" as DimensionSource),
      dimensionOriginals: [...lengths],
    });
  }
  function addElement() {
    setElements((rows) => [
      ...rows,
      {
        id: Math.max(0, ...rows.map((r) => r.id)) + 1,
        typeId: defaultTypeIdByCode.FE,
        current: rows[0]?.current ?? 2000,
        poles: rows[0]?.poles ?? 4,
        lengths: [3000, 0, 0],
        dimensionSources: ["standard", "standard", "standard"],
        dimensionOriginals: [3000, 0, 0],
        quantity: 1,
          weldedVertical: false,
      },
    ]);
  }
  function removeElement(id: number) {
    setElements((rows) =>
      rows.length > 1 ? rows.filter((r) => r.id !== id) : rows,
    );
    setSelectedResourceElementIds((ids) => ids.filter((value) => value !== id));
  }
  function toggleElement(id: number) {
    setExpandedElements((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
  function openControlOrder(orderNumber: string) {
    setFocusedOrderNumber(orderNumber);
    setActive("orders");
  }
  function consolidateConvertedOrders(convertedOrders: ReturnType<typeof orderToElements>[]) {
    const elementsByKey = new Map<string, NetworkElement>();
    const jointRowsByKey = new Map<string, JointDemandRow>();
    const unsupportedRows = convertedOrders.flatMap((converted) => converted.unsupportedRows);
    const defaultedRows = convertedOrders.flatMap((converted) => converted.defaultedRows);
    for (const converted of convertedOrders) {
      for (const element of converted.elements) {
        const code = resolveFormulaCode(elementCatalogById.get(element.typeId));
        const article = code ? articleFor(element.current, code, element.poles) : "";
        const key = `${article || element.typeId}|${element.poles}|${element.lengths.join("/")}`.toUpperCase();
        const existing = elementsByKey.get(key);
        if (existing) existing.quantity += element.quantity;
        else elementsByKey.set(key, { ...element, lengths: [...element.lengths], dimensionSources: [...element.dimensionSources], dimensionOriginals: [...element.dimensionOriginals] });
      }
      for (const joint of converted.jointRows ?? []) {
        const key = `${joint.article}|${joint.currentA}|${joint.poles}`.toUpperCase();
        const existing = jointRowsByKey.get(key);
        if (existing) existing.quantity += joint.quantity;
        else jointRowsByKey.set(key, { ...joint });
      }
    }
    const elements = [...elementsByKey.values()].map((row, index) => ({ ...row, id: index + 1 }));
    const jointRows = [...jointRowsByKey.values()].map((row, index) => ({ ...row, id: `joint-${index + 1}-${row.currentA}` }));
    return { elements, jointRows, unsupportedRows, defaultedRows };
  }

  function installConvertedCalculation(converted: ReturnType<typeof consolidateConvertedOrders>, title: string, orderNumber: string) {
    setElements(converted.elements);
    setJointDemandRows(converted.jointRows);
    setExpandedElements([]);
    setExpandedJointIds([]);
    setSelectedResourceElementIds([]);
    setSelectedResourceJointIds([]);
    setNominalScenarioStep(0);
    setNominalBaseCurrents(Object.fromEntries(converted.elements.map((row) => [row.id, row.current])));
    setJointNominalBaseCurrents(Object.fromEntries(converted.jointRows.map((row) => [row.id, row.currentA])));
    setProjectName(title);
    setControlProjectKey(title);
    setControlDocumentKey(`combined|${orderNumber}`);
    setControlDocumentKind("manual");
    setTransferReport({ orderNumber, supportedRows: converted.elements.length + converted.jointRows.length, unsupportedRows: converted.unsupportedRows, defaultedRows: converted.defaultedRows });
    setStatus(`В калькулятор передано ${converted.elements.length} уникальных элементов и ${converted.jointRows.length} типов стыков G. Повторения по линиям объединены.`);
    setActive("calc");
  }

  function calculateSelectedSpecifications() {
    const selected = calculatorSpecificationOptions.filter((option) => selectedCalculatorSpecifications.includes(option.key));
    if (!selected.length) {
      setStatus("Выберите хотя бы одну спецификацию.");
      return;
    }
    setSelectedProductionProjects(selected.flatMap((option) => option.kind === "production" ? [`${option.order.projectName || "Без проекта"}|${option.order.number}`] : []));
    const converted = consolidateConvertedOrders(selected.map((option) => orderToElements(option.kind === "production" ? option.order : preliminaryToOrder(option.specification))));
    installConvertedCalculation(converted, selected.length === 1 ? selected[0].label : `Общий расчёт · ${selected.length} спецификации`, selected.map((option) => option.kind === "production" ? option.order.number : option.specification.number).join(" + "));
  }

  function calculateOrder(order: ProjectOrder) {
    const converted = consolidateConvertedOrders([orderToElements(order)]);
    setElements(converted.elements);
    setJointDemandRows(converted.jointRows);
    setExpandedElements([]);
    setExpandedJointIds([]);
    setSelectedResourceElementIds([]);
    setSelectedResourceJointIds([]);
    setNominalScenarioStep(0);
    setNominalBaseCurrents(Object.fromEntries(converted.elements.map((row) => [row.id, row.current])));
    setJointNominalBaseCurrents(Object.fromEntries(converted.jointRows.map((row) => [row.id, row.currentA])));
    setProjectName(`Заказ на производство № ${order.number} от ${order.date}`);
    setControlProjectKey(order.projectName?.trim() || `Заказ № ${order.number}`);
    setControlDocumentKey(`production|${order.number}`);
    setControlDocumentKind("production");
    setSelectedProductionProjects([`${order.projectName || "Без проекта"}|${order.number}`]);
    setTransferReport({
      orderNumber: order.number,
      supportedRows: converted.elements.length + converted.jointRows.length,
      unsupportedRows: converted.unsupportedRows,
      defaultedRows: converted.defaultedRows,
    });
    setStatus(
      converted.elements.length || converted.jointRows.length
        ? `Состав калькулятора заменён заказом № ${order.number}: уникальных секций/элементов ${converted.elements.length}, типов стыков G ${converted.jointRows.length}. Повторения по линиям объединены.`
        : `Состав калькулятора очищен: строки заказа № ${order.number} не удалось сопоставить со справочником.`,
    );
    setActive("calc");
  }

  function estimatePreliminarySpecification(specification: PreliminarySpecification): CommercialEstimate {
    const estimatedRows = specification.rows.map((sourceRow) => {
      const articleParts = sourceRow.article.toUpperCase().split("-");
      if (articleParts.includes("CU")) {
        return { rowId: sourceRow.id, unitCost: 0, totalCost: 0, status: "excluded" as const, reason: "Медное исполнение: состав шин и цена меди в расчётной базе не подтверждены" };
      }
      const singleSpecification = { ...specification, rows: [sourceRow] };
      const converted = orderToElements(preliminaryToOrder(singleSpecification));
      if (!converted.elements.length) {
        return {
          rowId: sourceRow.id,
          unitCost: 0,
          totalCost: 0,
          status: "excluded" as const,
          reason: converted.unsupportedRows[0]?.reason ?? "Для позиции отсутствует расчётное правило",
        };
      }
      const totalCost = converted.elements.reduce((sum, element) => {
        const catalog = elementCatalogById.get(element.typeId);
        if (!catalog) return sum;
        const calculated = calculateElement(element, laborRate, catalog);
        return sum + (calculated?.totalCost ?? 0) * element.quantity;
      }, 0);
      if (!(totalCost > 0)) {
        return { rowId: sourceRow.id, unitCost: 0, totalCost: 0, status: "excluded" as const, reason: "Не рассчитаны размеры или стоимость ресурсов" };
      }
      const firstElement = converted.elements[0];
      const firstCatalog = firstElement ? elementCatalogById.get(firstElement.typeId) : undefined;
      const firstCode = resolveFormulaCode(firstCatalog);
      const ruleReason = firstCode && firstCode !== "ATT" && firstCode !== "CML"
        ? preliminaryDimensionRuleText(firstCode, sourceRow.lengthClass, sourceRow.commercialLengthMm)
        : sourceRow.lengthClass ? `${sourceRow.lengthClass}: специализированное правило` : "специализированное правило";
      return {
        rowId: sourceRow.id,
        unitCost: totalCost / sourceRow.quantity,
        totalCost,
        status: "calculated" as const,
        reason: ruleReason,
      };
    });
    const baseCost = estimatedRows.reduce((sum, row) => sum + row.totalCost, 0);
    const totals = commercialTotals(baseCost, specification.markupPercent, specification.vatPercent);
    return {
      rows: estimatedRows,
      ...totals,
      calculatedRows: estimatedRows.filter((row) => row.status === "calculated").length,
      excludedRows: estimatedRows.filter((row) => row.status === "excluded").length,
    };
  }

  function buildPreliminaryScenario(specification: PreliminarySpecification, steps: 0 | 1 | 2): PreliminaryScenarioBuild {
    const shifted = shiftPreliminaryNominal(specification, steps);
    const supportedIds = new Set(shifted.shifts.filter((row) => row.supported).map((row) => row.rowId));
    const scenarioSpecification = steps === 0
      ? shifted.specification
      : { ...shifted.specification, rows: shifted.specification.rows.filter((row) => supportedIds.has(row.id)) };
    const estimate = estimatePreliminarySpecification(scenarioSpecification);
    const converted = orderToElements(preliminaryToOrder(scenarioSpecification));
    const itemMap = new Map<string, Item>();
    for (const joint of converted.jointRows ?? []) {
      for (const line of calculateJointMaterialLines({ ...joint, source: "preliminary" })) {
        const approved = findApprovedCode({ name: line.name, designation: line.designation, contour: "Стык G" });
        const name = `${approved?.code || line.code ? `${approved?.code || line.code} · ` : ""}${line.designation ? `${line.designation} · ` : ""}${line.name}`;
        const key = `${line.group}|${name}|${line.unit}|0`;
        const old = itemMap.get(key);
        itemMap.set(key, { name, unit: line.unit, qty: (old?.qty ?? 0) + line.qty, price: 0, total: 0, group: line.group, metricBasis: line.basis });
      }
    }
    for (const element of converted.elements) {
      const catalog = elementCatalogById.get(element.typeId);
      if (!catalog) continue;
      const calculated = calculateElement(element, laborRate, catalog);
      for (const item of calculated?.items ?? []) {
        const key = `${item.group}|${item.name}|${item.unit}|${item.price}`;
        const previous = itemMap.get(key);
        const multiplier = element.quantity;
        itemMap.set(key, {
          ...item,
          qty: (previous?.qty ?? 0) + item.qty * multiplier,
          total: (previous?.total ?? 0) + item.total * multiplier,
          stockLengthM: item.stockLengthM === undefined ? undefined : (previous?.stockLengthM ?? 0) + item.stockLengthM * multiplier,
          massKg: item.massKg === undefined ? undefined : (previous?.massKg ?? 0) + item.massKg * multiplier,
        });
      }
    }
    return {
      steps,
      items: [...itemMap.values()],
      estimate,
      shifts: shifted.shifts,
      blockedRows: steps === 0 ? converted.unsupportedRows.length : shifted.shifts.filter((row) => !row.supported).length + converted.unsupportedRows.length,
    };
  }

  const jointCalc = useMemo(() => {
    const lines = jointDemandRows.flatMap((row) => calculateJointMaterialLines(row));
    const grouped = new Map<string, typeof lines[number]>();
    for (const line of lines) {
      const key = `${line.code}|${line.designation}|${line.name}|${line.unit}`;
      const old = grouped.get(key);
      grouped.set(key, { ...line, qty: (old?.qty ?? 0) + line.qty });
    }
    return { rows: jointDemandRows, lines: [...grouped.values()] };
  }, [jointDemandRows]);

  const calc = useMemo(() => {
    const rows = elements.map((e) => {
      const catalog = elementCatalogById.get(e.typeId) ?? {
        id: e.typeId,
        sourceNumber: 0,
        code: "—",
        name: "Тип не найден",
      };
      const code = resolveFormulaCode(catalog);
      return {
        ...e,
        code,
        catalog,
        article: code ? articleFor(e.current, code, e.poles) : "Артикул не задан",
        info: code
          ? sectionInfo[code]
          : { name: catalog.name, dims: 3, step: 50, defaults: {} },
        rule: resolveSectionRule(catalog),
        calc: calculateElement(e, laborRate, catalog),
      };
    });
    const itemMap = new Map<string, Item>();
    rows.forEach((row) =>
      row.calc?.items.forEach((item) => {
        const key = `${item.group}|${item.name}|${item.unit}|${item.price}`;
        const old = itemMap.get(key);
        const qty = item.qty * row.quantity;
        itemMap.set(key, {
          ...item,
          qty: (old?.qty ?? 0) + qty,
          stockLengthM:
            item.stockLengthM === undefined
              ? undefined
              : (old?.stockLengthM ?? 0) + item.stockLengthM * row.quantity,
          massKg:
            item.massKg === undefined
              ? undefined
              : (old?.massKg ?? 0) + item.massKg * row.quantity,
          total: (old?.total ?? 0) + item.total * row.quantity,
        });
      }),
    );
    const busMap = new Map<string, BusStockSummary>();
    rows.forEach((row) => {
      if (!row.calc || row.code === "ATT" || row.code === "CML") return;
      const key = `${row.calc.cfg.thickness}×${row.calc.cfg.height}`;
      const old = busMap.get(key);
      const lengthM = row.calc.busLengthM * row.quantity;
      const massKg = row.calc.busMass * row.quantity;
      busMap.set(key, {
        key,
        section: `${row.calc.cfg.thickness}×${row.calc.cfg.height} мм`,
        lengthM: (old?.lengthM ?? 0) + lengthM,
        massKg: (old?.massKg ?? 0) + massKg,
        equivalent3m: 0,
        stockPieces3m: 0,
      });
    });
    const busStock = [...busMap.values()].map((row) => ({
      ...row,
      equivalent3m: row.lengthM / STOCK_BUS_LENGTH_M,
      stockPieces3m: Math.ceil(row.lengthM / STOCK_BUS_LENGTH_M),
    }));
    const materials = rows.reduce(
        (s, r) => s + (r.calc?.materials ?? 0) * r.quantity,
        0,
      ),
      labor = rows.reduce((s, r) => s + (r.calc?.labor ?? 0) * r.quantity, 0),
      welding = rows.reduce(
        (s, r) => s + (r.calc?.welding ?? 0) * r.quantity,
        0,
      ),
      gas = rows.reduce((s, r) => s + (r.calc?.gas ?? 0) * r.quantity, 0),
      electricity = rows.reduce(
        (s, r) => s + (r.calc?.electricity ?? 0) * r.quantity,
        0,
      );
    return {
      rows,
      items: [...itemMap.values()],
      materials,
      labor,
      welding,
      gas,
      electricity,
      totalCost: materials + labor + welding + gas + electricity,
      totalQuantity: elements.reduce((s, e) => s + e.quantity, 0),
      calculatedQuantity: rows.reduce(
        (s, r) => s + (r.calc ? r.quantity : 0),
        0,
      ),
      unsupportedRows: rows.filter((r) => !r.calc).length,
      busMass: rows.reduce(
        (s, r) => s + (r.calc?.busMass ?? 0) * r.quantity,
        0,
      ),
      busStock,
      busStockPieces: busStock.reduce((sum, row) => sum + row.stockPieces3m, 0),
    };
  }, [elements, laborRate]);

  const commercialCalc = useMemo(() => {
    const technologyLoss = calc.materials * Math.max(0, technologyLossPct) / 100;
    const costWithTechnologyLoss = calc.totalCost + technologyLoss;
    const markup = costWithTechnologyLoss * Math.max(0, markupPct) / 100;
    const priceWithoutVat = costWithTechnologyLoss + markup;
    const vat = priceWithoutVat * Math.max(0, vatPct) / 100;
    return { technologyLoss, costWithTechnologyLoss, markup, priceWithoutVat, vat, finalPrice: priceWithoutVat + vat };
  }, [calc.materials, calc.totalCost, technologyLossPct, markupPct, vatPct]);

  function exportElementResourceSpecification(elementIds: number[], jointIds: string[], scopeLabel: string) {
    const selectedRows = calc.rows.filter((row) => row.calc && elementIds.includes(row.id));
    const selectedJoints = jointCalc.rows.filter((row) => jointIds.includes(row.id) && calculateJointMaterialLines(row).length > 0);
    if (!selectedRows.length && !selectedJoints.length) {
      setStatus("Выберите хотя бы один рассчитанный элемент для выгрузки.");
      return;
    }

    type ExportResource = { group: string; name: string; unit: string; qty: number; lengthM: number; massKg: number; price: number | ""; total: number | ""; basis: string };
    const resources = new Map<string, ExportResource>();
    const detailRows: Record<string, string | number>[] = [];
    const addResource = (resource: ExportResource) => {
      const key = `${resource.group}|${resource.name}|${resource.unit}|${resource.price}`;
      const previous = resources.get(key);
      resources.set(key, previous ? {
        ...previous,
        qty: previous.qty + resource.qty,
        lengthM: previous.lengthM + resource.lengthM,
        massKg: previous.massKg + resource.massKg,
        total: typeof previous.total === "number" && typeof resource.total === "number" ? previous.total + resource.total : "",
      } : resource);
    };

    selectedRows.forEach((row) => {
      row.calc!.items.forEach((item) => {
        const qty = item.qty * row.quantity;
        const lengthM = (item.stockLengthM ?? (item.unit === "м" ? item.qty : 0)) * row.quantity;
        const massKg = (item.massKg ?? (item.unit === "кг" ? item.qty : 0)) * row.quantity;
        addResource({ group: item.group, name: item.name, unit: item.unit, qty, lengthM, massKg, price: item.price, total: item.total * row.quantity, basis: item.metricBasis ?? "" });
        detailRows.push({
          "Элемент": row.catalog.name,
          "Артикул": row.article,
          "Номинальный ток, А": row.current,
          "Проводность": `${row.poles}P`,
          "Количество элементов, шт.": row.quantity,
          "Группа": item.group,
          "Ресурс": item.name,
          "Потребность": qty,
          "Ед.": item.unit,
          "Стоимость": item.total * row.quantity,
          "Основание": item.metricBasis ?? "",
        });
      });
    });
    selectedJoints.forEach((joint) => {
      calculateJointMaterialLines(joint).forEach((line) => {
        const name = `${line.code ? `${line.code} · ` : ""}${line.designation ? `${line.designation} · ` : ""}${line.name}`;
        const lengthM = line.unit === "м" ? line.qty : 0;
        const massKg = line.unit === "кг" ? line.qty : 0;
        addResource({ group: line.group, name, unit: line.unit, qty: line.qty, lengthM, massKg, price: "", total: "", basis: line.basis });
        detailRows.push({
          "Элемент": "Стыковочный элемент G",
          "Артикул": joint.article,
          "Номинальный ток, А": joint.currentA,
          "Проводность": `${joint.poles}P`,
          "Количество элементов, шт.": joint.quantity,
          "Группа": line.group,
          "Ресурс": name,
          "Потребность": line.qty,
          "Ед.": line.unit,
          "Стоимость": "",
          "Основание": line.basis,
        });
      });
    });

    const resourceRows = [...resources.values()].map((item, index) => {
      const stockMaterial = /профил|шина|крышк|боковин/i.test(`${item.group} ${item.name}`);
      return {
        "№": index + 1,
        "Группа": item.group,
        "Ресурс": item.name,
        "Потребность": item.qty,
        "Ед.": item.unit,
        "Длина, м": item.lengthM || "",
        "Масса, кг": item.massKg || "",
        "Заготовки по 3 м, шт.": stockMaterial && item.lengthM > 0 ? Math.ceil(item.lengthM / 3) : "",
        "Цена за единицу": item.price,
        "Сумма": item.total,
        "Основание": item.basis,
      };
    });
    const elementRows = [
      ...selectedRows.map((row) => ({
        "Тип элемента": row.catalog.name, "Код": row.code ?? "", "Номинальный ток, А": row.current,
        "Проводность": `${row.poles}P`, "Артикул": row.article, "L1, мм": row.lengths[0] ?? 0,
        "L2, мм": row.lengths[1] ?? 0, "L3, мм": row.lengths[2] ?? 0, "Количество, шт.": row.quantity,
      })),
      ...selectedJoints.map((row) => ({
        "Тип элемента": "Стыковочный элемент G", "Код": "G", "Номинальный ток, А": row.currentA,
        "Проводность": `${row.poles}P`, "Артикул": row.article, "L1, мм": 0, "L2, мм": 0, "L3, мм": 0,
        "Количество, шт.": row.quantity,
      })),
    ].map((row, index) => ({ "№": index + 1, ...row }));
    const workbook = XLSX.utils.book_new();
    const resourceSheet = XLSX.utils.json_to_sheet(resourceRows);
    resourceSheet["!cols"] = [{ wch: 6 }, { wch: 25 }, { wch: 62 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 70 }];
    const elementSheet = XLSX.utils.json_to_sheet(elementRows);
    elementSheet["!cols"] = [{ wch: 6 }, { wch: 38 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    detailSheet["!cols"] = [{ wch: 38 }, { wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 24 }, { wch: 25 }, { wch: 62 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(workbook, resourceSheet, "Ресурсная спецификация");
    XLSX.utils.book_append_sheet(workbook, elementSheet, "Выбранные элементы");
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Детализация по элементам");
    const safeProject = projectName.replace(/[^a-zа-я0-9]+/gi, "_");
    const safeScope = scopeLabel.replace(/[^a-zа-я0-9]+/gi, "_");
    XLSX.writeFile(workbook, `Ресурсная_спецификация_${safeProject}_${safeScope}.xlsx`);
    setStatus(`Выгружена ресурсная спецификация: ${elementRows.length} элемент(а), ${resourceRows.length} ресурсных позиций.`);
  }

  function exportProjectResourceSpecification() {
    exportElementResourceSpecification(calc.rows.filter((row) => row.calc).map((row) => row.id), jointCalc.rows.map((row) => row.id), "весь_проект");
  }

  function exportSelectedResourceSpecification() {
    exportElementResourceSpecification(selectedResourceElementIds, selectedResourceJointIds, "выбранные_элементы");
  }

  // Cost calculator follows the uploaded specification order exactly.
  // Sorting by shortage / stock status is intentionally limited to material planning.
  const calculationDisplayRows = useMemo(() => calc.rows, [calc.rows]);

  async function loadHistory() {
    try {
      const r = await fetch("/api/calculations");
      if (r.ok) setHistory((await r.json()).calculations ?? []);
    } catch {}
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/calculations", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setHistory(data.calculations ?? []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function saveCalculation() {
    if (!calc.calculatedQuantity) {
      setStatus("Введите L1, L2 или L3 хотя бы для одного элемента.");
      return;
    }
    setStatus("Сохраняю…");
    try {
      const r = await fetch("/api/calculations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName,
          sectionName: calc.rows
            .map((row) => `${row.article} × ${row.quantity}`)
            .join("; "),
          sectionLength: calc.rows.reduce(
            (s, row) => s + (row.calc?.developedMm ?? 0) * row.quantity,
            0,
          ),
          quantity: calc.calculatedQuantity,
          materialCost: calc.materials,
          laborCost: calc.labor + calc.welding,
          utilityCost: calc.gas + calc.electricity,
          unitCost: calc.totalCost / calc.calculatedQuantity,
          totalCost: calc.totalCost,
        }),
      });
      if (!r.ok) throw new Error();
      setStatus(
        calc.unsupportedRows
          ? "Расчёт сохранён; строки без размеров L1–L3 не включены."
          : "Расчёт сети сохранён",
      );
      await loadHistory();
    } catch {
      setStatus("Не удалось сохранить. Сам расчёт доступен.");
    }
  }
  useEffect(() => {
    if (!orders.length) return;
    setObjects((current) => {
      const next = [...current];
      for (const order of orders) {
        const keyName = order.projectName?.trim() || `Заказ № ${order.number}`;
        const existing = next.find((row) => row.orderNumber === order.number && row.autoFromOrder);
        if (existing) continue;
        const converted = orderToElements(order);
        const scheduleElements = converted.elements.map((element) => {
          const catalog = elementCatalogById.get(element.typeId);
          const code = resolveFormulaCode(catalog) || 'FE';
          return { code, current: element.current, lengthMm: Math.max(...element.lengths,0), quantity: element.quantity };
        });
        const norm = estimateProductionHours(scheduleElements);
        next.push({ id: Math.max(0,...next.map(r=>r.id))+1, name:keyName, customer:'Из заказа на производство', volume:converted.elements.reduce((sum,e)=>sum+e.quantity,0), priority:'Средний', departmentId:stageDepartment.ПО, owner:'', stage:'ПО', checklist:[], checklistDone:[], completed:false, due:'Приоритет не назначен', orderNumber:order.number, priorityOrder:null, productionHours:norm.hours, productionLoads:norm.departmentHours, scheduleWarnings:norm.unmappedOperations, loadedAt:(order as ProjectOrder & {uploadedAt?:string}).uploadedAt ?? new Date().toISOString(), autoFromOrder:true });
      }
      return next;
    });
  }, [orders]);

  const scheduledObjects = useMemo(() => {
    const prioritized = objects.filter(row=>row.priorityOrder!=null).sort((a,b)=>(a.priorityOrder??999)-(b.priorityOrder??999));
    const dated = calculateQueueDates(prioritized,new Date().toISOString());
    const byId = new Map(dated.map(row=>[row.id,row]));
    return [...objects].sort((a,b)=>{if(a.priorityOrder==null&&b.priorityOrder==null)return a.id-b.id;if(a.priorityOrder==null)return 1;if(b.priorityOrder==null)return -1;return a.priorityOrder-b.priorityOrder;}).map(row=>byId.get(row.id)??row);
  }, [objects]);

  const avg = history.length
    ? history.reduce((s, h) => s + h.unitCost, 0) / history.length
    : 0;

  function addObject() {
    setObjects((rows) => [
      ...rows,
      {
        id: Math.max(0, ...rows.map((r) => r.id)) + 1,
        name: "Новый объект",
        customer: "Не указан",
        volume: 0,
        priority: "Средний",
        departmentId: stageDepartment.ПО,
        owner: "",
        stage: "ПО",
        checklist: [],
        checklistDone: [],
        completed: false,
        due: "—",
        priorityOrder: null,
        productionHours: 0,
        productionLoads: {},
        scheduleWarnings: [],
        loadedAt: new Date().toISOString(),
        autoFromOrder: false,
      },
    ]);
  }
  function updateObject(id: number, patch: Partial<WorkObject>) {
    setObjects((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
  function moveObjectPriority(id: number, direction: -1 | 1) {
    setObjects((current) => {
      const prioritized = current.filter((row) => row.priorityOrder != null).sort((a,b)=>(a.priorityOrder??999)-(b.priorityOrder??999));
      const index = prioritized.findIndex((row) => row.id === id);
      if (index < 0) {
        const target = current.find((row)=>row.id===id);
        if (!target) return current;
        const nextOrder = prioritized.length + 1;
        return current.map((row)=>row.id===id?{...row,priorityOrder:nextOrder}:row);
      }
      const swap = index + direction; if (swap < 0 || swap >= prioritized.length) return current;
      const a = prioritized[index], b = prioritized[swap];
      return current.map(row=>row.id===a.id?{...row,priorityOrder:b.priorityOrder}:row.id===b.id?{...row,priorityOrder:a.priorityOrder}:row);
    });
  }
  function clearObjectPriority(id:number){
    setObjects(current=>{const next=current.map(row=>row.id===id?{...row,priorityOrder:null}:row);const ordered=next.filter(r=>r.priorityOrder!=null).sort((a,b)=>(a.priorityOrder??999)-(b.priorityOrder??999));const map=new Map(ordered.map((r,i)=>[r.id,i+1]));return next.map(r=>map.has(r.id)?{...r,priorityOrder:map.get(r.id)!}:r);});
  }
  function deleteObject(id: number, name: string) {
    if (window.confirm(`Удалить проект «${name}» из очереди объектов?`))
      setObjects((rows) => rows.filter((row) => row.id !== id));
  }
  function addChecklistItem(id: number) {
    const text = (checklistDrafts[id] ?? "").trim();
    if (!text) return;
    setObjects((rows) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              checklist: [...row.checklist, text],
              checklistDone: [...row.checklistDone, false],
            }
          : row,
      ),
    );
    setChecklistDrafts((current) => ({ ...current, [id]: "" }));
  }
  function toggleChecklistItem(id: number, index: number) {
    setObjects((rows) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              checklistDone: row.checklistDone.map((value, itemIndex) =>
                itemIndex === index ? !value : value,
              ),
            }
          : row,
      ),
    );
  }
  function removeChecklistItem(id: number, index: number) {
    setObjects((rows) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              checklist: row.checklist.filter(
                (_, itemIndex) => itemIndex !== index,
              ),
              checklistDone: row.checklistDone.filter(
                (_, itemIndex) => itemIndex !== index,
              ),
            }
          : row,
      ),
    );
  }
  function completeStage(id: number) {
    setObjects((rows) =>
      rows.map((row) => {
        if (
          row.id !== id ||
          !row.checklist.length ||
          !row.checklistDone.every(Boolean) ||
          row.completed
        )
          return row;
        const stageIndex = projectStages.indexOf(row.stage);
        if (stageIndex === projectStages.length - 1)
          return { ...row, completed: true };
        const nextStage = projectStages[stageIndex + 1];
        return {
          ...row,
          stage: nextStage,
          departmentId: stageDepartment[nextStage],
          owner: "",
          checklist: [],
          checklistDone: [],
          completed: false,
        };
      }),
    );
  }
  const totalVolume = objects.reduce((s, o) => s + o.volume, 0),
    avgProgress = objects.length
      ? Math.round(
          objects.reduce((s, o) => s + stageProgress(o.stage, o.completed), 0) /
            objects.length,
        )
      : 0;

  const productionProjectOptions = useMemo(() => orders.map(order=>({ key:`${order.projectName||'Без проекта'}|${order.number}`, label:`Заказ № ${order.number} · ${order.projectName||'Без проекта'}`, orderNumber:order.number, projectName:order.projectName||'Без проекта' })),[orders]);
  const selectedProductionOrderLabels = useMemo(() => productionProjectOptions.filter((option) => selectedProductionProjects.includes(option.key)).map((option) => option.label), [productionProjectOptions, selectedProductionProjects]);
  function orderToSelectedNominal(order: ProjectOrder) {
    const converted = orderToElements(order);
    if (nominalScenarioStep === 0) return converted;
    return {
      ...converted,
      elements: converted.elements.map((element) => {
        const current = scenarioCurrent(element.current, nominalScenarioStep);
        const code = resolveFormulaCode(elementCatalogById.get(element.typeId));
        const defaults = code ? getApprovedDimensions(code, current, element.poles) : element.lengths;
        const lengths = [...defaults, 0, 0].slice(0, 3);
        return { ...element, current, lengths, dimensionSources: lengths.map(() => "standard" as DimensionSource), dimensionOriginals: [...lengths] };
      }),
      jointRows: (converted.jointRows ?? []).map((joint) => ({ ...joint, currentA: scenarioCurrent(joint.currentA, nominalScenarioStep) })),
    };
  }
  const combinedProjectItems = useMemo(() => {
    if (!selectedProductionProjects.length) return calc.items;
    const itemMap = new Map<string, Item>();
    for (const order of orders.filter(row=>selectedProductionProjects.includes(`${row.projectName||'Без проекта'}|${row.number}`))) {
      const converted=orderToSelectedNominal(order);
      for (const element of converted.elements) {
        const catalog=elementCatalogById.get(element.typeId); if(!catalog) continue;
        const calculated=calculateElement(element,laborRate,catalog);
        for(const item of calculated?.items??[]){const key=`${item.group}|${item.name}|${item.unit}|${item.price}`;const old=itemMap.get(key);itemMap.set(key,{...item,qty:(old?.qty??0)+item.qty*element.quantity,total:(old?.total??0)+item.total*element.quantity,stockLengthM:item.stockLengthM===undefined?undefined:(old?.stockLengthM??0)+item.stockLengthM*element.quantity,massKg:item.massKg===undefined?undefined:(old?.massKg??0)+item.massKg*element.quantity});}
      }
      for(const joint of converted.jointRows??[]){for(const line of calculateJointMaterialLines(joint)){const key=`${line.group}|${line.name}|${line.unit}|0`;const old=itemMap.get(key);itemMap.set(key,{name:line.name,unit:line.unit,qty:(old?.qty??0)+line.qty,price:0,total:0,group:line.group});}}
    }
    return [...itemMap.values()];
  },[selectedProductionProjects,orders,calc.items,laborRate,nominalScenarioStep]);
  const procurementComparisonComponents = useMemo<ProcurementComponentRow[]>(() => {
    const rows: ProcurementComponentRow[] = [];
    for (const order of orders.filter((row) => selectedProductionProjects.includes(`${row.projectName || "Без проекта"}|${row.number}`))) {
      const converted = orderToSelectedNominal(order);
      const orderLabel = `Заказ № ${order.number} · ${order.projectName || "Без проекта"}`;
      for (const element of converted.elements) {
        const catalog = elementCatalogById.get(element.typeId);
        const code = resolveFormulaCode(catalog);
        rows.push({ orderLabel, component: catalog?.name ?? `Тип элемента ${element.typeId}`, article: code ? articleFor(element.current, code, element.poles) : catalog?.code ?? "", nominalA: element.current, poles: `${element.poles}P`, quantity: element.quantity, kind: "Секция", calculated: Boolean(catalog && calculateElement(element, laborRate, catalog)) });
      }
      for (const joint of converted.jointRows ?? []) rows.push({ orderLabel, component: joint.item || "Стыковочный элемент G", article: joint.article || "G", nominalA: joint.currentA, poles: `${joint.poles}P`, quantity: joint.quantity, kind: "Стык", calculated: calculateJointMaterialLines(joint).length > 0 });
      for (const sourceRow of order.rows) {
        const text = `${sourceRow.item} ${sourceRow.article}`;
        if (!/(?:КОМ|коробк\w*\s+отбор\w*\s+мощност|bolt[- ]?on|BB[-.]?)/i.test(text)) continue;
        const nominalA = Number(text.match(/(?:BB[-.]?|^|\s|-)(160|250|400|630|800|1000|1250|1600|2000|2500|3200|4000|5000|6300)\s*(?:A|А)?(?:\s|-|$)/i)?.[1] ?? 0);
        rows.push({ orderLabel, component: sourceRow.item || "КОМ", article: sourceRow.article, nominalA, poles: "—", quantity: sourceRow.quantity, kind: "КОМ", calculated: false });
      }
    }
    return rows;
  }, [orders, selectedProductionProjects, nominalScenarioStep, laborRate]);

  const reservationDemands = useMemo<DemandLine[]>(() => {
    const rows:DemandLine[]=[];
    for(const order of orders){const key=`${order.projectName||'Без проекта'}|${order.number}`;const obj=objects.find(o=>o.orderNumber===order.number);const converted=selectedProductionProjects.includes(key)?orderToSelectedNominal(order):orderToElements(order);const map=new Map<string,{name:string;unit:string;qty:number}>();for(const element of converted.elements){const catalog=elementCatalogById.get(element.typeId);if(!catalog)continue;const calculated=calculateElement(element,laborRate,catalog);for(const item of calculated?.items??[]){const code=(item.name.match(/^([^·]+)·/)?.[1]??'').trim();const k=code||item.name;const old=map.get(k);map.set(k,{name:item.name,unit:item.unit,qty:(old?.qty??0)+item.qty*element.quantity});}}for(const joint of converted.jointRows??[]){for(const item of calculateJointMaterialLines(joint)){const code=item.code||item.designation||item.name;const old=map.get(code);map.set(code,{name:item.name,unit:item.unit,qty:(old?.qty??0)+item.qty});}}for(const [code,m] of map)rows.push({projectKey:key,code,name:m.name,unit:m.unit,qty:m.qty,priority:obj?.priorityOrder??null});}return rows;
  },[orders,objects,laborRate,selectedProductionProjects,nominalScenarioStep]);
  const reservationAvailability = useMemo<AvailabilityLine[]>(()=>stock.map(row=>({code:row.code,name:row.name,unit:row.unit,stock:row.balance,inTransit:0,paid:0,supplierProduction:0})),[stock]);

  return (
    <main>
      <ExternalCostDataPanel projectKey={projectName} projectKeys={[projectName, ...orders.map(order => `${order.projectName || 'Без проекта'}|${order.number}`)]} />
      <aside className="sidebar">
        <div className="brand">
          <span className="brandmark" aria-hidden="true" />
          <div>
            <strong>KLM Управление</strong>
            <small>Объекты и себестоимость</small>
          </div>
        </div>
        <nav>
          <div className="nav-group-label">01 · Продажи и проекты</div>
          <button
            className={active === "projects" ? "active" : ""}
            onClick={() => setActive("projects")}
          >
            <span>▰</span> Проекты и договоры
          </button>
          <button
            className={active === "commercial" ? "active" : ""}
            onClick={() => setActive("commercial")}
          >
            <span>₽</span> Коммерция и оплаты
          </button>
          <div className="nav-group-label">02 · Проектирование и состав</div>
          <button
            className={active === "objects" ? "active" : ""}
            onClick={() => setActive("objects")}
          >
            <span>◇</span> Объекты
          </button>
          <button
            className={active === "composition" ? "active" : ""}
            onClick={() => setActive("composition")}
          >
            <span>▤</span> Состав проектов
          </button>
          <button
            className={active === "orders" ? "active" : ""}
            onClick={() => setActive("orders")}
          >
            <span>▣</span> Текущие заказы{" "}
            {orders.length > 0 && <b className="nav-count">{orders.length}</b>}
          </button>
          <button
            className={active === "departments" ? "active" : ""}
            onClick={() => setActive("departments")}
          >
            <span>▦</span> Подразделения
          </button>
          <button
            className={active === "calc" ? "active" : ""}
            onClick={() => setActive("calc")}
          >
            <span>⌁</span> Калькулятор
          </button>
          <div className="nav-group-label">03 · Планирование потребности</div>
          <button
            className={active === "materials" ? "active" : ""}
            onClick={() => setActive("materials")}
          >
            <span>▧</span> Потребность и склад
          </button>
          <div className="nav-group-label">04 · Закупки и поставки</div>
          <button
            className={active === "procurement" ? "active" : ""}
            onClick={() => setActive("procurement")}
          >
            <span>⇥</span> Заказ материалов
          </button>
          <div className="nav-group-label">05 · Склад и резервы</div>
          <button className={active === "reservations" ? "active" : ""} onClick={() => setActive("reservations")}><span>◫</span> Резервы</button>
          <button className={active === "illiquid" ? "active" : ""} onClick={() => setActive("illiquid")}><span>◩</span> Неликвид</button>
          <button
            className={active === "models" ? "active" : ""}
            onClick={() => setActive("models")}
          >
            <span>◈</span> Параметризация
          </button>
          <button
            className={active === "breakers" ? "active" : ""}
            onClick={() => setActive("breakers")}
          >
            <span>▣</span> Подбор КОМ
          </button>
          <div className="nav-group-label">06 · Производство</div>
          <button
            className={active === "shifts" ? "active" : ""}
            onClick={() => setActive("shifts")}
          >
            <span>▦</span> Сменные задания
          </button>
          <div className="nav-group-label">07–10 · Контроль и справочники</div>
          <button className={active === "rules" ? "active" : ""} onClick={() => setActive("rules")}>
            <span>⚙</span> Управление правилами
          </button>
          <button className={active === "analytics" ? "active" : ""} onClick={() => setActive("analytics")}>
            <span>▥</span> Аналитика
          </button>
        </nav>
        <div className="source">
          <span>Контур системы</span>
          <strong>Заказ → расчёт → склад → снабжение</strong>
          <small>Единая производственная панель</small>
        </div>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <p className="eyebrow">KLM · единая система управления</p>
            <h1>
              {{ projects: "Проекты и договоры", commercial: "Коммерция и оплаты", reservations: "Резервы и обеспеченность", models: "Очередь параметризации", breakers: "Подбор КОМ", shifts: "Сменные задания", rules: "Управление правилами", analytics: "Аналитика", objects: "Планирование объектов", composition: "Состав проектов", orders: "Текущие заказы", departments: "Подразделения", calc: "Калькулятор себестоимости", materials: "Потребность и склад", procurement: "Заказ материалов", illiquid: "Неликвиды производства" }[active]}
            </h1>
          </div>
          <div className="header-actions">
            <button
              className="theme-toggle"
              type="button"
              disabled={!themeReady}
              onClick={() =>
                setTheme((value) => (value === "dark" ? "light" : "dark"))
              }
              aria-label={
                theme === "dark"
                  ? "Включить светлую тему"
                  : "Включить тёмную тему"
              }
            >
              {theme === "dark" ? "☀ Светлая" : "◐ Тёмная"}
            </button>
            <div className="user">ПБ</div>
          </div>
        </header>
        {active === "objects" && (
          <>
            <div className="object-kpis">
              <div>
                <span>Объектов в работе</span>
                <strong>{objects.length}</strong>
                <small>
                  {objects.filter((o) => o.priority === "Высокий").length}{" "}
                  высокого приоритета
                </small>
              </div>
              <div>
                <span>Объём секций</span>
                <strong>{totalVolume}</strong>
                <small>условных секций в плане</small>
              </div>
              <div>
                <span>Средняя готовность</span>
                <strong>{avgProgress}%</strong>
                <small>по завершённым этапам</small>
              </div>
              <div>
                <span>Без исполнителя</span>
                <strong>{objects.filter((o) => !o.owner).length}</strong>
                <small>требуют распределения</small>
              </div>
            </div>
            <div className="notice queue-help">
              <b>Для чего нужна очередь объектов</b>
              <span>
                Это оперативный план прохождения проектов через подразделения:
                приоритет, текущая контрольная точка, ответственный и
                блокировка. По этой очереди далее рассчитывается план и
                фактическая загрузка каждого отдела.
              </span>
            </div>
            <div className="planning-grid">
              <div className="panel object-panel">
                <div className="panel-title">
                  <div>
                    <span>01</span>
                    <h2>Очередь объектов</h2>
                  </div>
                  <button className="mini-add" onClick={addObject}>
                    ＋ Добавить объект
                  </button>
                </div>
                {!objects.length ? (
                  <div className="empty object-empty">
                    Объектов в текущем сеансе нет. Добавьте проект вручную.
                  </div>
                ) : (
                  <div className="object-list">
                    {scheduledObjects.map((o) => {
                      const department =
                        assignmentDepartments.find(
                          (item) => item.id === o.departmentId,
                        ) ?? assignmentDepartments[0];
                      const stageIndex = projectStages.indexOf(o.stage);
                      const progress = stageProgress(o.stage, o.completed);
                      const checklistReady =
                        o.checklist.length > 0 &&
                        o.checklistDone.every(Boolean);
                      const nextStage = projectStages[stageIndex + 1];
                      return (
                        <div className="object-row" key={o.id}>
                          <div className="object-main">
                            <div className={`queue-priority ${o.priorityOrder == null ? 'unassigned' : ''}`}><b>{o.priorityOrder ?? '—'}</b><span>приоритет</span><div><button onClick={()=>moveObjectPriority(o.id,-1)} title='Поднять приоритет'>↑</button><button onClick={()=>moveObjectPriority(o.id,1)} title='Опустить приоритет'>↓</button>{o.priorityOrder!=null&&<button onClick={()=>clearObjectPriority(o.id)} title='Снять приоритет'>×</button>}</div></div>
                            <span className={`priority p-${o.priority.toLowerCase()}`}>{o.priorityOrder == null && o.autoFromOrder ? 'Новый заказ' : o.priority}</span>
                            <div>
                              <input
                                className="object-name"
                                value={o.name}
                                onChange={(e) =>
                                  updateObject(o.id, { name: e.target.value })
                                }
                              />
                              <small>
                                {o.customer} · загружен {o.loadedAt ? new Date(o.loadedAt).toLocaleDateString('ru-RU') : '—'} · {o.volume} секций · {o.productionHours > 0 ? `${o.productionHours.toFixed(1)} нормо-ч / ${(Math.max(0,...Object.values(o.productionLoads ?? {'Сборочный участок':o.productionHours}))/12).toFixed(1)} дн.` : 'нормы не определены'} · {o.plannedStart ? `запуск ${new Date(o.plannedStart).toLocaleDateString('ru-RU')}` : 'ожидает постановки в очередь'} · {o.plannedReady ? `готовность ${new Date(o.plannedReady).toLocaleDateString('ru-RU')}` : ''}
                              </small>
                            </div>
                            <button
                              className="delete-object"
                              onClick={() => deleteObject(o.id, o.name)}
                              aria-label={`Удалить проект ${o.name}`}
                            >
                              Удалить
                            </button>
                          </div>
                          <div className="object-controls">
                            <label>
                              Отдел
                              <select
                                value={o.departmentId}
                                onChange={(e) =>
                                  updateObject(o.id, {
                                    departmentId: e.target.value,
                                    owner: "",
                                  })
                                }
                              >
                                {assignmentDepartments.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Сотрудник
                              <select
                                value={o.owner}
                                disabled={!department.members.length}
                                onChange={(e) =>
                                  updateObject(o.id, { owner: e.target.value })
                                }
                              >
                                <option value="">
                                  {department.members.length
                                    ? "Не назначен"
                                    : "Список сотрудников не заполнен"}
                                </option>
                                {department.members.map((member) => (
                                  <option key={member} value={member}>
                                    {member}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          {!department.members.length && (
                            <p className="assignment-note">
                              Для отдела «{department.name}» необходимо
                              заполнить список сотрудников. Фамилии не добавлены
                              без подтверждения.
                            </p>
                          )}
                          <div
                            className="project-stage-track"
                            aria-label={`Маршрут проекта, текущий этап ${o.stage}`}
                          >
                            {projectStages.map((stage, index) => (
                              <span
                                key={stage}
                                className={
                                  o.completed || index < stageIndex
                                    ? "done"
                                    : index === stageIndex
                                      ? "current"
                                      : ""
                                }
                              >
                                {stage}
                              </span>
                            ))}
                          </div>
                          <div className="progress-line">
                            <i>
                              <b style={{ width: `${progress}%` }} />
                            </i>
                            <span>
                              {progress}% · {o.completed ? "Завершён" : o.stage}
                            </span>
                          </div>
                          <div className="stage-checklist">
                            <div className="stage-checklist-head">
                              <strong>Чек-лист этапа «{o.stage}»</strong>
                              <small>
                                {o.checklistDone.filter(Boolean).length} из{" "}
                                {o.checklist.length}
                              </small>
                            </div>
                            {o.checklist.length ? (
                              <div className="checklist-items">
                                {o.checklist.map((item, index) => (
                                  <label key={`${item}-${index}`}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(o.checklistDone[index])}
                                      onChange={() =>
                                        toggleChecklistItem(o.id, index)
                                      }
                                    />
                                    <span>{item}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeChecklistItem(o.id, index)
                                      }
                                      aria-label={`Удалить пункт ${item}`}
                                    >
                                      ×
                                    </button>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <p>
                                Критерии этапа ещё не заданы. Добавьте
                                подтверждаемые пункты; без них переход
                                заблокирован.
                              </p>
                            )}
                            <div className="checklist-add">
                              <input
                                value={checklistDrafts[o.id] ?? ""}
                                onChange={(e) =>
                                  setChecklistDrafts((current) => ({
                                    ...current,
                                    [o.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addChecklistItem(o.id);
                                  }
                                }}
                                placeholder="Добавить пункт чек-листа"
                              />
                              <button
                                type="button"
                                onClick={() => addChecklistItem(o.id)}
                              >
                                Добавить
                              </button>
                            </div>
                            <button
                              className="complete-stage"
                              disabled={!checklistReady || o.completed}
                              onClick={() => completeStage(o.id)}
                            >
                              {o.completed
                                ? "Проект завершён"
                                : nextStage
                                  ? `Завершить этап и перейти к «${nextStage}»`
                                  : "Завершить проект"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="right-stack">
                <div className="panel">
                  <div className="panel-title">
                    <div>
                      <span>02</span>
                      <h2>Назначения по отделам</h2>
                    </div>
                    <small>без расчётной загрузки</small>
                  </div>
                  <div className="department-assignment-list">
                    {assignmentDepartments.map((department) => (
                      <div key={department.id}>
                        <div>
                          <strong>{department.name}</strong>
                          <small>
                            {department.members.length
                              ? `${department.members.length} сотрудников подтверждено`
                              : "Сотрудники не заполнены"}
                          </small>
                        </div>
                        <span>
                          {
                            objects.filter(
                              (o) => o.departmentId === department.id,
                            ).length
                          }{" "}
                          объектов
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="panel standup">
                  <div className="panel-title">
                    <div>
                      <span>09:00</span>
                      <h2>Ежедневное совещание</h2>
                    </div>
                  </div>
                  <label>
                    <input type="checkbox" /> Результат за вчера
                  </label>
                  <label>
                    <input type="checkbox" /> План и приоритеты на сегодня
                  </label>
                  <label>
                    <input type="checkbox" /> Блокировки и обмен опытом
                  </label>
                  <label>
                    <input type="checkbox" /> Новые объекты без исполнителя
                  </label>
                </div>
              </div>
            </div>
            <div className="panel workstreams">
              <div className="panel-title">
                <div>
                  <span>03</span>
                  <h2>Программы и технические задания</h2>
                </div>
                <small>контроль инициатив</small>
              </div>
              <div className="stream-grid">
                <article>
                  <span>В РАБОТЕ</span>
                  <h3>Конструктор оптимального шинопровода</h3>
                  <p>
                    Расчёт боковины, сечения шины и тепловых потерь. Снижение
                    металлоёмкости при подтверждённой стойкости.
                  </p>
                  <footer>Ответственный назначается в очереди объектов</footer>
                </article>
                <article>
                  <span>ТЗ</span>
                  <h3>Программа управления объектами</h3>
                  <p>
                    Распределение с учётом загрузки, мелкие блоки планирования и
                    последовательные контрольные точки.
                  </p>
                  <footer>Следующий шаг: заполнить критерии этапов</footer>
                </article>
                <article>
                  <span>КОНЦЕПЦИЯ</span>
                  <h3>Автоматизация выдачи КП</h3>
                  <p>
                    Приоритизация объёма, поэтапный выпуск секций и раннее
                    получение финансового результата.
                  </p>
                  <footer>Следующий шаг: карта процесса КП</footer>
                </article>
              </div>
            </div>
          </>
        )}
        {active === "composition" && (
          <div className="project-composition-shell">
            <div className="composition-mode-tabs" role="tablist" aria-label="Режим состава проекта">
              <button role="tab" aria-selected={compositionMode === "production"} className={compositionMode === "production" ? "active" : ""} onClick={() => setCompositionMode("production")}>Заказ на производство</button>
              <button role="tab" aria-selected={compositionMode === "preliminary"} className={compositionMode === "preliminary" ? "active" : ""} onClick={() => setCompositionMode("preliminary")}>Предварительная спецификация</button>
            </div>
            {compositionMode === "production" ? <ProjectCompositionPanel
              orders={orders}
              setOrders={setOrders}
              onCalculateOrder={calculateOrder}
              onOpenCurrentOrder={openControlOrder}
              onImportFiles={(files) => importProductionOrders(files)}
              onDeleteOrder={deleteProductionOrder}
            /> : <PreliminarySpecificationPanel
              specifications={preliminarySpecifications}
              setSpecifications={setPreliminarySpecifications}
              estimate={estimatePreliminarySpecification}
              buildScenario={buildPreliminaryScenario}
              stock={stock}
              stockSource={stockSource}
              onImportFiles={importPreliminarySpecifications}
              onSave={savePreliminarySpecification}
              onDelete={deletePreliminarySpecification}
              onConvert={convertPreliminarySpecification}
            />}
          </div>
        )}
        {(["projects", "commercial", "models", "breakers", "shifts"] as const).includes(active as never) && (
          <EnterpriseWorkspacePanel
            mode={active as "projects" | "commercial" | "reservations" | "models" | "breakers" | "shifts"}
            orders={orders}
            stock={stock}
            onOpenComposition={() => setActive("composition")}
            onImportOrders={importProductionOrders}
            onDeleteOrder={deleteProductionOrder}
            onSelectOrder={calculateOrder}
            onProjectDeleted={(projectKey) => setOrders((rows) => rows.filter((order) => order.projectName !== projectKey))}
          />
        )}
        {active === "rules" && <div className="rules-management-page">
          <section className="panel commercial-rules-panel">
            <div className="panel-title"><div><span>%</span><h2>Финансовые и технологические проценты</h2></div><small>управляемые параметры расчёта</small></div>
            <div className="commercial-rule-grid">
              <label><span>Технологические потери, %</span><input type="number" min="0" step="0.1" value={technologyLossPct} onChange={(e) => setTechnologyLossPct(Math.max(0, Number(e.target.value)))} /><small>По умолчанию 1%. Применяется единым процентом к производственным материалам.</small></label>
              <label><span>Надбавка, %</span><input type="number" min="0" step="0.1" value={markupPct} onChange={(e) => setMarkupPct(Math.max(0, Number(e.target.value)))} /><small>Ручной ввод. Применяется после технологических потерь.</small></label>
              <label><span>НДС, %</span><input type="number" min="0" step="0.1" value={vatPct} onChange={(e) => setVatPct(Math.max(0, Number(e.target.value)))} /><small>По умолчанию 20%. Допускается 0%.</small></label>
            </div>
            <div className="notice ok-notice"><b>Порядок:</b><span>Себестоимость → технологические потери → надбавка → цена без НДС → НДС → итоговая цена.</span></div>
          </section>
          <ApprovedRulesRegistryPanel />
          <ManufacturingRulesPanel />
          <CalculationGapsPanel catalog={elementCatalog} />
          <EnterpriseWorkspacePanel
            mode="management"
            orders={orders}
            stock={stock}
            onOpenComposition={() => setActive("composition")}
            onImportOrders={importProductionOrders}
            onDeleteOrder={deleteProductionOrder}
            onSelectOrder={calculateOrder}
            onProjectDeleted={(projectKey) => setOrders((rows) => rows.filter((order) => order.projectName !== projectKey))}
          />
        </div>}
        {active === "orders" && (
          <CurrentOrdersPanel
            orders={orders}
            analyzeOrder={analyzeOrder}
            onSelectOrder={calculateOrder}
            onOpenImport={() => setActive("composition")}
            focusedOrderNumber={focusedOrderNumber}
          />
        )}
        {active === "calc" && transferReport && (
          <section className="panel transfer-report">
            <div className="panel-title">
              <div>
                <span>↳</span>
                <h2>
                  Результат переноса заказа № {transferReport.orderNumber}
                </h2>
              </div>
              <small>
                {transferReport.supportedRows} строк передано в расчёт
              </small>
            </div>
            <div className="transfer-report-kpis">
              <div>
                <span>Поддерживается</span>
                <strong>{transferReport.supportedRows}</strong>
                <small>строк заказа</small>
              </div>
              <div
                className={
                  transferReport.unsupportedRows.length ? "risk" : "ok"
                }
              >
                <span>Не сопоставлено</span>
                <strong>{transferReport.unsupportedRows.length}</strong>
                <small>не включены в расчёт</small>
              </div>
              <div
                className={transferReport.defaultedRows.length ? "risk" : "ok"}
              >
                <span>Стандартные размеры</span>
                <strong>{transferReport.defaultedRows.length}</strong>
                <small>строк с подстановкой</small>
              </div>
            </div>
            {transferReport.unsupportedRows.length > 0 && (
              <details className="transfer-details" open>
                <summary>
                  Строки, требующие уточнения —{" "}
                  {transferReport.unsupportedRows.length}
                </summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Строка</th>
                        <th>Номенклатура / артикул</th>
                        <th>Количество</th>
                        <th>Причина</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transferReport.unsupportedRows.map((row, index) => (
                        <tr key={`${row.rowNumber}-${row.article}-${index}`}>
                          <td>{row.rowNumber}</td>
                          <td>
                            <strong>{row.item || "—"}</strong>
                            <small>{row.article || "Артикул не указан"}</small>
                          </td>
                          <td>{row.quantity}</td>
                          <td>{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {transferReport.defaultedRows.length > 0 && (
              <details className="transfer-details">
                <summary>
                  Строки со стандартными размерами —{" "}
                  {transferReport.defaultedRows.length}
                </summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Строка</th>
                        <th>Артикул</th>
                        <th>Подставленные размеры</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transferReport.defaultedRows.map((row, index) => (
                        <tr key={`${row.rowNumber}-${row.article}-${index}`}>
                          <td>{row.rowNumber}</td>
                          <td>{row.article}</td>
                          <td>{row.dimensions.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </section>
        )}
        {active === "departments" && (
          <>
            <div className="notice">
              <b>Сквозной маршрут заказа</b>
              <span>
                Проектный отдел → конструкторский отдел → технологический отдел
                → производство. Состав подразделений внесён по предоставленным
                данным; показатели загрузки пока не заданы.
              </span>
            </div>
            <div className="department-flow">
              {departments.map((d, index) => (
                <div className="flow-step" key={d.id}>
                  <span style={{ background: d.accent }}>{d.short}</span>
                  <div>
                    <small>Этап {d.number}</small>
                    <strong>{d.name}</strong>
                  </div>
                  {index < departments.length - 1 && <i>→</i>}
                </div>
              ))}
            </div>
            <div className="department-grid">
              {departments.map((d) => (
                <article
                  className="department-card"
                  key={d.id}
                  style={{ borderTopColor: d.accent }}
                >
                  <div className="department-head">
                    <div>
                      <span style={{ color: d.accent }}>{d.number}</span>
                      <h2>{d.name}</h2>
                    </div>
                    <small>
                      {d.members.length}{" "}
                      {d.id === "production" ? "участка" : "сотрудников"}
                    </small>
                  </div>
                  <h3>
                    {d.id === "production"
                      ? "Производственные участки"
                      : "Состав отдела"}
                  </h3>
                  <ul className="member-list">
                    {d.members.map((member) => (
                      <li key={member}>
                        <span style={{ background: d.accent }}>
                          {member
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                        <strong>{member}</strong>
                      </li>
                    ))}
                  </ul>
                  <h3>Основные задачи</h3>
                  <ol>
                    {d.tasks.map((task) => (
                      <li key={task}>{task}</li>
                    ))}
                  </ol>
                  <footer>{d.handoff}</footer>
                </article>
              ))}
            </div>
            <div className="panel transfer">
              <div className="panel-title">
                <div>
                  <span>05</span>
                  <h2>Контроль передачи между отделами</h2>
                </div>
                <small>единый объект и единый статус</small>
              </div>
              <div className="transfer-grid">
                <div>
                  <strong>ПО → КД</strong>
                  <span>
                    Согласованные исходные данные, трасса, состав системы,
                    приоритет и срок выпуска.
                  </span>
                </div>
                <div>
                  <strong>КД → ТО</strong>
                  <span>
                    Утверждённая документация, спецификация, извещения об
                    изменениях и отметка комплектности.
                  </span>
                </div>
                <div>
                  <strong>ТО → Производство</strong>
                  <span>
                    Маршрут, нормы, оснастка, контрольные операции и
                    подтверждение готовности запуска.
                  </span>
                </div>
                <div>
                  <strong>Производство → Система</strong>
                  <span>
                    Факт выполнения, отклонения, брак, переделки и причины
                    остановок по каждому объекту.
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
        {active === "departments" && (
          <DepartmentResponsibilityPanel
            projectName={projectName}
            elements={calc.rows.map((row, index) => ({
              id: row.id,
              label: `${index + 1}. ${row.catalog.code} — ${row.catalog.name}`,
            }))}
            projectMembers={
              departments.find((item) => item.id === "project")?.members ?? []
            }
            designMembers={
              departments.find((item) => item.id === "design")?.members ?? []
            }
            technologyMembers={
              departments.find((item) => item.id === "technology")?.members ??
              []
            }
          />
        )}
        {active === "calc" && (
          <>
            <div className="notice">
              <b>
                Правила {SECTION_RULES_VERSION}: охвачены все{" "}
                {elementCatalog.length} типов
              </b>
              <span>
                Размеры L1/L2/L3: ручное изменение → спецификация → стандартная таблица. Стандартный источник:{" "}
                {STANDARD_DIMENSIONS_SOURCE}.
              </span>
            </div>
            {calc.unsupportedRows > 0 && (
              <div className="notice warning">
                <b>Не хватает размеров</b>
                <span>
                  В {calc.unsupportedRows} строках сумма L1 + L2 + L3 равна
                  нулю; они не включены в стоимость и потребность материалов.
                </span>
              </div>
            )}
            <section className="panel nominal-scenario-window" aria-label="Выбор расчётного номинала">
              <div className="panel-title"><div><span>А</span><h2>Выбор расчётного номинала</h2></div><small>пересчёт выполняется сразу</small></div>
              <p>Выберите вариант — система немедленно заменит номинальный ток во всех элементах и заново рассчитает шины, количество пакетов, боковины, крышки, изоляцию и остальные материалы.</p>
              <div className="nominal-scenario-actions">
                {([0, 1, 2] as const).map((step) => {
                  const firstCurrent = elements[0]?.current;
                  const targetCurrent = firstCurrent ? scenarioCurrent(nominalBaseCurrents[elements[0].id] ?? firstCurrent, step) : 0;
                  const label = step === 0 ? "Исходный номинал" : step === 1 ? "На 1 номинал ниже" : "На 2 номинала ниже";
                  return <button type="button" key={step} className={nominalScenarioStep === step ? "active" : ""} onClick={() => applyNominalScenario(step)}><span>{label}</span><b>{targetCurrent ? `${targetCurrent} А` : "—"}</b><small>{step === 0 ? "по загруженной спецификации" : "пересчитать весь состав"}</small></button>;
                })}
              </div>
              <div className="nominal-active-summary">
                <span>Сейчас рассчитано</span>
                <strong>{[...new Set(elements.map((row) => `${row.current} А`))].join(", ") || "—"}</strong>
                <small>{calc.rows[0]?.calc ? `Первая строка: ${calc.rows[0].calc.cfg.count} пакет(а) · шина ${calc.rows[0].calc.cfg.thickness}×${calc.rows[0].calc.cfg.height} мм` : "После выбора ниже обновятся карточки элементов и сводный ресурсный состав."}</small>
              </div>
            </section>
            <ControlCalculationPanel
              projectName={projectName}
              projectKey={controlProjectKey}
              documentKey={controlDocumentKey}
              documentKind={controlDocumentKind}
              pilotDocuments={controlPilotDocuments}
              items={combinedProjectItems}
              stock={stock}
              stockSource={stockSource}
              rulesVersion={SECTION_RULES_VERSION}
            />
            <div className="layout">
              <div className="panel inputs">
                <div className="panel-title">
                  <div>
                    <span>01</span>
                    <h2>Элементы сети</h2>
                  </div>
                  <small>
                    {calc.totalQuantity} шт. в {elements.length} строках
                  </small>
                </div>
                <label>
                  Проект / заказ
                  <input
                    value={projectName}
                    onChange={(e) => { setProjectName(e.target.value); setControlProjectKey(e.target.value); setControlDocumentKey("manual"); setControlDocumentKind("manual"); }}
                  />
                </label>
                <div className="multi-spec-calculator">
                  <div className="multi-spec-head"><div><strong>Спецификации для общего расчёта</strong><small>Выберите одну или несколько. Одинаковые элементы по артикулу, проводности и размерам будут объединены в одну строку.</small></div><button type="button" onClick={() => setSelectedCalculatorSpecifications(selectedCalculatorSpecifications.length === calculatorSpecificationOptions.length ? [] : calculatorSpecificationOptions.map((option) => option.key))}>{selectedCalculatorSpecifications.length === calculatorSpecificationOptions.length && calculatorSpecificationOptions.length ? "Снять все" : "Выбрать все"}</button></div>
                  {calculatorSpecificationOptions.length ? <div className="multi-spec-list">{calculatorSpecificationOptions.map((option) => <label key={option.key}><input type="checkbox" checked={selectedCalculatorSpecifications.includes(option.key)} onChange={(event) => setSelectedCalculatorSpecifications((current) => event.target.checked ? [...current, option.key] : current.filter((key) => key !== option.key))} /><span>{option.label}</span></label>)}</div> : <p className="muted">Сначала загрузите заказы или предварительные спецификации.</p>}
                  <button type="button" className="primary multi-spec-calculate" disabled={!selectedCalculatorSpecifications.length} onClick={calculateSelectedSpecifications}>Рассчитать выбранные спецификации ({selectedCalculatorSpecifications.length})</button>
                </div>
                <div className="resource-selection-toolbar">
                  <div>
                    <strong>Выгрузка ресурсной спецификации элементов</strong>
                    <small>Отметьте рассчитанные элементы ниже или выгрузите каждый элемент отдельно из его карточки.</small>
                  </div>
                  <button type="button" onClick={() => {
                    setSelectedResourceElementIds(calc.rows.filter((row) => row.calc).map((row) => row.id));
                    setSelectedResourceJointIds(jointCalc.rows.filter((row) => calculateJointMaterialLines(row).length > 0).map((row) => row.id));
                  }}>Выбрать все рассчитанные</button>
                  <button type="button" onClick={() => { setSelectedResourceElementIds([]); setSelectedResourceJointIds([]); }}>Снять выбор</button>
                  <button type="button" className="primary" disabled={!selectedResourceElementIds.length && !selectedResourceJointIds.length} onClick={exportSelectedResourceSpecification}>
                    Выгрузить выбранные ({selectedResourceElementIds.length + selectedResourceJointIds.length})
                  </button>
                </div>
                <label className="element-catalog-search">
                  Поиск типа элемента
                  <input
                    value={elementSearch}
                    onChange={(e) => setElementSearch(e.target.value)}
                    placeholder="Введите код, номер или часть наименования"
                  />
                  <small>
                    {filteredElementCatalog.length} из {elementCatalog.length} типов
                  </small>
                </label>
                {jointCalc.rows.length > 0 && (
                  <section className="joint-demand-block">
                    <div className="section-heading"><div><span className="eyebrow">Отдельный блок · только по спецификации</span><h2>Стыковочные элементы G</h2></div><b>{number.format(jointCalc.rows.reduce((s,r)=>s+r.quantity,0))} компл.</b></div>
                    <p className="muted">Стыки не входят в состав FE, CD, CP, ZD, ZDP или других секций. Для каждого стыка принудительно L1 = 0, L2 = 0, L3 = 0. Состав раскрыт только по КД 012.001.000СБ / G.001.000СБ. Gasketing рассчитан по геометрии 01.312.012СБ.</p>
                    <div className="joint-card-list">
                      {jointCalc.rows.map((joint) => {
                        const expanded = expandedJointIds.includes(joint.id);
                        const lines = calculateJointMaterialLines(joint);
                        return <article key={joint.id} className={`element-card joint-element-card ${expanded ? "expanded" : ""} ${joint.recognitionStatus === "confirmed" ? "" : "unsupported-element"}`}>
                          <div className="element-head">
                          <label className="resource-row-select" title="Добавить стык в общую выгрузку"><input type="checkbox" checked={selectedResourceJointIds.includes(joint.id)} disabled={!lines.length} onChange={(event) => setSelectedResourceJointIds((ids) => event.target.checked ? [...ids, joint.id] : ids.filter((id) => id !== joint.id))} /><span>В Excel</span></label>
                          <button type="button" className="element-toggle" onClick={() => setExpandedJointIds((ids) => ids.includes(joint.id) ? ids.filter((id) => id !== joint.id) : [...ids, joint.id])} aria-expanded={expanded}>
                            <span className="element-index">G</span>
                            <span><strong>Стыковочный элемент G</strong><small>Строка {joint.rowNumber || "—"} · {joint.article || "артикул не указан"}</small></span>
                            <b className="disclosure">{expanded ? "Скрыть ресурсную спецификацию ↑" : "Показать ресурсную спецификацию ↓"}</b>
                          </button>
                          <button type="button" className="resource-row-export" disabled={!lines.length} onClick={() => exportElementResourceSpecification([], [joint.id], `стык_${joint.article || joint.id}`)}>Выгрузить Excel</button>
                          </div>
                          <div className="field-grid joint-fields">
                            <label>Тип элемента<input value="Стыковочный элемент G" readOnly /></label>
                            <label>Номинальный ток<input value={joint.currentA ? `${joint.currentA} А` : "Не определён"} readOnly /></label>
                            <label>Проводность<input value={`${joint.poles}P`} readOnly /></label>
                            <label>Артикул<input value={joint.article || "—"} readOnly /></label>
                            <label>Количество<input value={`${number.format(joint.quantity)} компл.`} readOnly /></label>
                            <label>L1 / L2 / L3<input value="0 / 0 / 0 мм" readOnly /></label>
                          </div>
                          {expanded && <div className="element-resources"><div className="table-wrap"><table><thead><tr><th>Код / обозначение</th><th>Ресурс</th><th>Ед.</th><th>Потребность</th><th>Основание</th></tr></thead><tbody>
                            {lines.map((line,index)=>{ const approved=findApprovedCode({name:line.name,designation:line.designation,contour:"Стык G"}); const code=approved?.code||line.code; return <tr key={`${line.designation}-${line.name}-${index}`}><td>{code||line.designation||"—"}</td><td>{line.designation ? `${line.designation} · ` : ""}{line.name}</td><td>{line.unit}</td><td><b>{number.format(line.qty)}</b></td><td>{line.basis}</td></tr>})}
                          </tbody></table></div></div>}
                        </article>;
                      })}
                    </div>
                  </section>
                )}
                <div className="network-list">
                  {calculationDisplayRows.map((row, index) => {
                    const expanded = expandedElements.includes(row.id);
                    const selectedType = elementCatalogById.get(row.typeId);
                    const elementTypeOptions = selectedType && !filteredElementCatalog.some((item) => item.id === selectedType.id)
                      ? [selectedType, ...filteredElementCatalog]
                      : filteredElementCatalog;
                    const startsTerminalBlock = row.code === "ATSC" && (index === 0 || calculationDisplayRows[index - 1]?.code !== "ATSC");
                    return (
                      <div key={`wrap-${row.id}`}>
                      {startsTerminalBlock && <div className="terminal-section-divider"><span>Отдельный блок</span><strong>Терминальные секции ATSC</strong><small>Собственная КД и состав; не смешиваются с обычными секциями.</small></div>}
                      <div
                        className={`element-card ${row.code === "ATSC" ? "terminal-element-card" : ""} ${expanded ? "expanded" : ""} ${row.calc ? "" : "unsupported-element"}`}
                      >
                        <div className="element-head">
                          <label className="resource-row-select" title={row.calc ? "Добавить элемент в общую выгрузку" : "Сначала рассчитайте элемент"}>
                            <input type="checkbox" checked={selectedResourceElementIds.includes(row.id)} disabled={!row.calc} onChange={(event) => setSelectedResourceElementIds((ids) => event.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id))} />
                            <span>В Excel</span>
                          </label>
                          <button
                            type="button"
                            className="element-toggle"
                            onClick={() => row.calc && toggleElement(row.id)}
                            aria-expanded={expanded}
                            disabled={!row.calc}
                          >
                            <span className="element-index">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span>
                              <strong>{row.catalog.name}</strong>
                              <small>
                                № {row.catalog.sourceNumber} ·{" "}
                                {row.catalog.code} · {row.article}
                              </small>
                            </span>
                            <b className="disclosure">
                              {row.calc
                                ? expanded
                                  ? "Скрыть ресурсы ↑"
                                  : "Показать ресурсы ↓"
                                : "Введите размеры L1–L3"}
                            </b>
                          </button>
                          <button type="button" className="resource-row-export" disabled={!row.calc} onClick={() => exportElementResourceSpecification([row.id], [], `элемент_${index + 1}_${row.article}`)}>Выгрузить Excel</button>
                          <button
                            className="remove"
                            onClick={() => removeElement(row.id)}
                            disabled={elements.length === 1}
                            aria-label={`Удалить элемент ${index + 1}`}
                          >
                            ×
                          </button>
                        </div>
                        <div className="field-grid">
                          <label>
                            Тип элемента
                            <select
                              value={row.typeId}
                              onChange={(e) => changeType(row, +e.target.value)}
                            >
                              {elementTypeOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                  № {item.sourceNumber} · {item.code} —{" "}
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Номинальный ток
                            <select
                              value={row.current}
                              onChange={(e) =>
                                changeCurrent(row, +e.target.value)
                              }
                            >
                              {currents.map((i) => (
                                <option key={i} value={i}>
                                  {i} А
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Проводность
                            <select value={row.poles} onChange={(e) => changePoles(row, Number(e.target.value) as PoleCount)}>
                              <option value={4}>4P</option>
                              <option value={5}>5P</option>
                            </select>
                          </label>
                          <label>
                            Артикул
                            <input value={row.article} readOnly />
                          </label>
                          <label>
                            Шина
                            <input
                              value={
                                row.calc
                                  ? `${row.poles}P: ${row.calc.cfg.count}×${row.calc.cfg.height}×${row.calc.cfg.thickness} мм на проводник; всего ${row.poles * row.calc.cfg.count} шин`
                                  : (() => { const cfg = getCalculationBusConfig(row.current, row.poles); return cfg ? `${row.poles}P: ${cfg.count}×${cfg.height}×${cfg.thickness} мм на проводник; всего ${row.poles * cfg.count} шин` : "—"; })()
                              }
                              readOnly
                            />
                          </label>
                          {Array.from({ length: 3 }, (_, i) => (
                            <label key={i}>
                              L{i + 1}, мм
                              <input
                                type="number"
                                min="0"
                                step={row.info?.step ?? 50}
                                value={row.lengths[i] ?? 0}
                                onChange={(e) => {
                                  const nextValue = +e.target.value;
                                  const lengths = row.lengths.map((v, j) => j === i ? nextValue : v);
                                  const dimensionSources = row.dimensionSources.map((v, j) => j === i ? "manual" as DimensionSource : v);
                                  const dimensionOriginals = row.dimensionOriginals.map((v, j) => j === i && row.dimensionSources[i] !== "manual" ? (row.lengths[i] ?? 0) : v);
                                  updateElement(row.id, { lengths, dimensionSources, dimensionOriginals });
                                }}
                              />
                              {row.dimensionSources[i] === "manual" && <small className="dimension-source manual">{(row.dimensionOriginals[i] ?? 0) > 0 ? `Ручное изменение · исходно ${row.dimensionOriginals[i]} мм` : "Ручной ввод"}</small>}
                            </label>
                          ))}
                          <label>
                            Количество, шт
                            <input
                              type="number"
                              min="1"
                              value={row.quantity}
                              onChange={(e) =>
                                updateElement(row.id, {
                                  quantity: Math.max(1, +e.target.value),
                                })
                              }
                            />
                          </label>
                          {row.rule.verticalAngle && (
                            <label className="welding-toggle">
                              Сварка шин
                              <span>
                                <input
                                  type="checkbox"
                                  checked={row.weldedVertical}
                                  disabled={row.code === "CP"}
                                  onChange={(e) =>
                                    updateElement(row.id, {
                                      weldedVertical: e.target.checked,
                                    })
                                  }
                                />
                                {row.code === "CP"
                                  ? "Есть по КД CP · скотч ×2,5 и +12% один раз"
                                  : "Есть · скотч ×2,5 и +12% один раз"}
                              </span>
                            </label>
                          )}
                        </div>
                        <div className="section-rule-note">
                          <strong>{SECTION_RULES_VERSION}</strong>
                          {row.code === "ATT" ? <>
                            <span>ATT: расчёт разрешён по подтверждённой КД для 1000/3200/5000 А, 4P. Выходных токоведущих шин всегда 4 независимо от числа внутренних пакетов.</span>
                            <span>Материал выходных шин — АД0; поликарбонат — {"Ц0000066254"}, 10 мм, 4 изолятора; отверстия в расходе не вычитаются.</span>
                          </> : row.code === "CML" ? <>
                            <span>CML 630–6300 А, 4P/5P: стандартный габарит {CML_STANDARD_OVERALL_MM} мм содержит 2 FE по {CML_STANDARD_FE_MM} мм и центральный конструктив 242 мм.</span>
                            <span>Каждый пакет содержит полный набор проводников: для 4P — 4 КША, для 5P — 5 КША, включая отдельную PE-шину; количество умножается на число пакетов.</span>
                          </> : <>
                            <span>Правило сечения: 6 мм → {BUSWAY_BUS_SECTION_BY_THICKNESS[6].label}; 7 мм → {BUSWAY_BUS_SECTION_BY_THICKNESS[7].label}.</span>
                            <span>
                              L1 + L2 + L3 · {row.rule.sidewallDescription} ·{" "}
                              {row.rule.horizontalAngle
                                ? "скотч ×2,5"
                                : row.rule.verticalAngle
                                  ? row.code === "CP"
                                    ? "сварка подтверждена КД: скотч ×2,5 и +12% один раз"
                                    : "надбавки только при отмеченной сварке"
                                  : "без угловой надбавки"}
                            </span>
                            {row.calc?.peEar && <span>Ухо PE: {row.calc.peEar.designation}, L={row.calc.peEar.lengthMm} мм, 4 шт. из листа АМг3 2,0 мм.</span>}
                          </>}
                          <span>Стыки G в состав секции не включаются; учитываются только отдельными строками спецификации.</span>
                        </div>
                        {row.calc ? (
                          <div className="element-result">
                            <span>
                              Расчётная длина:{" "}
                              <b>{number.format(row.calc.developedMm)} мм</b>
                            </span>
                            <span>
                              За единицу:{" "}
                              <b>{money.format(row.calc.unitCost)}</b>
                            </span>
                            <span>
                              По строке:{" "}
                              <b>{money.format(row.calc.totalCost)}</b>
                            </span>
                          </div>
                        ) : (
                          <div className="resource-missing">
                            {row.code === "ATT"
                              ? `ATT ${row.current} А: материальная модель пока подтверждена только для 4P 1000/3200/5000 А.`
                              : row.code === "CML"
                                ? `CML ${row.current} А ${row.poles}P: нет стандартной конфигурации шин или номинал вне ряда 630–6300 А.`
                                : "Введите хотя бы один размер L1, L2 или L3. До этого строка сохранена в составе, но не участвует в расчёте."}
                          </div>
                        )}
                        {expanded && row.calc && (
                          <div className="element-resources">
                            <div className="bus-calculation">
                              <span>Шины на 1 элемент</span>
                              <strong>
                                {number.format(row.calc.busMass)} кг ·{" "}
                                {number.format(row.calc.busLengthM)} м
                              </strong>
                              <small>
                                {number.format(row.calc.equivalent3m)} экв.
                                заготовки 3 м; целых — {row.calc.stockPieces3m}.
                                Плотность Al: {aluminiumDensity} кг/м³.
                              </small>
                            </div>
                            {row.calc.welding > 0 && (
                              <div className="bus-calculation welding-cost">
                                <span>Сварка шин вертикального угла</span>
                                <strong>
                                  +{money.format(row.calc.welding)} на секцию
                                </strong>
                                <small>
                                  12% один раз от себестоимости секции до
                                  надбавки; электроизоляционный скотч ×2,5.
                                </small>
                              </div>
                            )}
                            <div className="table-wrap">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Группа / ресурс</th>
                                    <th>На 1 элемент</th>
                                    <th>На строку</th>
                                    <th>Стоимость строки</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.calc.items.map((item) => (
                                    <tr key={`${item.group}-${item.name}`}>
                                      <td>
                                        <small>{item.group}</small>
                                        {item.name}
                                      </td>
                                      <td>
                                        {number.format(item.qty)} {item.unit}
                                      </td>
                                      <td>
                                        {number.format(item.qty * row.quantity)}{" "}
                                        {item.unit}
                                      </td>
                                      <td>
                                        {money.format(
                                          item.total * row.quantity,
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                      </div>
                    );
                  })}
                </div>
                <button className="add-element" onClick={addElement}>
                  <span>＋</span> Добавить элемент
                </button>
                <div className="global-field">
                  <label>
                    ФОТ, % от ТМЦ
                    <input
                      type="number"
                      min="0"
                      value={laborRate}
                      onChange={(e) => setLaborRate(+e.target.value)}
                    />
                  </label>
                </div>
                <div className="assumption">
                  <strong>Основание расчёта: {SECTION_RULES_VERSION}</strong>
                  <span>
                    Все типы считаются по правилам файла. Для массы листовых
                    боковин временно используется плотность АМг3 2700 кг/м³ и
                    действующая цена 592,90 ₽/кг — эти два параметра требуют
                    подтверждения.
                  </span>
                </div>
              </div>
              <div className="summary">
                <div className="total-card">
                  <span>
                    {calc.unsupportedRows
                      ? "Себестоимость рассчитанных строк"
                      : "Себестоимость всей сети"}
                  </span>
                  <strong>{money.format(calc.totalCost)}</strong>
                  <small>
                    {calc.calculatedQuantity} из {calc.totalQuantity} элементов
                    рассчитано
                  </small>
                </div>
                <div className="commercial-summary-card">
                  <h3>Цена и управляемые проценты</h3>
                  <div><span>Себестоимость</span><strong>{money.format(calc.totalCost)}</strong></div>
                  <div><span>Технологические потери ({number.format(technologyLossPct)}%)</span><strong>{money.format(commercialCalc.technologyLoss)}</strong></div>
                  <div><span>Себестоимость с тех. потерями</span><strong>{money.format(commercialCalc.costWithTechnologyLoss)}</strong></div>
                  <div><span>Надбавка ({number.format(markupPct)}%)</span><strong>{money.format(commercialCalc.markup)}</strong></div>
                  <div><span>Цена без НДС</span><strong>{money.format(commercialCalc.priceWithoutVat)}</strong></div>
                  <div><span>НДС ({number.format(vatPct)}%)</span><strong>{money.format(commercialCalc.vat)}</strong></div>
                  <div className="commercial-final"><span>Итоговая цена с НДС</span><strong>{money.format(commercialCalc.finalPrice)}</strong></div>
                </div>
                <div className="kpis">
                  <div>
                    <span>ТМЦ</span>
                    <strong>{money.format(calc.materials)}</strong>
                  </div>
                  <div>
                    <span>ФОТ</span>
                    <strong>{money.format(calc.labor)}</strong>
                  </div>
                  <div>
                    <span>Сварка 12%</span>
                    <strong>{money.format(calc.welding)}</strong>
                  </div>
                  <div>
                    <span>Энергоресурсы</span>
                    <strong>{money.format(calc.gas + calc.electricity)}</strong>
                  </div>
                  <div>
                    <span>Масса шин</span>
                    <strong>{number.format(calc.busMass)} кг</strong>
                  </div>
                  <div>
                    <span>Шины 3 м</span>
                    <strong>{calc.busStockPieces} шт.</strong>
                  </div>
                </div>
                <div className="bus-stock-card">
                  <span>Расчёт шин по массе и плотности</span>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Сечение</th>
                          <th>Длина</th>
                          <th>Масса</th>
                          <th>Экв. 3 м</th>
                          <th>Целых 3 м</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calc.busStock.map((row) => (
                          <tr key={row.key}>
                            <td>{row.section}</td>
                            <td>{number.format(row.lengthM)} м</td>
                            <td>{number.format(row.massKg)} кг</td>
                            <td>{number.format(row.equivalent3m)}</td>
                            <td>
                              <strong>{row.stockPieces3m} шт.</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <small>
                    Целое количество округлено вверх по каждому сечению, без
                    оптимизации карты раскроя.
                  </small>
                </div>
                <button
                  className="primary"
                  onClick={saveCalculation}
                  disabled={!calc.calculatedQuantity}
                >
                  Сохранить расчёт сети <span>→</span>
                </button>
                {status && <p className="status">{status}</p>}
              </div>
            </div>
            <div className="panel composition">
              <div className="panel-title">
                <div>
                  <span>02</span>
                  <h2>Сводный ресурсный состав</h2>
                </div>
                <div className="resource-export-actions">
                  <small>{calc.items.length + jointCalc.lines.length} позиций</small>
                  <button type="button" className="primary resource-export-button" onClick={exportProjectResourceSpecification}>Выгрузить ресурсную спецификацию в Excel — весь проект</button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Группа / наименование</th>
                      <th>Количество</th>
                      <th>Ед.</th>
                      <th>Цена</th>
                      <th>Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calc.items.map((i) => (
                      <tr key={`${i.group}-${i.name}-${i.price}`}>
                        <td>
                          <small>{i.group}</small>
                          {i.name}
                        </td>
                        <td>{number.format(i.qty)}</td>
                        <td>{i.unit}</td>
                        <td>{money.format(i.price)}</td>
                        <td>{money.format(i.total)}</td>
                      </tr>
                    ))}
                    {jointCalc.lines.map((line, index) => (
                      <tr key={`joint-resource-${line.designation}-${line.name}-${index}`}>
                        <td><small>{line.group} · стык G</small>{line.code ? `${line.code} · ` : ""}{line.designation ? `${line.designation} · ` : ""}{line.name}</td>
                        <td>{number.format(line.qty)}</td>
                        <td>{line.unit}</td>
                        <td>—</td>
                        <td>—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        {(active === "materials" || active === "procurement") && <>
          <MultiProjectSelector projects={productionProjectOptions} selected={selectedProductionProjects} onChange={setSelectedProductionProjects} />
          <MaterialsPlanningPanel
            mode={active === "materials" ? "requirements" : "procurement"}
            projectName={projectName}
            items={combinedProjectItems}
            stock={stock}
            setStock={setStock}
            stockSource={stockSource}
            setStockSource={setStockSource}
            onOpenRequirements={() => setActive("materials")}
            onOpenProcurement={() => setActive("procurement")}
            onPersistStock={persistStock}
            activeProjectKeys={selectedProductionProjects.length ? selectedProductionProjects : [projectName]}
            selectedOrderLabels={selectedProductionOrderLabels}
            calculationScenarioLabel={nominalScenarioStep === 0 ? "Исходный номинал" : nominalScenarioStep === 1 ? "На 1 номинал ниже" : "На 2 номинала ниже"}
            comparisonComponents={procurementComparisonComponents}
          />
        </>}
        {active === "reservations" && <ReservationsPanel demands={reservationDemands} availability={reservationAvailability} />}
        {active === "illiquid" && <IlliquidPanel />}
        {active === "analytics" && (
          <div className="panel composition">
            <div className="panel-title">
              <div>
                <span>◷</span>
                <h2>Сохранённые расчёты</h2>
              </div>
              <small>{history.length} записей</small>
            </div>
            {history.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Дата / проект</th>
                      <th>Артикул / элемент</th>
                      <th>Кол-во</th>
                      <th>За единицу</th>
                      <th>Всего</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <small>
                            {new Date(h.createdAt).toLocaleDateString("ru-RU")}
                          </small>
                          {h.projectName}
                        </td>
                        <td>{h.sectionName}</td>
                        <td>{h.quantity}</td>
                        <td>{money.format(h.unitCost)}</td>
                        <td>{money.format(h.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">Сохранённых расчётов пока нет.</div>
            )}
          </div>
        )}
        {active === "analytics" && (
          <div className="stats-grid">
            <div className="metric">
              <span>Расчётов</span>
              <strong>{history.length}</strong>
              <small>в базе</small>
            </div>
            <div className="metric">
              <span>Средняя себестоимость</span>
              <strong>{money.format(avg)}</strong>
              <small>на элемент</small>
            </div>
            <div className="metric">
              <span>Сумма проектов</span>
              <strong>
                {money.format(history.reduce((s, h) => s + h.totalCost, 0))}
              </strong>
              <small>по сохранённым расчётам</small>
            </div>
            <div className="panel chart">
              <h2>Структура текущей себестоимости</h2>
              {[
                ["ТМЦ", calc.materials],
                ["ФОТ", calc.labor],
                ["Сварка", calc.welding],
                ["Энергия", calc.gas + calc.electricity],
              ].map(([n, v]) => (
                <div className="bar" key={String(n)}>
                  <span>{n}</span>
                  <i>
                    <b
                      style={{
                        width: `${calc.totalCost ? (Number(v) / calc.totalCost) * 100 : 0}%`,
                      }}
                    />
                  </i>
                  <strong>
                    {calc.totalCost
                      ? Math.round((Number(v) / calc.totalCost) * 100)
                      : 0}
                    %
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
