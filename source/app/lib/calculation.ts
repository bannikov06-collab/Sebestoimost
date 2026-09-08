import { calculatePeEarBlank, getJointRule } from "./manufacturingRules.ts";

export type SectionCode = "FE" | "CD" | "CP" | "ZD" | "ZP" | "TP" | "ZDP" | "TD" | "ATSC" | "ATCP" | "ATCD";

export type NetworkElement = {
  id: number;
  code: SectionCode;
  current: number;
  lengths: number[];
  quantity: number;
  jointQuantity?: number;
};

export type Item = {
  code: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
  group: string;
  confidence: "Подтверждено" | "Расчётно" | "Требует уточнения";
  note?: string;
};

export const currents = [160, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300];

export const bus: Record<number, { count: number; height: number; thickness: number }> = {
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

export const sectionInfo: Record<SectionCode, { name: string; dims: number; step: number; defaults: Record<number, number[]> }> = {
  FE: { name: "Прямая секция", dims: 1, step: 10, defaults: Object.fromEntries(currents.map((i) => [i, [3000]])) },
  CD: { name: "Угловая горизонтальная", dims: 2, step: 50, defaults: Object.fromEntries(currents.map((i) => [i, [435, 435]])) },
  CP: { name: "Угловая вертикальная", dims: 2, step: 50, defaults: { 160:[300,300],250:[300,300],315:[300,300],400:[300,300],500:[300,300],630:[300,300],800:[300,300],1000:[450,450],1250:[450,450],1600:[450,450],2000:[450,450],2500:[600,600],3200:[650,650],4000:[750,750],5000:[950,950],6300:[1100,1100] } },
  ZD: { name: "Z-образная горизонтальная", dims: 3, step: 50, defaults: Object.fromEntries(currents.map((i) => [i, [435, 415, 435]])) },
  ZP: { name: "Z-образная вертикальная", dims: 3, step: 50, defaults: { 160:[300,180,300],250:[300,180,300],315:[300,180,300],400:[300,180,300],500:[300,180,300],630:[300,220,300],800:[300,260,300],1000:[450,260,450],1250:[450,300,450],1600:[450,340,450],2000:[450,380,450],2500:[600,480,600],3200:[650,550,650],4000:[750,630,750],5000:[950,850,950],6300:[1100,970,1100] } },
  TP: { name: "Тройниковая вертикальная", dims: 3, step: 50, defaults: { 160:[530,300,265],250:[530,300,265],315:[530,300,265],400:[530,300,265],500:[530,300,265],630:[530,300,265],800:[530,300,265],1000:[760,450,380],1250:[730,450,365],1600:[700,450,350],2000:[660,450,330],2500:[850,600,425],3200:[890,650,445],4000:[1010,750,505],5000:[1200,950,600],6300:[1380,1100,690] } },
  ZDP: { name: "Угловая комбинированная", dims: 3, step: 50, defaults: { 160:[300,300,435],250:[300,300,435],315:[300,300,435],400:[300,300,435],500:[300,300,435],630:[300,300,435],800:[300,300,435],1000:[450,450,435],1250:[450,450,435],1600:[450,450,435],2000:[450,450,435],2500:[600,600,435],3200:[650,650,435],4000:[750,750,435],5000:[950,950,435],6300:[1100,1100,435] } },
  TD: { name: "Тройниковая горизонтальная", dims: 3, step: 50, defaults: { 160:[680,485,340],250:[680,485,340],315:[680,485,340],400:[680,485,340],500:[700,485,350],630:[720,485,360],800:[750,485,375],1000:[820,485,410],1250:[880,485,440],1600:[940,485,470],2000:[1020,485,510],2500:[1140,485,570],3200:[1260,485,630],4000:[1420,485,710],5000:[1660,485,830],6300:[1900,485,950] } },
  ATSC: { name: "Присоединительная к панелям", dims: 2, step: 50, defaults: Object.fromEntries(currents.map((i) => [i, [240, 450]])) },
  ATCP: { name: "Присоединительная вертикальная", dims: 3, step: 50, defaults: { 160:[190,400,300],250:[190,400,300],315:[190,400,300],400:[190,400,300],500:[200,410,300],630:[210,420,300],800:[225,435,300],1000:[260,470,450],1250:[290,500,450],1600:[320,530,450],2000:[360,570,450],2500:[470,680,600],3200:[530,740,650],4000:[610,820,750],5000:[825,1035,950],6300:[945,1155,1100] } },
  ATCD: { name: "Присоединительная горизонтальная", dims: 3, step: 50, defaults: Object.fromEntries(currents.map((i) => [i, [260, 470, 435]])) },
};

const verticalWelded = new Set<SectionCode>(["CP", "ZP", "TP", "ZDP", "ATCP"]);
const shaped = new Set<SectionCode>(["CD", "CP", "ZD", "ZP", "TP", "ZDP", "TD", "ATCP", "ATCD"]);

const row = (item: Omit<Item, "total">): Item => ({ ...item, total: item.qty * item.price });

export const articleFor = (current: number, code: SectionCode) => `${String(current / 100).replace(".", ",")}.${code}.4Р`;

export function calculateElement(element: NetworkElement, laborRate: number) {
  const info = sectionInfo[element.code];
  const cfg = bus[element.current];
  const developedMm = element.lengths.slice(0, info.dims).reduce((sum, value) => sum + Math.max(value || 0, 0), 0);
  const lengthM = developedMm / 1000;
  const profileM = Math.max(developedMm - 130, 0) / 1000;
  const insulatedLengthM = Math.max(developedMm - 210, 0) / 1000;
  const barPerimeterM = 2 * (cfg.height + cfg.thickness) / 1000;
  const petBlankWidthM = barPerimeterM + 0.03;
  const barsTotal = 4 * cfg.count;
  const tapeFactor = shaped.has(element.code) ? 2.5 : 1;
  const isFe = element.code === "FE";
  const isCd = element.code === "CD";
  const isCp = element.code === "CP";
  const busCode = busCodeByHeight[cfg.height] ?? "";
  const peEar = calculatePeEarBlank(element.current);
  const jointRule = getJointRule(element.current);
  const jointQuantity = Math.max(0, element.jointQuantity ?? 1);
  const cdBusDevelopedMm = Math.max(developedMm - 166.05, 0);
  const cdBusLengthM = barsTotal * cdBusDevelopedMm / 1000;
  const effectiveInsulatedLengthM = isCd ? Math.max(cdBusDevelopedMm - 60, 0) / 1000 : insulatedLengthM;
  const busMass = isCd && element.current === 1000
    ? 4.5 * (cdBusDevelopedMm / 703.95)
    : isCd
    ? cdBusLengthM * (cfg.thickness / 1000) * (cfg.height / 1000) * 2710
    : isCp
    ? 4.74 * (developedMm / 900) * (cfg.height / 100) * cfg.count
    : barsTotal * (cfg.thickness / 1000) * (cfg.height / 1000) * lengthM * 2710;

  const items: Item[] = [
    row({ code: busCode, name: `Шина АД0 ${cfg.thickness}×${cfg.height}×3000 (R=3), ${cfg.count} шт./фазу`, unit: "кг", qty: busMass, price: 450, group: "Шины", confidence: busCode ? "Подтверждено" : "Требует уточнения", note: isCp && element.current === 1000 ? "Масса 4,74 кг по спецификации CP; основная позиция 1С, строка 244699" : busCode ? "Основная позиция 1С, строка 244699" : "Код 1С для этого сечения не подтверждён" }),
    row({ code: "Ц0000059919", name: "Порошковый материал порошок припойный ПОС 61", unit: "кг", qty: 0.144, price: 5600, group: "Изоляция", confidence: "Подтверждено", note: "Норма ресурсной спецификации" }),
    row({ code: "Ц0000078237", name: `Плёнка ПЭТ-Э 250 мкм, развёртка ${Math.round(petBlankWidthM * 1000)} мм`, unit: "кг", qty: barsTotal * petBlankWidthM * effectiveInsulatedLengthM * 0.00025 * 1400, price: 311, group: "Изоляция", confidence: "Расчётно", note: "Перерасчёт по высоте шины и длине из ресурсной спецификации" }),
    row({ code: "УТ000000404", name: `Скотч электротехнический 25×66 м${tapeFactor === 2.5 ? " · норма ×2,5" : ""}`, unit: "м", qty: barsTotal * 2 * 14 * barPerimeterM * tapeFactor, price: 186 / 66, group: "Изоляция", confidence: "Подтверждено", note: tapeFactor === 2.5 ? "Добавлено 150%, итоговая норма ×2,5" : "14 витков на двух концах каждой шины" }),
  ];

  if (isFe) {
    items.push(
      row({ code: "Ц0000074662", name: "Профиль АП 4178, заготовка 3000 мм", unit: "м", qty: 2 * profileM, price: 759.55, group: "Корпус", confidence: "Подтверждено", note: "Единая позиция без разделения по окраске" }),
      row({ code: "Ц0000077015", name: "Профиль АП 4976 E-V.180, АД31, RAL7035 Шагрень", unit: "м", qty: 2 * profileM, price: 1313.4, group: "Корпус", confidence: "Расчётно", note: "Потребность в пог.м; масса 2,388 кг/м расчётно по действующей цене и ставке ресурсной спецификации; заказ — эквивалент заготовок 3000 мм" }),
    );
  } else {
    const sideMass = isCd
      ? 0.9 * (developedMm / 870) * ((cfg.height + 60) / 160)
      : 0.92 * (developedMm / 900) * ((cfg.height + 60) / 160);
    const coverMass = isCd
      ? 1.4 * (developedMm / 870) * ((cfg.height + 40) / 140)
      : 1.47 * (developedMm / 900) * ((cfg.height + 40) / 140);
    items.push(
      row({ code: "Ц0000070687", name: "Лист алюминий АМг3 2,0×1200×3000 — 2 боковины", unit: "кг", qty: sideMass, price: 592.9, group: "Корпус", confidence: "Подтверждено", note: isCd ? "CD 1000 А: 0,9 кг по КД" : "CP 1000 А: 0,92 кг по КД" }),
      row({ code: "Ц0000069207", name: "Лист алюминий АМг3М 3,0×1200×3000 — 2 крышки", unit: "кг", qty: coverMass, price: 592.9, group: "Корпус", confidence: "Подтверждено", note: isCd ? "CD 1000 А: 1,4 кг по КД" : "CP 1000 А: 1,47 кг по КД" }),
    );
  }

  const m6x12 = isFe ? 8 : 16;
  const m6x16 = isFe ? 24 : 16;
  items.push(
    ...(peEar ? [row({ code: "", name: `${peEar.designation} · Ухо PE, L=${peEar.lengthMm} мм · изготовление из листа АМг3 2,0 мм · 4 шт.`, unit: "кг", qty: peEar.totalKg, price: 592.9, group: "Изготавливаемые детали", confidence: "Расчётно", note: peEar.basis })] : []),
    row({ code: "Ц0000078870", name: "Вставка крышки секции 28×15×133,4 (KD-LZJ-K-R2)", unit: "шт", qty: 4, price: 129.06, group: "Постоянные", confidence: "Подтверждено", note: "Код задан пользователем для строки 87727; чертёж 03.045.013" }),
    row({ code: "Ц0000056270", name: "Болт с фланцем М6×12 DIN 6921", unit: "шт", qty: m6x12, price: 2.1, group: "Постоянные", confidence: "Подтверждено", note: isFe ? "FE: 8 шт. по спецификации" : isCp ? "CP: 16 шт. по спецификации" : "Норма фасонной секции" }),
    row({ code: "УТ000003151", name: "Болт с фланцем М6×16 DIN 6921", unit: "шт", qty: m6x16, price: 2.2, group: "Постоянные", confidence: "Подтверждено", note: isFe ? "FE: 24 шт. по спецификации" : isCp ? "CP: 16 шт. по спецификации" : "Норма фасонной секции" }),
    row({ code: "УТ000005297", name: "Гайка М6 DIN 934, оцинкованная, кл. 8", unit: "шт", qty: 16, price: 0.5, group: "Постоянные", confidence: "Подтверждено" }),
    row({ code: "Ц0000039669", name: "Заклёпка 4,8×10 сталь/сталь", unit: "шт", qty: 48, price: 1.11, group: "Постоянные", confidence: "Подтверждено" }),
    row({ code: "Ц0000056495", name: "Плёнкосинтокартон ПСК-515 0,30 мм (D250 мм)", unit: "кг", qty: 0.632832, price: 427, group: "Постоянные", confidence: "Подтверждено", note: "8 полос; пересчёт 350 мкм → 300 мкм" }),
    row({ code: "00000002130", name: "Герметик серый", unit: "бал.", qty: 0.13, price: 417, group: "Постоянные", confidence: "Подтверждено", note: "Код задан пользователем; норма ресурсной спецификации" }),
    row({ code: "00000004273", name: "Стрейч-плёнка ручная", unit: "кг", qty: 0.024, price: 210, group: "Постоянные", confidence: "Подтверждено", note: "Полное наименование 1С: «Стрейч пленка ручная»" }),
  );

  if (jointRule && jointQuantity > 0) {
    items.push(...jointRule.components.map((component) => row({
      code: "",
      name: `${component.designation ? `${component.designation} · ` : ""}${component.name}${component.material ? ` · ${component.material}` : ""}`,
      unit: "шт",
      qty: component.quantity * jointQuantity,
      price: 0,
      group: `Стык ${jointRule.designation}`,
      confidence: "Подтверждено",
      note: `${component.source}; ${jointQuantity} комплект(а) стыка на элемент`,
    })));
  }

  const materials = items.reduce((sum, item) => sum + item.total, 0);
  const welding = verticalWelded.has(element.code) ? materials * 0.12 : 0;
  if (welding) items.push(row({ code: "", name: "Сварка вертикальной фасонной секции — 12% один раз", unit: "доля", qty: 0.12, price: materials, group: "Работы", confidence: "Подтверждено", note: "Начисляется один раз на всю секцию" }));
  const labor = materials * laborRate / 100 + welding;
  const gas = 17.3 / 1.8 * 11.5;
  const electricity = 8.7 / 1.8 * 11.28;
  const unitCost = materials + labor + gas + electricity;
  return { items, materials, labor, welding, gas, electricity, unitCost, totalCost: unitCost * element.quantity, busMass: items[0].qty, developedMm, petBlankWidthM, cfg, peEar, jointRule, jointQuantity };
}
