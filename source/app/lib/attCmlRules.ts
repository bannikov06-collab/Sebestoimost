export type SpecializedResourceLine = {
  name: string;
  unit: string;
  qty: number;
  price: number;
  group: string;
  metricBasis: string;
  massKg?: number;
  stockLengthM?: number;
};

export const ALUMINIUM_DENSITY_KG_M3 = 2700;
export const POLYCARBONATE_CODE = "Ц0000066254";
export const PE_AMG3_20_CODE = "Ц0000069668";
export const KSHA_TAPE_CODE = "Ц0000077668";
export const KSHA_TAPE_NAME = "Скотч электротехнический армированный GM-3828 25 мм";
export const CML_3200_STANDARD_OVERALL_MM = 1500;
export const CML_3200_STANDARD_FE_MM = 629;
export const CML_3200_STANDARD_FLEXIBLE_MM = 150;
export const KSHA_CONTACT_1_MM = 100;
export const KSHA_CONTACT_2_MM = 120;
export const KSHA_FLEX_PLATE_THICKNESS_MM = 0.3;
export const KSHA_BASE_FLEX_THICKNESS_MM = 7;
export const KSHA_CONDUCTIVITY_RESERVE = 1.10;
export const KSHA_PLATES_PER_UNIT = Math.ceil(
  (KSHA_BASE_FLEX_THICKNESS_MM * KSHA_CONDUCTIVITY_RESERVE) /
    KSHA_FLEX_PLATE_THICKNESS_MM,
);

export type ThermalShrinkRule = {
  minMm: number;
  maxMm: number;
  code: string;
  name: string;
};

const thermalShrinkRules: ThermalShrinkRule[] = [
  { minMm: 10, maxMm: 25, code: "0T-00130011", name: "Термоусаживаемая трубка ТТШт 25/10 35 кВ 2,5:1 красная IEK" },
  { minMm: 16, maxMm: 40, code: "0T-00130012", name: "Термоусаживаемая трубка ТТШт 40/16 35 кВ 2,5:1 красная IEK" },
  { minMm: 16, maxMm: 55, code: "0T-00130013", name: "Термоусаживаемая трубка ТТШт 55/16 35 кВ 2,5:1 красная IEK" },
  { minMm: 25, maxMm: 65, code: "0T-00130014", name: "Термоусаживаемая трубка ТТШт 65/25 35 кВ 2,5:1 красная IEK" },
  { minMm: 25, maxMm: 75, code: "0T-00130015", name: "Термоусаживаемая трубка ТТШт 75/25 35 кВ 2,5:1 красная IEK" },
  { minMm: 30, maxMm: 95, code: "0T-00130016", name: "Термоусаживаемая трубка ТТШт 95/30 35 кВ 2,5:1 красная IEK" },
  { minMm: 40, maxMm: 120, code: "0T-00130009", name: "Термоусаживаемая трубка ТТШт 120/40 35 кВ 2,5:1 красная 1м IEK" },
  { minMm: 58, maxMm: 180, code: "0T-00130010", name: "Термоусаживаемая трубка ТТШт 180/58 35 кВ 2,5:1 красная 1м IEK" },
];

export function selectThermalShrink(requiredMm: number): ThermalShrinkRule {
  const found = thermalShrinkRules
    .filter((rule) => requiredMm >= rule.minMm && requiredMm <= rule.maxMm)
    .sort((left, right) => left.maxMm - right.maxMm)[0];
  return found ?? {
    minMm: 0,
    maxMm: requiredMm,
    code: "",
    name: `Термоусаживаемая трубка КША B=${requiredMm} мм, красная, 35 кВ — новая позиция, код 1С ожидается`,
  };
}

export type Cml3200Result = {
  overallMm: number;
  flexibleMm: number;
  kshaCount: number;
  mountingNodeCount: number;
  platesPerKsha: number;
  plateWidthMm: number;
  contactWidthMm: number;
  contactThicknessMm: number;
  contactLengthPerKshaMm: number;
  contactMassKg: number;
  flexibleMassKg: number;
  tapeLengthM: number;
  thermalShrinkLengthM: number;
  thermalShrink: ThermalShrinkRule;
  lines: SpecializedResourceLine[];
};

export function calculateCml3200(overallMm = CML_3200_STANDARD_OVERALL_MM, poles = 4): Cml3200Result {
  if (poles !== 4) throw new Error("CML: утверждённая материальная модель сейчас только для 4P");
  const normalized = overallMm > 0 ? overallMm : CML_3200_STANDARD_OVERALL_MM;
  const flexibleMm = CML_3200_STANDARD_FLEXIBLE_MM + (normalized - CML_3200_STANDARD_OVERALL_MM);
  if (flexibleMm <= 0) throw new Error("CML 3200: длина гибкой части КША должна быть больше 0 мм");

  const kshaPerConductor = 2;
  const kshaCount = poles * kshaPerConductor;
  const mountingNodeCount = poles;
  const plateWidthMm = 160;
  const contactWidthMm = 160;
  const contactThicknessMm = 6;
  const contactLengthPerKshaMm = KSHA_CONTACT_1_MM + KSHA_CONTACT_2_MM;
  const contactMassKg =
    kshaCount *
    (contactLengthPerKshaMm / 1000) *
    (contactThicknessMm / 1000) *
    (contactWidthMm / 1000) *
    ALUMINIUM_DENSITY_KG_M3;
  const flexibleMassKg =
    kshaCount *
    KSHA_PLATES_PER_UNIT *
    (flexibleMm / 1000) *
    (KSHA_FLEX_PLATE_THICKNESS_MM / 1000) *
    (plateWidthMm / 1000) *
    ALUMINIUM_DENSITY_KG_M3;
  const tapeLengthM = (kshaCount * 2 * flexibleMm) / 1000;
  const thermalShrinkLengthM = (kshaCount * (flexibleMm + 30)) / 1000;
  const thermalShrink = selectThermalShrink(contactWidthMm);

  const lines: SpecializedResourceLine[] = [
    {
      name: `Ц0000072624 · КША · контактные наконечники АД0 ${contactThicknessMm}×${contactWidthMm}; L=${KSHA_CONTACT_1_MM}+${KSHA_CONTACT_2_MM} мм`,
      unit: "кг",
      qty: contactMassKg,
      price: 450,
      group: "CML · КША",
      massKg: contactMassKg,
      stockLengthM: (kshaCount * contactLengthPerKshaMm) / 1000,
      metricBasis: `${kshaCount} отдельных КША по материалу; сечение наконечников как у основной шины; изготовление ${mountingNodeCount} объединённых монтажных узлов`,
    },
    {
      name: `КША · гибкие пластины АД1М ${KSHA_FLEX_PLATE_THICKNESS_MM}×${plateWidthMm}×${flexibleMm} мм`,
      unit: "кг",
      qty: flexibleMassKg,
      price: 0,
      group: "CML · КША",
      massKg: flexibleMassKg,
      metricBasis: `${kshaCount} КША × ${KSHA_PLATES_PER_UNIT} пластин; фактическая толщина пакета ${(KSHA_PLATES_PER_UNIT * KSHA_FLEX_PLATE_THICKNESS_MM).toFixed(1)} мм; запас по проводимости ${((KSHA_PLATES_PER_UNIT * KSHA_FLEX_PLATE_THICKNESS_MM / KSHA_BASE_FLEX_THICKNESS_MM - 1) * 100).toFixed(2)}%; код/цена АД1М 0,3 мм ожидают сопоставления`,
    },
    {
      name: `${KSHA_TAPE_CODE} · ${KSHA_TAPE_NAME}`,
      unit: "м",
      qty: tapeLengthM,
      price: 0,
      group: "CML · КША",
      metricBasis: `верхний и нижний торец каждого КША по всей гибкой длине: ${kshaCount} × 2 × ${flexibleMm} мм; код 1С подтверждён`,
    },
    {
      name: `${thermalShrink.code ? `${thermalShrink.code} · ` : ""}${thermalShrink.name}`,
      unit: "м",
      qty: thermalShrinkLengthM,
      price: 0,
      group: "CML · КША",
      metricBasis: `1 отдельный отрезок на каждый КША; L=${flexibleMm}+30 мм (+15 мм с каждой стороны); подбор по рабочему диапазону`,
    },
    {
      name: `${PE_AMG3_20_CODE} · 132.32.CML.001.001 · Пластина PE · лист АМг3 2,0`,
      unit: "кг",
      qty: 1,
      price: 592.9,
      group: "CML · постоянная часть",
      massKg: 1,
      metricBasis: "2 шт. × 0,5 кг; код исходного листа такой же, как у уха PE секций",
    },
    {
      name: "132.12.CML.001.201 · Крышка · лист ОЦ БТ-ПН-НО-1,5 ГОСТ 19904-2015",
      unit: "кг",
      qty: 2.22,
      price: 0,
      group: "CML · постоянная часть",
      massKg: 2.22,
      metricBasis: "2 шт. × 1,11 кг по КД; код/цена оцинкованного листа пока не сопоставлены",
    },
    {
      name: "Гаскетинг крышки 132.12.CML.001.200",
      unit: "кг",
      qty: 0.08,
      price: 0,
      group: "CML · постоянная часть",
      massKg: 0.08,
      metricBasis: "2 шт. × 0,04 кг по КД; это отдельный гаскетинг крышки, не правило стыка G",
    },
    {
      name: "Ц0000056270 · Болт с фланцем M6×12 DIN 6921 · основная сборка CML",
      unit: "шт",
      qty: 4,
      price: 2.1,
      group: "CML · постоянная часть",
      metricBasis: "количество по 132.32.CML.001.000; G из состава секции исключён бизнес-правилом",
    },
    {
      name: "Производственная норма сборки CML/КША — требуется сопоставление",
      unit: "норма",
      qty: 1,
      price: 0,
      group: "Работы",
      metricBasis: "материальная модель утверждена; время операций не выдумывается и должно подтягиваться из ведомости производственных работ",
    },
  ];

  return {
    overallMm: normalized,
    flexibleMm,
    kshaCount,
    mountingNodeCount,
    platesPerKsha: KSHA_PLATES_PER_UNIT,
    plateWidthMm,
    contactWidthMm,
    contactThicknessMm,
    contactLengthPerKshaMm,
    contactMassKg,
    flexibleMassKg,
    tapeLengthM,
    thermalShrinkLengthM,
    thermalShrink,
    lines,
  };
}

type AttRule = {
  designation: string;
  current: number;
  packs: number;
  busWidthMm: number;
  busThicknessMm: number;
  busCode: string;
  outputBusMassKg: number;
  insulatorMassKg: number;
  extraLines: SpecializedResourceLine[];
  multiPackBlankMm?: number;
};

const ATT_RULES: Record<number, AttRule> = {
  1000: {
    designation: "132.10.ATT.013.000.000",
    current: 1000,
    packs: 1,
    busWidthMm: 100,
    busThicknessMm: 6,
    busCode: "Ц0000072703",
    outputBusMassKg: 6.9,
    insulatorMassKg: 0.44,
    extraLines: [
      { name: "Ц0000069207 · Шина PE ATT 1000 · лист АМг3 3,0", unit: "кг", qty: 0.2, price: 592.9, group: "ATT · постоянная часть", massKg: 0.2, metricBasis: "2 шт. × 0,10 кг по 132.10.ATT.013.000.001" },
      { name: "Ц0000070687 · Стенки ATT 1000 · лист АМг3 2,0", unit: "кг", qty: 2.6, price: 592.9, group: "ATT · корпус", massKg: 2.6, metricBasis: "132.10.ATT.013.000.004/.005: 1,30 + 1,30 кг" },
      { name: "Ц0000069207 · Крышки ATT 1000 · лист АМг3 3,0", unit: "кг", qty: 4.06, price: 592.9, group: "ATT · корпус", massKg: 4.06, metricBasis: "132.10.ATT.013.000.006/.007: 1,98 + 2,08 кг" },
      { name: "Ц0000070687 · Заглушка ATT 1000 · лист АМг3 2,0", unit: "кг", qty: 0.1, price: 592.9, group: "ATT · корпус", massKg: 0.1, metricBasis: "132.10.ATT.013.000.008: 0,10 кг" },
      { name: `${PE_AMG3_20_CODE} · 03.160.019-04 · Ухо PE ATT 1000 · собственное производство`, unit: "кг", qty: 0.16, price: 592.9, group: "ATT · изготовляемые детали", massKg: 0.16, metricBasis: "2 шт. × 0,08 кг; код относится к исходному листу АМг3 2,0" },
      { name: "03.045.013 · Вставка ATT 1000", unit: "шт", qty: 2, price: 0, group: "ATT · постоянная часть", metricBasis: "количество по основной КД; цена/код сопоставляются из номенклатуры" },
      { name: "Крепёж ATT 1000 · позиции 17–19 основной КД", unit: "компл.", qty: 1, price: 0, group: "ATT · крепёж", metricBasis: "неизвлечённые обозначения не подменяются догадкой; количества КД сохранены в источнике" },
    ],
  },
  3200: {
    designation: "132.32.ATT.011.000.000",
    current: 3200,
    packs: 2,
    busWidthMm: 160,
    busThicknessMm: 6,
    busCode: "Ц0000072624",
    outputBusMassKg: 40.3,
    insulatorMassKg: 0.36,
    extraLines: [
      { name: "Стенки ATT 3200 · 132.32.ATT.011.000.005/.005-01", unit: "кг", qty: 8.96, price: 0, group: "ATT · корпус", massKg: 8.96, metricBasis: "4 детали × 2,24 кг по КД; материал/код не подменяются без подтверждения" },
      { name: "Ц0000069207 · Крышка ATT 3200 · 132.32.ATT.011.000.006 · АМг3 3,0", unit: "кг", qty: 5.1, price: 592.9, group: "ATT · корпус", massKg: 5.1, metricBasis: "2 шт. × 2,55 кг" },
      { name: "Крышки ATT 3200 · 132.32.ATT.011.000.007/.007-01", unit: "кг", qty: 4.76, price: 0, group: "ATT · корпус", massKg: 4.76, metricBasis: "2,38 + 2,38 кг; материал/код не подменяются без подтверждения" },
      { name: "Ц0000070687 · Заглушка ATT 3200 · АМг3 2,0", unit: "кг", qty: 0.31, price: 592.9, group: "ATT · корпус", massKg: 0.31, metricBasis: "132.32.ATT.011.000.008: 0,31 кг" },
      { name: `${PE_AMG3_20_CODE} · 03.160.019-11 · Ухо PE ATT 3200 · собственное производство`, unit: "кг", qty: 0.5, price: 592.9, group: "ATT · изготовляемые детали", massKg: 0.5, metricBasis: "2 шт. × 0,25 кг; код исходного листа АМг3 2,0" },
      { name: "22.32.ATTCP.013.013 · Шина PE ATT 3200", unit: "кг", qty: 1.24, price: 0, group: "ATT · постоянная часть", massKg: 1.24, metricBasis: "2 шт. × 0,62 кг по основной КД; материал/код ожидают сопоставления" },
      { name: "01.012.011 · Соединитель в сборе ATT 3200", unit: "шт", qty: 3, price: 0, group: "ATT · постоянная часть", metricBasis: "отдельная позиция ATT; не является автоматическим добавлением стыка G" },
      { name: "03.045.013 · Вставка ATT 3200", unit: "шт", qty: 2, price: 0, group: "ATT · постоянная часть", metricBasis: "количество по основной КД" },
      { name: "Ц0000056270 · Болт M6×12 DIN 6921 ATT 3200", unit: "шт", qty: 8, price: 2.1, group: "ATT · крепёж", metricBasis: "позиция 22 основной КД" },
      { name: "Остальной крепёж ATT 3200 по основной КД", unit: "компл.", qty: 1, price: 0, group: "ATT · крепёж", metricBasis: "M6×20, M8×16, DIN 912 M8×50/M8×60, гайки и заклёпки; коды 1С должны сопоставляться без догадок" },
    ],
  },
  5000: {
    designation: "132.50.ATT.011.000.000",
    current: 5000,
    packs: 4,
    busWidthMm: 130,
    busThicknessMm: 6,
    busCode: "Ц0000078399",
    outputBusMassKg: 81.9,
    insulatorMassKg: 0.8,
    multiPackBlankMm: 682,
    extraLines: [
      { name: "Ц0000070687 · Боковины ATT 5000 · лист АМг3 2,0", unit: "кг", qty: 17.2, price: 592.9, group: "ATT · корпус", massKg: 17.2, metricBasis: "2 шт. × 8,6 кг по основной КД" },
      { name: "Ц0000069207 · Крышки ATT 5000 · лист АМг3 3,0", unit: "кг", qty: 5.5, price: 592.9, group: "ATT · корпус", massKg: 5.5, metricBasis: "2,9 + 2,6 кг по основной КД" },
      { name: `${PE_AMG3_20_CODE} · 132.50.ATT.011.000.005 · Ухо PE ATT 5000`, unit: "кг", qty: 0.86, price: 592.9, group: "ATT · изготовляемые детали", massKg: 0.86, metricBasis: "2 шт. × 0,43 кг; собственное производство из АМг3 2,0" },
      { name: "Ц0000069207 · Заглушка ATT 5000 · АМг3 3,0", unit: "кг", qty: 0.8, price: 592.9, group: "ATT · корпус", massKg: 0.8, metricBasis: "132.50.ATT.011.000.006: 0,8 кг" },
      { name: "Шина PE ATT 5000 · АД0 7,0", unit: "кг", qty: 0.8, price: 450, group: "ATT · постоянная часть", massKg: 0.8, metricBasis: "2 шт. × 0,4 кг по 132.50.ATT.011.000.011; код 1С конкретной заготовки не подтверждён" },
      { name: "03.045.013 · Вставка ATT 5000", unit: "шт", qty: 4, price: 0, group: "ATT · постоянная часть", metricBasis: "количество по основной КД" },
      { name: "Ц0000056270 · Болт M6×12 DIN 6921 ATT 5000", unit: "шт", qty: 16, price: 2.1, group: "ATT · крепёж", metricBasis: "позиция 19 основной КД" },
      { name: "Ц0000039669 · Заклёпка 4,8×10 ATT 5000", unit: "шт", qty: 40, price: 1.11, group: "ATT · крепёж", metricBasis: "позиция 20 основной КД" },
      { name: "УТ000003151 · Болт M6×16 DIN 6921 ATT 5000", unit: "шт", qty: 8, price: 2.2, group: "ATT · крепёж", metricBasis: "позиция 28 основной КД" },
      { name: "Остальной крепёж ATT 5000 по основной КД", unit: "компл.", qty: 1, price: 0, group: "ATT · крепёж", metricBasis: "M6×30, M16×45, шайбы и гайки; без выдуманных кодов 1С" },
    ],
  },
};

export type AttCalculationResult = {
  designation: string;
  current: number;
  packs: number;
  outputBusCount: number;
  busWidthMm: number;
  busThicknessMm: number;
  outputBusMassKg: number;
  insulatorCount: number;
  insulatorMassKg: number;
  multiPackBlankMm?: number;
  polycarbonateReferenceMm?: number;
  lines: SpecializedResourceLine[];
};

export function calculateAtt(current: number, poles = 4): AttCalculationResult | null {
  if (poles !== 4) return null;
  const rule = ATT_RULES[current];
  if (!rule) return null;
  const outputBusCount = 4;
  const insulatorCount = 4;
  const polycarbonateReferenceMm = rule.multiPackBlankMm ? rule.multiPackBlankMm + 80 : undefined;
  const lines: SpecializedResourceLine[] = [
    {
      name: `${rule.busCode} · ATT ${current} · выходные токоведущие шины АД0 ${rule.busThicknessMm}×${rule.busWidthMm}`,
      unit: "кг",
      qty: rule.outputBusMassKg,
      price: 450,
      group: "ATT · токоведущая часть",
      massKg: rule.outputBusMassKg,
      metricBasis: `${outputBusCount} выходных проводника независимо от ${rule.packs} пакетов; материал АД0 утверждён пользователем; масса по КД/дочерним сборкам${rule.multiPackBlankMm ? `; для >2 пакетов контрольный габарит листовой конструкции H=${rule.multiPackBlankMm} мм, электрическое сечение для расчёта остаётся ${rule.busThicknessMm}×${rule.busWidthMm}` : ""}`,
    },
    {
      name: `${POLYCARBONATE_CODE} · ATT ${current} · изолятор поликарбонат 10 мм`,
      unit: "кг",
      qty: rule.insulatorMassKg,
      price: 0,
      group: "ATT · изоляция",
      massKg: rule.insulatorMassKg,
      metricBasis: `${insulatorCount} изолятора по числу выходных шин; отверстия не вычитаются; масса КД используется как контроль до полного геометрического пересчёта${polycarbonateReferenceMm ? `; для многопакетной ATT контрольный размер по правилу Hшины+80 = ${polycarbonateReferenceMm} мм` : ""}`,
    },
    ...rule.extraLines,
    {
      name: `Производственная норма ATT ${current} · требуется сопоставление`,
      unit: "норма",
      qty: 1,
      price: 0,
      group: "Работы",
      metricBasis: "материальная модель и BOM собраны по КД; времена операций не назначаются без ведомости производственных работ",
    },
  ];
  return {
    designation: rule.designation,
    current,
    packs: rule.packs,
    outputBusCount,
    busWidthMm: rule.busWidthMm,
    busThicknessMm: rule.busThicknessMm,
    outputBusMassKg: rule.outputBusMassKg,
    insulatorCount,
    insulatorMassKg: rule.insulatorMassKg,
    multiPackBlankMm: rule.multiPackBlankMm,
    polycarbonateReferenceMm,
    lines,
  };
}

export function isApprovedAttCurrent(current: number) {
  return Boolean(ATT_RULES[current]);
}
