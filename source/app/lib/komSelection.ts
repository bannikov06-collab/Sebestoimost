export type KomConnection = "Bolt-on" | "Plug-in";

export type KomEnvelope = {
  minExclusive: number;
  maxInclusive: number;
  bolt: [number, number, number] | null;
  plug: [number, number, number] | null;
};

export const komEnvelopes: KomEnvelope[] = [
  { minExclusive: 0, maxInclusive: 100, bolt: [300, 300, 600], plug: [250, 300, 500] },
  { minExclusive: 100, maxInclusive: 250, bolt: [300, 300, 700], plug: [250, 350, 600] },
  { minExclusive: 250, maxInclusive: 630, bolt: [350, 350, 800], plug: [300, 350, 700] },
  { minExclusive: 630, maxInclusive: 800, bolt: [400, 350, 900], plug: null },
  { minExclusive: 800, maxInclusive: 1250, bolt: [500, 350, 1200], plug: null },
];

export const kom250Drawing = {
  designation: "626.250.PB.012.000.000СБ",
  title: "КОМ 250А с ручкой",
  connection: "Plug-in" as const,
  currentA: 250,
  dimensions: [286, 250, 605] as [number, number, number],
  totalMassKg: 21.71,
  housingMassKg: 14.14,
  steel15Kg: 10.77,
  steel07Kg: 0.57,
};

export const kom250SheetParts = [
  { designation: "626.250.PB.012.001.001", name: "Корпус", material: "Лист ОЦ БТ-ПН-НО-1,5 ГОСТ 19904-2015", quantity: 1, massKg: 6.04 },
  { designation: "626.250.PB.012.001.002", name: "Стенка", material: "Лист ОЦ БТ-ПН-НО-1,5 ГОСТ 19904-2015", quantity: 1, massKg: 0.68 },
  { designation: "626.250.PB.012.001.003", name: "Крышка", material: "Лист ОЦ БТ-ПН-НО-1,5 ГОСТ 19904-2015", quantity: 1, massKg: 1.2 },
  { designation: "626.250.PB.012.003.001", name: "Дверь", material: "Лист ОЦ БТ-ПН-НО-1,5 ГОСТ 19904-2015", quantity: 1, massKg: 2.2 },
  { designation: "626.250.PB.012.004.001", name: "Опора", material: "Лист ОЦ БТ-ПН-НО-1,5 ГОСТ 19904-2015", quantity: 1, massKg: 0.65 },
  { designation: "626.250.PB.012.006.001", name: "Фальш-панель", material: "Лист ОЦ БТ-ПН-НО-0,7 ГОСТ 19904-2015", quantity: 1, massKg: 0.24 },
  { designation: "626.250.PB.012.007.001", name: "Фальш-панель", material: "Лист ОЦ БТ-ПН-НО-0,7 ГОСТ 19904-2015", quantity: 1, massKg: 0.33 },
];

export const kom250Fasteners = [
  { name: "Болт DIN 6921 M6×16-8.8", quantity: 18 },
  { name: "Болт DIN 6921 M6×20-8.8", quantity: 8 },
  { name: "Болт DIN 933 M10×35-8.8", quantity: 10 },
  { name: "Болт DIN 933 M12×30-8.8", quantity: 5 },
  { name: "Винт самонарезающий DIN 7500 C-Z M5×10", quantity: 30 },
  { name: "Заклёпка отрывная 4,8×8 сталь", quantity: 35 },
  { name: "Гайка DIN 934 M10-8.8", quantity: 10 },
  { name: "Гайка DIN 985 M6-8.8", quantity: 8 },
  { name: "Шайба DIN 125-10-Zn", quantity: 20 },
  { name: "Шайба DIN 127-10-Zn", quantity: 10 },
];

export function findKomEnvelope(currentA: number, connection: KomConnection) {
  const row = komEnvelopes.find(
    (item) => currentA > item.minExclusive && currentA <= item.maxInclusive,
  );
  return row ? (connection === "Bolt-on" ? row.bolt : row.plug) : null;
}

const boxArea = ([width, depth, height]: [number, number, number]) =>
  2 * (width * depth + width * height + depth * height);

export function calculateKomMaterials(
  currentA: number,
  connection: KomConnection,
  dimensions?: [number, number, number] | null,
) {
  const exact = currentA === kom250Drawing.currentA && connection === kom250Drawing.connection;
  if (exact) {
    return {
      exact: true,
      confidence: "Высокая" as const,
      basis: `КД ${kom250Drawing.designation} от 18.08.2026`,
      dimensions: kom250Drawing.dimensions,
      scale: 1,
      steel15Kg: kom250Drawing.steel15Kg,
      steel07Kg: kom250Drawing.steel07Kg,
      housingMassKg: kom250Drawing.housingMassKg,
      totalMassKg: kom250Drawing.totalMassKg,
    };
  }

  const selectedDimensions = dimensions ?? findKomEnvelope(currentA, connection);
  if (!selectedDimensions) return null;
  const scale = boxArea(selectedDimensions) / boxArea(kom250Drawing.dimensions);
  return {
    exact: false,
    confidence: "Низкая" as const,
    basis: `Предварительное масштабирование по площади корпуса относительно ${kom250Drawing.designation}; не является нормой расхода`,
    dimensions: selectedDimensions,
    scale,
    steel15Kg: kom250Drawing.steel15Kg * scale,
    steel07Kg: kom250Drawing.steel07Kg * scale,
    housingMassKg: kom250Drawing.housingMassKg * scale,
    totalMassKg: undefined,
  };
}
