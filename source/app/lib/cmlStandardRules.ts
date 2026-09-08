export type CmlPoleCount = 4 | 5;

export type CmlBusConfig = {
  count: number;
  height: number;
  thickness: number;
};

export type CmlResourceLine = {
  name: string;
  unit: string;
  qty: number;
  price: number;
  group: string;
  massKg?: number;
  stockLengthM?: number;
  metricBasis?: string;
};

export const CML_STANDARD_OVERALL_MM = 1500;
export const CML_STANDARD_CENTER_MM = 242;
export const CML_STANDARD_FE_MM = (CML_STANDARD_OVERALL_MM - CML_STANDARD_CENTER_MM) / 2;
export const CML_SUPPORTED_CURRENTS = [630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300] as const;

const ALUMINIUM_DENSITY_KG_M3 = 2700;
const FLEXIBLE_PLATE_THICKNESS_MM = 0.3;
const PET_TAPE_CODE = "Ц0000078237";
const PET_TAPE_NAME = "Плёнка ПЭТ-Э 250 мкм";
const PE_SHEET_CODE = "Ц0000069668";

const thermalShrinkCatalog = [
  { minMm: 20, maxMm: 75, code: "0T-00130015", name: "Термоусаживаемая трубка ТТШт 75/25 35 кВ 2,5:1 красная IEK" },
  { minMm: 30, maxMm: 95, code: "0T-00130016", name: "Термоусаживаемая трубка ТТШт 95/30 35 кВ 2,5:1 красная IEK" },
  { minMm: 40, maxMm: 120, code: "0T-00130009", name: "Термоусаживаемая трубка ТТШт 120/40 35 кВ 2,5:1 красная 1м IEK" },
  { minMm: 58, maxMm: 180, code: "0T-00130010", name: "Термоусаживаемая трубка ТТШт 180/58 35 кВ 2,5:1 красная 1м IEK" },
];

const isSupportedCurrent = (current: number) =>
  (CML_SUPPORTED_CURRENTS as readonly number[]).includes(current);

const selectThermalShrink = (widthMm: number) =>
  thermalShrinkCatalog
    .filter((item) => widthMm >= item.minMm && widthMm <= item.maxMm)
    .sort((left, right) => left.maxMm - right.maxMm)[0] ?? {
      minMm: 0,
      maxMm: widthMm,
      code: "",
      name: `Термоусаживаемая трубка КША B=${widthMm} мм, красная, 35 кВ — код 1С ожидается`,
    };

export function getCmlStandardFeMm(overallMm = CML_STANDARD_OVERALL_MM) {
  const value = (overallMm - CML_STANDARD_CENTER_MM) / 2;
  if (!(value > 0)) throw new Error("CML: длина прямого участка FE должна быть больше 0 мм");
  return value;
}

export function calculateCmlStandard(
  current: number,
  poles: CmlPoleCount,
  config: CmlBusConfig,
  overallMm = CML_STANDARD_OVERALL_MM,
) {
  if (!isSupportedCurrent(current)) throw new Error(`CML ${current} А: номинал вне утверждённого ряда 630–6300 А`);
  if (poles !== 4 && poles !== 5) throw new Error("CML: поддерживается только 4P или 5P");
  if (!(config.count > 0 && config.height > 0 && config.thickness > 0)) throw new Error("CML: отсутствует стандартная конфигурация шин");

  const feMm = getCmlStandardFeMm(overallMm);
  const flexibleMm = 150;
  // Каждая физическая шина имеет собственный гибкий проводник. Для 5P PE
  // повторяется в каждом пакете точно так же, как L1/L2/L3/N.
  const kshaCount = poles * config.count;
  const insulatedKshaCount = 4 * config.count;
  const mountingNodeCount = poles;
  const currentPerPackage = current / config.count;
  // 630 A подтверждён КД: 21 пластина АД1М 0,3×100. Для более нагруженного
  // пакета сохраняется действующее правило CML 3200: 26 пластин.
  const platesPerKsha = currentPerPackage <= 1000 ? 21 : 26;
  const plateWidthMm = Math.max(100, config.height);
  // 630 A: два наконечника по 35 мм; двухпакетный 3200 A: 100+120 мм.
  // Для четырёх пакетов применяется тот же двухпакетный узел попарно.
  const contactLengthPerKshaMm = config.count === 1 ? 70 : config.count === 2 ? 220 : 440;
  const contactMassKg =
    (contactLengthPerKshaMm / 1000) * kshaCount *
    (config.thickness / 1000) * (config.height / 1000) * ALUMINIUM_DENSITY_KG_M3;
  const flexibleMassKg =
    kshaCount * platesPerKsha * (flexibleMm / 1000) *
    (FLEXIBLE_PLATE_THICKNESS_MM / 1000) * (plateWidthMm / 1000) * ALUMINIUM_DENSITY_KG_M3;
  const tapeLengthM = insulatedKshaCount * 2 * flexibleMm / 1000;
  const thermalShrinkLengthM = insulatedKshaCount * (flexibleMm + 30) / 1000;
  const thermalShrink = selectThermalShrink(plateWidthMm);
  const confirmedVariant = current === 630 && poles === 5
    ? "131.06.CML.011.000.000СБ"
    : current === 3200 && poles === 4
      ? "утверждённая модель CML 3200 4P"
      : "масштабирование стандартного конструктива CML по таблице шин";
  const coverMassKg = current === 630 ? 2.3 : 2.22;
  const pePlateMassKg = current === 630 ? 0.2 : current === 3200 ? 1 : Math.max(0.2, 0.2 * config.count);

  const lines: CmlResourceLine[] = [
    {
      name: `КША · контактные наконечники АД0 ${config.thickness}×${config.height}`,
      unit: "кг", qty: contactMassKg, price: 450, group: "CML · КША",
      massKg: contactMassKg, stockLengthM: kshaCount * contactLengthPerKshaMm / 1000,
      metricBasis: `${kshaCount} отдельных КША = ${poles} проводников × ${config.count} пак.; ${confirmedVariant}`,
    },
    {
      name: `КША · гибкие пластины АД1М ${FLEXIBLE_PLATE_THICKNESS_MM}×${plateWidthMm}×${flexibleMm} мм`,
      unit: "кг", qty: flexibleMassKg, price: 0, group: "CML · КША", massKg: flexibleMassKg,
      metricBasis: `${kshaCount} КША × ${platesPerKsha} пластин; PE для 5P учтена в каждом пакете; код/цена АД1М ожидают сопоставления`,
    },
    {
      name: `${PET_TAPE_CODE} · ${PET_TAPE_NAME}`,
      unit: "м", qty: tapeLengthM, price: 0, group: "CML · КША",
      metricBasis: `${insulatedKshaCount} изолируемых КША A/B/C/N × 2 × ${flexibleMm} мм; PE-шина 5P ПЭТ не изолируется`,
    },
    {
      name: `${thermalShrink.code ? `${thermalShrink.code} · ` : ""}${thermalShrink.name}`,
      unit: "м", qty: thermalShrinkLengthM, price: 0, group: "CML · КША",
      metricBasis: `один отрезок на каждый из ${insulatedKshaCount} изолируемых КША A/B/C/N; L=${flexibleMm}+30 мм`,
    },
    {
      name: `${PE_SHEET_CODE} · Пластины PE CML · лист АМг3 2,0`,
      unit: "кг", qty: pePlateMassKg, price: 592.9, group: "CML · постоянная часть", massKg: pePlateMassKg,
      metricBasis: `${confirmedVariant}; исходный материал пластины PE`,
    },
    {
      name: "Крышки CML · лист ОЦ БТ-ПН-НО-1,5 ГОСТ 19904-2015",
      unit: "кг", qty: coverMassKg, price: 0, group: "CML · постоянная часть", massKg: coverMassKg,
      metricBasis: `2 крышки; ${confirmedVariant}; код/цена оцинкованного листа ожидают сопоставления`,
    },
    {
      name: "Гаскетинг крышек CML",
      unit: "кг", qty: 0.08, price: 0, group: "CML · постоянная часть", massKg: 0.08,
      metricBasis: "2 × 0,04 кг; отдельный гаскетинг CML, не стык G",
    },
    {
      name: "Ц0000056270 · Болт с фланцем M6×12 DIN 6921 · сборка CML",
      unit: "шт", qty: 4, price: 2.1, group: "CML · постоянная часть",
      metricBasis: `${confirmedVariant}; стыки G в ресурсный состав CML не включаются`,
    },
    {
      name: "Производственная норма сборки CML/КША — требуется сопоставление",
      unit: "норма", qty: 1, price: 0, group: "Работы",
      metricBasis: "материалы рассчитаны; время операций берётся только из ведомости производственных работ",
    },
  ];

  return {
    current, poles, overallMm, feMm, flexibleMm, kshaCount, insulatedKshaCount, mountingNodeCount,
    platesPerKsha, plateWidthMm, contactWidthMm: config.height,
    contactThicknessMm: config.thickness, contactLengthPerKshaMm,
    contactMassKg, flexibleMassKg, tapeLengthM, thermalShrinkLengthM,
    thermalShrink, confirmedVariant, lines,
  };
}
