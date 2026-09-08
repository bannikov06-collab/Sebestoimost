import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const sourceDir = process.argv[2];
const outputPath = process.argv[3] ?? "public/data/breakerCatalog.json";

if (!sourceDir) {
  throw new Error("Укажите каталог с семью прайсами автоматических выключателей.");
}

const files = {
  CHINT: "CHINT_прайс.xls",
  DEKraft: "DEKraft_прайс.xls",
  Hyundai: "Hyundai_прайс.xls",
  "Systeme Electric": "Systeme_прайс.xls",
  EKF: "EKF_прайс.xlsx",
  IEK: "IEK_zakaz.xlsm",
  KEAZ: "KEAZ_прайс.xls",
};

const confirmedKomTypes = new Map([
  ["271333", "PB"],
  ["13.03.02.000515", "PB"],
  ["271334", "PB"],
  ["13.03.02.000445", "BB"],
  ["271335", "PB"],
  ["131369", "BB"],
  ["269403", "BB"],
  ["13.03.02.000535", "BB"],
]);

const normalizeArticle = (value) => String(value ?? "").trim();
const normalizeName = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const numeric = (value) => {
  const parsed = Number(String(value ?? "").replace(/\u00a0/g, "").replace(/\s/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const isoDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value ?? "").trim();
  const dmy = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdy) return `20${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
};
const isBreakerName = (value) => {
  const name = normalizeName(value);
  const match = name.match(/автоматическ[а-яё]*\s+выключател[а-яё]*|выключател[а-яё]*\s+(?:дифференциальн[а-яё]*\s+)?автоматическ[а-яё]*|дифференциальн[а-яё]*\s+автомат[а-яё]*|авт\.?\s*выкл/i);
  if (!match || (match.index ?? 999) >= 45) return false;
  return !/(пластрон|панел|корпус|шкаф|аксессуар|принадлежн|комплект|расцепител|контакт|привод|рукоят|основан)/i.test(name.slice(0, match.index));
};
const parseCurrent = (name) => {
  const values = [...normalizeName(name).matchAll(/(?:^|[^а-яёa-z0-9кk])([0-9]+(?:[.,][0-9]+)?)\s*[аa](?![а-яёa-z])/gi)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => value > 0 && value <= 10000);
  return values.at(-1) ?? 0;
};
const parsePoles = (name) => {
  const match = normalizeName(name).match(/(?:^|\s)([1-4])\s*(?:p|п|полюс)/i);
  return match ? Number(match[1]) : 0;
};

const rows = [];
const add = ({ manufacturer, article, name, price, date, sourceFile, sourceSheet, status = "Действующая строка прайса" }) => {
  const cleanArticle = normalizeArticle(article);
  const cleanName = normalizeName(name);
  const sourcePrice = numeric(price);
  if (!cleanArticle || !cleanName || sourcePrice <= 0) return;
  rows.push({
    key: `${manufacturer}:${cleanArticle}`,
    manufacturer,
    article: cleanArticle,
    name: cleanName,
    currentA: parseCurrent(cleanName),
    poles: parsePoles(cleanName),
    komType: confirmedKomTypes.get(cleanArticle) ?? "",
    sourcePrice,
    sourceDate: isoDate(date),
    sourceFile,
    sourceSheet,
    ...(status !== "Действующая строка прайса" ? { status } : {}),
  });
};

for (const [manufacturer, fileName] of Object.entries(files)) {
  const workbook = XLSX.readFile(path.join(sourceDir, fileName), { cellDates: true });
  if (["CHINT", "DEKraft", "Hyundai", "Systeme Electric"].includes(manufacturer)) {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets.Price, { header: 1, defval: "", raw: false });
    for (const row of matrix.slice(4)) {
      if (!isBreakerName(row[1])) continue;
      add({ manufacturer, article: row[0], name: row[1], price: row[2], date: row[4], sourceFile: fileName, sourceSheet: "Price", dateBasis: "Дата из строки прайса" });
    }
    continue;
  }

  if (manufacturer === "EKF") {
    for (const sheetName of ["Продукция EKF", "Новинки"]) {
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
      const commonDate = isoDate(matrix[1]?.[1]) || "2026-06-24";
      for (const row of matrix.slice(12)) {
        if (!isBreakerName(row[1])) continue;
        add({ manufacturer, article: row[0], name: row[1], price: row[6], date: commonDate, sourceFile: fileName, sourceSheet: sheetName });
      }
    }
    continue;
  }

  if (manufacturer === "IEK") {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets["Прайс"], { header: 1, defval: "", raw: false });
    const commonDate = isoDate(matrix[1]?.[0]) || "2026-08-14";
    for (const row of matrix.slice(7)) {
      if (!isBreakerName(row[1])) continue;
      add({ manufacturer, article: row[0], name: row[1], price: row[7], date: commonDate, sourceFile: fileName, sourceSheet: "Прайс" });
    }
    continue;
  }

  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets.TDSheet, { header: 1, defval: "", raw: false });
  let activeGroup = "";
  for (const row of matrix.slice(10)) {
    const heading = normalizeName(row[1]);
    if (heading) {
      const isBreakerGroup = /автоматическ[а-яё]*.*выключател|выключател[а-яё]*.*автоматическ/i.test(heading);
      const isAccessoryGroup = /(аксессуар|принадлежн|комплект|расцепител|контакт|привод|рукоят|основан|зажим)/i.test(heading);
      activeGroup = isBreakerGroup && !isAccessoryGroup ? heading : "";
    }
    if (!activeGroup) continue;
    const name = normalizeName(row[3]);
    add({
      manufacturer,
      article: row[2],
      name,
      price: row[6],
      date: "2026-06-24",
      sourceFile: fileName,
      sourceSheet: "TDSheet",
      status: /^не использовать/i.test(name) ? "Не использовать" : "Действующая строка прайса",
    });
  }
}

const deduplicated = new Map();
for (const row of rows) {
  const key = `${row.manufacturer}|${row.article.toLowerCase()}`;
  const previous = deduplicated.get(key);
  if (!previous || row.sourceDate >= previous.sourceDate) deduplicated.set(key, row);
}

const catalog = [...deduplicated.values()].sort((a, b) =>
  a.manufacturer.localeCompare(b.manufacturer, "ru") ||
  a.currentA - b.currentA ||
  a.article.localeCompare(b.article, "ru"),
);

fs.writeFileSync(outputPath, `${JSON.stringify(catalog)}\n`);
console.log(JSON.stringify({ outputPath, rows: catalog.length, byManufacturer: Object.fromEntries(Object.keys(files).map((name) => [name, catalog.filter((row) => row.manufacturer === name).length])) }, null, 2));
