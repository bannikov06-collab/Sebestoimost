export type ProductionElementForSchedule = {
  code: string;
  current: number;
  lengthMm: number;
  quantity: number;
};
export type DepartmentLoads = Record<string, number>;
export const PRODUCTION_HOURS_PER_DAY = 12;

function feMinutes(current: number, lengthMm: number) {
  const size = lengthMm <= 999 ? 1 : lengthMm <= 1999 ? 2 : 3;
  if (current >= 6300)
    return size === 1 ? 41.3223 : size === 2 ? 56.8182 : 75.7576;
  if (current >= 5000)
    return size === 1 ? 26.738 : size === 2 ? 32.4675 : 50.5051;
  if (current >= 3200)
    return size === 1 ? 23.9234 : size === 2 ? 28.4091 : 37.8788;
  return size === 1 ? 18.9394 : size === 2 ? 22.7273 : 28.4091;
}
function cpMinutes(current: number) {
  if (current >= 6300) return 56.8182;
  if (current >= 5000) return 41.3223;
  if (current >= 3200) return 30.303;
  if (current >= 2500) return 45.4545;
  if (current >= 1250) return 37.8788;
  return 34.965;
}
function cdMinutes(current: number) {
  if (current >= 6300) return 45.4545;
  if (current >= 5000) return 37.8788;
  if (current >= 3200) return 22.7273;
  return 34.965;
}
function atscMinutes(current: number) {
  if (current >= 5000) return 41.3223;
  if (current >= 3200) return 28.4091;
  return 50.5051;
}
function zpMinutes(current: number) {
  return current >= 3200 ? 101.0101 : 75.7576;
}
function tpMinutes(current: number) {
  if (current >= 3200) return 45.4545;
  if (current >= 2000) return 56.8182;
  return 45.4545;
}

export function assemblyNormMinutesForElement(
  element: ProductionElementForSchedule,
) {
  switch (element.code) {
    case 'FE':
      return feMinutes(element.current, element.lengthMm);
    case 'CP':
      return cpMinutes(element.current);
    case 'CD':
      return cdMinutes(element.current);
    case 'ATSC':
      return atscMinutes(element.current);
    case 'ZP':
    case 'ZD':
    case 'ZDP':
      return zpMinutes(element.current);
    case 'TP':
    case 'TD':
      return tpMinutes(element.current);
    case 'ATT':
      return atscMinutes(element.current);
    case 'CML':
      return 60;
    case 'ATCP':
    case 'ATCD':
      return atscMinutes(element.current) + 15;
    default:
      return 0;
  }
}

export function estimateProductionHours(
  elements: ProductionElementForSchedule[],
) {
  const minutes = elements.reduce(
    (sum, element) =>
      sum +
      assemblyNormMinutesForElement(element) *
        Math.max(element.quantity, 0),
    0,
  );
  const unmappedOperations = [
    ...new Set(
      elements
        .filter(
          (element) =>
            assemblyNormMinutesForElement(element) <= 0,
        )
        .map((element) => element.code),
    ),
  ];
  return {
    minutes,
    hours: minutes / 60,
    departmentHours: {
      'Сборочный участок': minutes / 60,
    } as DepartmentLoads,
    unmappedOperations,
    source:
      'ВЕДОМОСТЬ ПРОИЗВОДСТВЕННЫХ РАБОТ 01.08.2026 · штучно-калькуляционное время подтвержденных сборочных операций',
  };
}

export function addProductionHours(startIso: string, hours: number) {
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime())) return '';
  const days = Math.max(
    hours > 0 ? 1 : 0,
    Math.ceil(Math.max(hours, 0) / PRODUCTION_HOURS_PER_DAY),
  );
  start.setUTCDate(start.getUTCDate() + days);
  return start.toISOString();
}

export function calculateQueueDates<
  T extends {
    id?: number;
    priorityOrder: number | null;
    productionHours: number;
    productionLoads?: DepartmentLoads;
  },
>(rows: T[], startIso = new Date().toISOString()) {
  const resourceCursor = new Map<string, string>();
  return rows.map((row) => {
    if (row.priorityOrder == null)
      return {
        ...row,
        plannedStart: '',
        plannedReady: '',
        departmentSchedule: {},
      };
    const loads = Object.entries(row.productionLoads ?? {}).filter(
      ([, hours]) => Number(hours) > 0,
    );
    const effectiveLoads: Array<[string, number]> = loads.length
      ? loads
      : [['Сборочный участок', Math.max(row.productionHours, 0)]];
    const departmentSchedule: Record<
      string,
      { start: string; ready: string; hours: number }
    > = {};
    for (const [department, hours] of effectiveLoads) {
      const start = resourceCursor.get(department) ?? startIso;
      const ready = addProductionHours(start, hours);
      departmentSchedule[department] = { start, ready, hours };
      resourceCursor.set(department, ready);
    }
    const starts = Object.values(departmentSchedule)
      .map((item) => item.start)
      .sort();
    const readies = Object.values(departmentSchedule)
      .map((item) => item.ready)
      .sort();
    return {
      ...row,
      plannedStart: starts[0] ?? startIso,
      plannedReady: readies.at(-1) ?? startIso,
      departmentSchedule,
    };
  });
}
