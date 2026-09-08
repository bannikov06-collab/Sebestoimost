export type BreakerDiscountPrices = {
  discount50: number;
  discount70: number;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function calculateBreakerDiscountPrices(listPrice: number): BreakerDiscountPrices {
  const price = Number.isFinite(listPrice) && listPrice > 0 ? listPrice : 0;
  return {
    discount50: roundMoney(price * 0.5),
    discount70: roundMoney(price * 0.3),
  };
}
