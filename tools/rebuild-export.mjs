import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const databaseDir = path.join(root, "database");
const uploadsDir = path.join(root, "uploads");
const siteBase = "https://klm-busway-cost.workspace-940596.chatgpt.site";

await mkdir(databaseDir, { recursive: true });
await mkdir(uploadsDir, { recursive: true });

const readJson = async (name) => JSON.parse(await readFile(path.join(databaseDir, name), "utf8"));
const calculationsApi = await readJson("calculations-api.json");
const assignmentsApi = await readJson("assignments-api.json");
const workspaceApi = await readJson("workspace-api.json");

const calculations = [...(calculationsApi.calculations ?? [])].sort((a, b) => a.id - b.id);
const assignmentHistory = [...(assignmentsApi.assignments ?? [])].sort((a, b) => a.id - b.id);
const workspaceRecords = [...(workspaceApi.records ?? [])]
  .map((row) => ({
    id: row.id,
    category: row.category,
    projectKey: row.projectKey ?? "",
    entityKey: row.entityKey ?? "",
    payloadJson: JSON.stringify(row.payload ?? {}),
    createdAt: row.createdAt,
  }))
  .sort((a, b) => a.id - b.id);

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
await writeFile(path.join(databaseDir, "calculations.json"), json(calculations));
await writeFile(path.join(databaseDir, "assignment_history.json"), json(assignmentHistory));
await writeFile(path.join(databaseDir, "workspace_records.json"), json(workspaceRecords));

const sqlText = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
const sqlNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Некорректное число в резервной копии: ${value}`);
  return String(number);
};

const sql = [
  "PRAGMA foreign_keys=OFF;",
  "BEGIN TRANSACTION;",
  "CREATE TABLE IF NOT EXISTS calculations (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, project_name text NOT NULL, section_name text NOT NULL, section_length integer NOT NULL, quantity integer NOT NULL, material_cost real NOT NULL, labor_cost real NOT NULL, utility_cost real NOT NULL, unit_cost real NOT NULL, total_cost real NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);",
  "CREATE TABLE IF NOT EXISTS assignment_history (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, project_name text NOT NULL, scope text NOT NULL, element_key text DEFAULT '' NOT NULL, responsible text NOT NULL, previous_responsible text DEFAULT '' NOT NULL, changed_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);",
  "CREATE TABLE IF NOT EXISTS workspace_records (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, category text NOT NULL, project_key text DEFAULT '' NOT NULL, entity_key text DEFAULT '' NOT NULL, payload_json text NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);",
  "CREATE INDEX IF NOT EXISTS workspace_records_lookup_idx ON workspace_records(category, project_key, entity_key, created_at);",
];

for (const row of calculations) {
  sql.push(`INSERT INTO calculations (id, project_name, section_name, section_length, quantity, material_cost, labor_cost, utility_cost, unit_cost, total_cost, created_at) VALUES (${sqlNumber(row.id)}, ${sqlText(row.projectName)}, ${sqlText(row.sectionName)}, ${sqlNumber(row.sectionLength)}, ${sqlNumber(row.quantity)}, ${sqlNumber(row.materialCost)}, ${sqlNumber(row.laborCost)}, ${sqlNumber(row.utilityCost)}, ${sqlNumber(row.unitCost)}, ${sqlNumber(row.totalCost)}, ${sqlText(row.createdAt)});`);
}

for (const row of assignmentHistory) {
  sql.push(`INSERT INTO assignment_history (id, project_name, scope, element_key, responsible, previous_responsible, changed_at) VALUES (${sqlNumber(row.id)}, ${sqlText(row.projectName)}, ${sqlText(row.scope)}, ${sqlText(row.elementKey)}, ${sqlText(row.responsible)}, ${sqlText(row.previousResponsible)}, ${sqlText(row.changedAt)});`);
}

for (const row of workspaceRecords) {
  sql.push(`INSERT INTO workspace_records (id, category, project_key, entity_key, payload_json, created_at) VALUES (${sqlNumber(row.id)}, ${sqlText(row.category)}, ${sqlText(row.projectKey)}, ${sqlText(row.entityKey)}, ${sqlText(row.payloadJson)}, ${sqlText(row.createdAt)});`);
}

sql.push("COMMIT;", "");
await writeFile(path.join(databaseDir, "backup.sql"), sql.join("\n"));

const uniqueFiles = new Map();
for (const row of workspaceApi.records ?? []) {
  const payload = row.payload ?? {};
  const storageKey = typeof payload.storageKey === "string" ? payload.storageKey : "";
  if (!storageKey.startsWith("projects/")) continue;
  const existing = uniqueFiles.get(storageKey) ?? {
    storageKey,
    fileName: String(payload.fileName ?? path.basename(storageKey)),
    contentType: String(payload.contentType ?? "application/octet-stream"),
    expectedSize: null,
    recordIds: [],
    categories: [],
    projectKeys: [],
    entityKeys: [],
  };
  if (Number.isFinite(Number(payload.size)) && Number(payload.size) > 0) existing.expectedSize = Number(payload.size);
  existing.recordIds.push(row.id);
  existing.categories.push(row.category);
  existing.projectKeys.push(row.projectKey ?? "");
  existing.entityKeys.push(row.entityKey ?? "");
  uniqueFiles.set(storageKey, existing);
}

const safeName = (value) => value
  .normalize("NFKC")
  .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
  .replace(/\s+/g, "_")
  .replace(/^\.+/, "")
  .slice(0, 170) || "file.bin";

const manifest = [];
let index = 0;
for (const entry of uniqueFiles.values()) {
  index += 1;
  const archiveFile = `${String(index).padStart(3, "0")}_${safeName(entry.fileName)}`;
  const response = await fetch(`${siteBase}/api/documents?key=${encodeURIComponent(entry.storageKey)}`);
  if (!response.ok) throw new Error(`Не удалось выгрузить ${entry.fileName}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(path.join(uploadsDir, archiveFile), bytes);
  manifest.push({
    ...entry,
    recordIds: [...new Set(entry.recordIds)].sort((a, b) => a - b),
    categories: [...new Set(entry.categories)].sort(),
    projectKeys: [...new Set(entry.projectKeys)].sort(),
    entityKeys: [...new Set(entry.entityKeys)].sort(),
    archiveFile: `uploads/${archiveFile}`,
    actualSize: bytes.length,
    sha256,
    sizeMatches: entry.expectedSize == null || entry.expectedSize === bytes.length,
  });
}

await writeFile(path.join(databaseDir, "r2-files-manifest.json"), json(manifest));

const categoryCounts = Object.entries((workspaceApi.records ?? []).reduce((acc, row) => {
  acc[row.category] = (acc[row.category] ?? 0) + 1;
  return acc;
}, {})).sort(([a], [b]) => a.localeCompare(b, "ru"));

const summary = {
  exportedAt: new Date().toISOString(),
  source: {
    siteTitle: "Себестоимость шинопровода",
    siteSlug: "klm-busway-cost",
    savedVersion: 32,
    commitSha: "8138098632410669c0c0e5b958c07d4dbd7ba406",
  },
  d1: {
    binding: "DB",
    tables: {
      calculations: calculations.length,
      assignment_history: assignmentHistory.length,
      workspace_records: workspaceRecords.length,
    },
    workspaceCategories: Object.fromEntries(categoryCounts),
  },
  r2: {
    binding: "BUCKET",
    uniqueFiles: manifest.length,
    totalBytes: manifest.reduce((sum, item) => sum + item.actualSize, 0),
    allSizesMatch: manifest.every((item) => item.sizeMatches),
    allChecksumsPresent: manifest.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)),
  },
};

await writeFile(path.join(databaseDir, "backup-summary.json"), json(summary));
process.stdout.write(json(summary));
