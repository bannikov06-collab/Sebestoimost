export const ALUMINIUM_DENSITY_KG_M3 = 2710;
export const STOCK_BUS_LENGTH_M = 3;

export function calculateBusStock(
  config: { count: number; height: number; thickness: number },
  developedMm: number,
  poles: 4 | 5 = 4,
) {
  const barsTotal = poles * config.count;
  const elementLengthM = developedMm / 1000;
  const busLengthM = barsTotal * elementLengthM;
  const crossSectionM2 = (config.thickness / 1000) * (config.height / 1000);
  const busMass = busLengthM * crossSectionM2 * ALUMINIUM_DENSITY_KG_M3;
  const massPer3m = crossSectionM2 * STOCK_BUS_LENGTH_M * ALUMINIUM_DENSITY_KG_M3;
  const equivalent3m = massPer3m > 0 ? busMass / massPer3m : 0;

  return {
    barsTotal,
    busLengthM,
    busMass,
    massPer3m,
    equivalent3m,
    stockPieces3m: Math.ceil(equivalent3m),
  };
}
