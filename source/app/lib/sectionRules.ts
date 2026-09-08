export const SECTION_RULES_VERSION = "V1.1";
export const SECTION_RULES_DATE = "2026-08-13";
export const SECTION_RULES_SOURCE =
  "2026.08.13_Описание правил расчета секций V1.1.xlsx";

export type RuleCatalogItem = {
  id: number;
  sourceNumber: number;
  code: string;
  name: string;
};

const normalize = (value: string) =>
  value
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");

export function resolveSectionRule(item: RuleCatalogItem) {
  const code = normalize(item.code);
  const name = normalize(item.name);
  const combined = `${code} ${name}`;
  const sheetSidewall =
    /УГЛ|Z-?ОБРАЗ|ТРОЙНИК|ТРАНСПОЗ/.test(name) ||
    /(ZDP|ZP|ZD|TP|TD|TR|CP|CD)/.test(code);
  const horizontalAngle =
    /ГОРИЗОНТ/.test(name) || /(CD|ZD|TD|XD|ZDP)/.test(code);
  const verticalAngle = /ВЕРТИКАЛ/.test(name) || /(CP|ZP|TP|XP|ZDP)/.test(code);
  return {
    developedLengthFormula: "L1 + L2 + L3",
    sheetSidewall,
    horizontalAngle,
    verticalAngle,
    tapeFactor: horizontalAngle ? 2.5 : 1,
    sidewallDescription: sheetSidewall
      ? "2 боковины из листа АМг3, S=2 мм"
      : "2 профильные боковины",
    orientation:
      horizontalAngle && verticalAngle
        ? "комбинированная"
        : horizontalAngle
          ? "горизонтальная"
          : verticalAngle
            ? "вертикальная"
            : "без угловой надбавки",
    sourceMatch: combined,
  };
}
