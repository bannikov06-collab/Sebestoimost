export type DemandLine = {
  projectKey: string;
  code: string;
  name: string;
  unit: string;
  qty: number;
  priority: number | null;
};
export type ReservationLine = {
  projectKey: string;
  code: string;
  name: string;
  unit: string;
  qty: number;
  priority: number | null;
  reservedAt: string;
  actor: string;
  source: string;
  reason: string;
};
export type AvailabilityLine = {
  code: string;
  name: string;
  unit: string;
  stock: number;
  inTransit: number;
  paid: number;
  supplierProduction: number;
};

export function normalizeReservation(
  row: Partial<ReservationLine>,
): ReservationLine {
  const now = new Date().toISOString();
  return {
    projectKey: String(row.projectKey ?? ''),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    unit: String(row.unit ?? ''),
    qty: Number(row.qty) || 0,
    priority: row.priority ?? null,
    reservedAt: row.reservedAt ?? now,
    actor: row.actor ?? 'Пользователь KLM',
    source: row.source ?? 'Интерфейс KLM',
    reason:
      row.reason ??
      'Резерв существовал до включения расширенного журнала',
  };
}

export function autoReserve(
  demands: DemandLine[],
  availability: AvailabilityLine[],
  nowIso = new Date().toISOString(),
) {
  const available = new Map(
    availability.map((x) => [
      x.code || x.name,
      { ...x, free: Math.max(x.stock, 0) },
    ]),
  );
  const rows = [...demands].sort(
    (a, b) => (a.priority ?? 9999) - (b.priority ?? 9999),
  );
  const result: ReservationLine[] = [];
  for (const d of rows) {
    const key = d.code || d.name;
    const a = available.get(key);
    const qty = Math.min(
      Math.max(d.qty, 0),
      Math.max(a?.free ?? 0, 0),
    );
    if (qty > 0) {
      result.push({
        ...d,
        qty,
        reservedAt: nowIso,
        actor: 'Пользователь KLM',
        source: 'Автоматическое резервирование',
        reason: 'Распределено по очереди приоритетов проектов',
      });
      if (a) a.free -= qty;
    }
  }
  return result;
}

export function reservedTotal(
  code: string,
  reservations: ReservationLine[],
) {
  return reservations
    .filter((r) => (r.code || r.name) === code)
    .reduce((sum, r) => sum + r.qty, 0);
}

export function freeStock(
  code: string,
  stock: number,
  reservations: ReservationLine[],
  excludeProject = '',
) {
  return Math.max(
    stock -
      reservations
        .filter(
          (r) =>
            (r.code || r.name) === code &&
            r.projectKey !== excludeProject,
        )
        .reduce((sum, r) => sum + r.qty, 0),
    0,
  );
}
