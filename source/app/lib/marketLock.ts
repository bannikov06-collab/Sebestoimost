export type MarketPoint = {
  aluminiumUsdT: number;
  copperUsdT: number;
  usdRub: number;
  sourceDate: string;
  capturedAt: string;
};

export type MarketIndicatorLock = {
  valueCapturedAt: string;
  reviewedAt: string;
  validUntil: string;
  sourceDate: string;
};

export type ProjectMarketSnapshot = MarketPoint & {
  projectKey: string;
  /** Backward-compatible earliest independent review date. */
  validUntil: string;
  aluminiumLock: MarketIndicatorLock;
  copperLock: MarketIndicatorLock;
  usdLock: MarketIndicatorLock;
  aluminiumReason: string;
  copperReason: string;
  usdReason: string;
};

export const MARKET_LOCK_DAYS = 14;
const valid = (value: number) => Number.isFinite(value) && value > 0;

export function addDaysIso(iso: string, days: number) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'UTC' });

function createLock(point: MarketPoint): MarketIndicatorLock {
  return {
    valueCapturedAt: point.capturedAt,
    reviewedAt: point.capturedAt,
    validUntil: addDaysIso(point.capturedAt, MARKET_LOCK_DAYS),
    sourceDate: point.sourceDate,
  };
}

export function createProjectMarketSnapshot(
  projectKey: string,
  point: MarketPoint,
): ProjectMarketSnapshot {
  const aluminiumLock = createLock(point);
  const copperLock = createLock(point);
  const usdLock = createLock(point);
  return {
    ...point,
    projectKey,
    validUntil: aluminiumLock.validUntil,
    aluminiumLock,
    copperLock,
    usdLock,
    aluminiumReason: `Зафиксировано ${formatDate(point.capturedAt)} на ${MARKET_LOCK_DAYS} дней`,
    copperReason: `Зафиксировано ${formatDate(point.capturedAt)} на ${MARKET_LOCK_DAYS} дней`,
    usdReason: `Зафиксировано ${formatDate(point.capturedAt)} на ${MARKET_LOCK_DAYS} дней`,
  };
}

function legacyLock(
  previous: ProjectMarketSnapshot,
  kind: 'aluminium' | 'copper' | 'usd',
): MarketIndicatorLock {
  const current = previous[`${kind}Lock` as keyof ProjectMarketSnapshot] as
    | MarketIndicatorLock
    | undefined;
  if (current?.validUntil) return current;
  return {
    valueCapturedAt: previous.capturedAt,
    reviewedAt: previous.capturedAt,
    validUntil:
      previous.validUntil ||
      addDaysIso(previous.capturedAt, MARKET_LOCK_DAYS),
    sourceDate: previous.sourceDate,
  };
}

function reviewIndicator(
  label: string,
  previous: number,
  current: number,
  lock: MarketIndicatorLock,
  point: MarketPoint,
  nowIso: string,
) {
  const expired =
    new Date(nowIso).getTime() >= new Date(lock.validUntil).getTime();
  if (!valid(previous) && valid(current)) {
    const nextLock = {
      ...createLock({ ...point, capturedAt: nowIso }),
      sourceDate: point.sourceDate || lock.sourceDate,
    };
    return {
      value: current,
      lock: nextLock,
      changed: true,
      reason: `${label}: исходное значение отсутствовало, принято текущее ${formatDate(nowIso)}`,
    };
  }
  if (!valid(current))
    return {
      value: previous,
      lock,
      changed: false,
      reason: `${label}: автоисточник недоступен, сохранено значение от ${formatDate(lock.valueCapturedAt)}`,
    };
  if (!expired)
    return {
      value: previous,
      lock,
      changed: false,
      reason: `${label}: действует фиксация от ${formatDate(lock.valueCapturedAt)} до ${formatDate(lock.validUntil)}`,
    };

  const nextLock: MarketIndicatorLock = {
    valueCapturedAt: current > previous ? nowIso : lock.valueCapturedAt,
    reviewedAt: nowIso,
    validUntil: addDaysIso(nowIso, MARKET_LOCK_DAYS),
    sourceDate: point.sourceDate || lock.sourceDate,
  };
  if (current > previous)
    return {
      value: current,
      lock: nextLock,
      changed: true,
      reason: `${label}: после 14 дней значение выросло, принято новое от ${formatDate(nowIso)}`,
    };
  return {
    value: previous,
    lock: nextLock,
    changed: true,
    reason: `${label}: проверено ${formatDate(nowIso)}, новое значение ниже; сохранено более высокое от ${formatDate(lock.valueCapturedAt)}`,
  };
}

export function applyMarketLock(
  previous: ProjectMarketSnapshot | null,
  current: MarketPoint,
  nowIso = new Date().toISOString(),
): ProjectMarketSnapshot {
  if (!previous) return createProjectMarketSnapshot('', current);
  const aluminium = reviewIndicator(
    'Al',
    previous.aluminiumUsdT,
    current.aluminiumUsdT,
    legacyLock(previous, 'aluminium'),
    current,
    nowIso,
  );
  const copper = reviewIndicator(
    'Cu',
    previous.copperUsdT,
    current.copperUsdT,
    legacyLock(previous, 'copper'),
    current,
    nowIso,
  );
  const usd = reviewIndicator(
    'USD/RUB',
    previous.usdRub,
    current.usdRub,
    legacyLock(previous, 'usd'),
    current,
    nowIso,
  );
  const changed = aluminium.changed || copper.changed || usd.changed;
  const validUntil = [
    aluminium.lock.validUntil,
    copper.lock.validUntil,
    usd.lock.validUntil,
  ].sort()[0];
  return {
    ...previous,
    aluminiumUsdT: aluminium.value,
    copperUsdT: copper.value,
    usdRub: usd.value,
    sourceDate: current.sourceDate || previous.sourceDate,
    capturedAt: changed ? nowIso : previous.capturedAt,
    validUntil,
    aluminiumLock: aluminium.lock,
    copperLock: copper.lock,
    usdLock: usd.lock,
    aluminiumReason: aluminium.reason,
    copperReason: copper.reason,
    usdReason: usd.reason,
  };
}
