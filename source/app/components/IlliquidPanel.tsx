"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type WorkspaceRecord = {
  id: number;
  payload: Record<string, unknown>;
  createdAt: string;
};

type IlliquidItem = {
  rowNumber: string;
  code: string;
  article: string;
  name: string;
  unit: string;
  quantity: number;
  location: string;
  comment: string;
};

const normalize = (value: unknown) =>
  String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const numeric = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/\u00a0/g, "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

function findColumn(headers: string[], patterns: RegExp[]) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

async function parseIlliquid(file: File): Promise<IlliquidItem[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    const headerIndex = matrix.slice(0, 80).findIndex((row) => {
      const cells = row.map(normalize);
      return cells.some((cell) => /номенклатур|наименован|элемент|изделие/.test(cell)) && cells.some((cell) => /кол-?во|количеств|остат/.test(cell));
    });
    if (headerIndex < 0) continue;
    const headers = matrix[headerIndex].map(normalize);
    const nameIndex = findColumn(headers, [/^номенклатур/, /^наименован/, /^элемент/, /^изделие/]);
    const quantityIndex = findColumn(headers, [/конечный остаток/, /^остаток/, /кол-?во/, /количеств/]);
    const codeIndex = findColumn(headers, [/^код$/, /код 1с/, /код номенклатур/]);
    const articleIndex = findColumn(headers, [/артикул/]);
    const unitIndex = findColumn(headers, [/ед\.?.?\s*изм/, /единиц/]);
    const locationIndex = findColumn(headers, [/место/, /ячейк/, /стеллаж/, /склад/]);
    const commentIndex = findColumn(headers, [/комментар/, /примечан/, /состояние/]);
    const rows = matrix.slice(headerIndex + 1).map((row, index) => ({
      rowNumber: String(index + 1),
      code: codeIndex >= 0 ? String(row[codeIndex] ?? "").trim() : "",
      article: articleIndex >= 0 ? String(row[articleIndex] ?? "").trim() : "",
      name: String(row[nameIndex] ?? "").trim(),
      unit: unitIndex >= 0 ? String(row[unitIndex] ?? "").trim() : "шт",
      quantity: numeric(row[quantityIndex]),
      location: locationIndex >= 0 ? String(row[locationIndex] ?? "").trim() : "",
      comment: commentIndex >= 0 ? String(row[commentIndex] ?? "").trim() : "",
    })).filter((row) => row.name && row.quantity !== 0);
    if (rows.length) return rows;
  }
  throw new Error("Не найдены столбцы «Номенклатура/Наименование» и «Количество/Остаток».");
}

export default function IlliquidPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<IlliquidItem[]>([]);
  const [source, setSource] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/workspace?category=illiquid_snapshot")
      .then((response) => response.ok ? response.json() : null)
      .then((data: { records?: WorkspaceRecord[] } | null) => {
        const latest = data?.records?.[0];
        if (!latest) return;
        setItems(Array.isArray(latest.payload.items) ? latest.payload.items as IlliquidItem[] : []);
        setSource(String(latest.payload.fileName ?? ""));
        setUpdatedAt(latest.createdAt);
      })
      .catch(() => setMessage("Не удалось загрузить сохранённый реестр неликвидов."));
  }, []);

  const filtered = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return items;
    return items.filter((row) => normalize(`${row.code} ${row.article} ${row.name} ${row.location} ${row.comment}`).includes(needle));
  }, [items, query]);
  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLoading(true);
    setMessage("");
    try {
      const parsed = await parseIlliquid(file);
      const form = new FormData();
      form.set("file", file);
      form.set("projectKey", "__ILLIQUID__");
      form.set("docType", "Реестр неликвидов");
      form.set("category", "illiquid_file");
      form.set("snapshot", JSON.stringify({ capturedAt: new Date().toISOString(), rows: parsed.length }));
      const fileResponse = await fetch("/api/documents", { method: "POST", body: form });
      const fileData = await fileResponse.json() as { record?: WorkspaceRecord; error?: string };
      if (!fileResponse.ok || !fileData.record) throw new Error(fileData.error || "Не удалось сохранить исходный файл");

      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "illiquid_snapshot", projectKey: "__ILLIQUID__", entityKey: file.name, payload: { fileName: file.name, items: parsed, documentRecordId: fileData.record.id } }),
      });
      const data = await response.json() as { record?: WorkspaceRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "Не удалось сохранить реестр");
      setItems(parsed);
      setSource(file.name);
      setUpdatedAt(data.record.createdAt);
      setPage(1);
      setMessage(`Загружено позиций: ${parsed.length}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка загрузки неликвидов");
    } finally {
      setLoading(false);
    }
  }

  return <div className="enterprise-workspace illiquid-workspace">
    {message && <div className="notice enterprise-status"><b>{message}</b></div>}
    <section className="panel materials-head">
      <div><p className="eyebrow">Склад производства</p><h2>Невостребованные элементы и комплектующие</h2><span>Источник: {source || "файл ещё не загружен"}</span><small>Последнее сохранение: {updatedAt ? new Date(updatedAt).toLocaleString("ru-RU") : "—"}</small></div>
      <div className="materials-actions"><input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" hidden onChange={upload} /><button className="stock-upload" disabled={loading} onClick={() => inputRef.current?.click()}>{loading ? "Читаю файл…" : "Загрузить неликвиды"}</button><small>Исходный файл и распознанный состав сохраняются</small></div>
    </section>
    <section className="panel">
      <div className="panel-title"><div><span>01</span><h2>Реестр неликвидов</h2></div><small>{filtered.length} позиций</small></div>
      <div className="table-toolbar"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Код, артикул, наименование, место хранения" /></div>
      <div className="table-wrap"><table className="materials-table"><thead><tr><th>Код 1С</th><th>Артикул</th><th>Наименование</th><th>Количество</th><th>Ед.</th><th>Место хранения</th><th>Комментарий</th></tr></thead><tbody>{visible.map((row) => <tr key={`${row.rowNumber}-${row.code}-${row.article}`}><td>{row.code || "—"}</td><td>{row.article || "—"}</td><td><strong>{row.name}</strong></td><td>{row.quantity.toLocaleString("ru-RU")}</td><td>{row.unit || "—"}</td><td>{row.location || "—"}</td><td>{row.comment || "—"}</td></tr>)}</tbody></table></div>
      {!visible.length && <div className="empty">Загрузите файл неликвидов или измените условие поиска.</div>}
      {filtered.length > pageSize && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Назад</button><span>Страница {page} из {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Вперёд →</button></div>}
    </section>
  </div>;
}
