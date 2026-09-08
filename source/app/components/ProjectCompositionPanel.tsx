"use client";

import { ChangeEvent, Dispatch, SetStateAction, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type WorkflowState = "received" | "in_progress";
type RowFilter = "all" | "missing" | "complete";

export type ProjectRow = {
  id: string;
  rowNumber: string;
  priority: string;
  checked: string;
  specification: string;
  line: string;
  item: string;
  article: string;
  quantity: number;
  unit: string;
  marking: string;
  drawingNumber: string;
  l1: string;
  l2: string;
  l3: string;
  version: string;
  constructionType: string;
  extra: string;
};

export type ProjectOrder = {
  id: string;
  number: string;
  date: string;
  filename: string;
  specification: string;
  workflow: WorkflowState;
  rows: ProjectRow[];
  loadedAt: string;
  projectName?: string;
  recordId?: number;
  documentRecordId?: number;
  sourceKind?: "production_order" | "preliminary_specification";
};

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const stringValue = (value: unknown) => String(value ?? "").replace(/\u00a0/g, " ").trim();

const numberValue = (value: unknown) => {
  const parsed = Number(stringValue(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const headerAliases: Record<keyof Omit<ProjectRow, "id">, string[]> = {
  rowNumber: ["№ п/п", "номер п/п"],
  priority: ["приоритет"],
  checked: ["проверено отк", "проверено"],
  specification: ["документ спецификации", "спецификация"],
  line: ["наименование линии", "линия"],
  item: ["номенклатура", "наименование"],
  article: ["артикул"],
  quantity: ["количество", "кол-во"],
  unit: ["ед. изм.", "ед. изм", "единица измерения"],
  marking: ["маркировка"],
  drawingNumber: ["номер чертежа", "№ чертежа"],
  l1: ["l1"],
  l2: ["l2"],
  l3: ["l3"],
  version: ["v", "версия"],
  constructionType: ["тип конструктива", "конструктив"],
  extra: ["доп информация", "доп. информация", "примечание"],
};

function getColumn(headers: string[], key: keyof typeof headerAliases) {
  const aliases = headerAliases[key].map(normalizeHeader);
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function getCell(row: unknown[], headers: string[], key: keyof typeof headerAliases) {
  const index = getColumn(headers, key);
  return index >= 0 ? row[index] : "";
}

export async function parseProductionOrder(file: File, forcedProjectName?: string): Promise<ProjectOrder> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("В книге отсутствуют листы.");

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });
  const headerIndex = matrix.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell) === "номер чертежа"),
  );
  if (headerIndex < 0) throw new Error("Не найден столбец «Номер чертежа».");

  const headers = matrix[headerIndex].map(stringValue);
  const required = ["rowNumber", "item", "article", "drawingNumber"] as const;
  const missingHeaders = required.filter((key) => getColumn(headers, key) < 0);
  if (missingHeaders.length) {
    throw new Error("Структура файла не соответствует выгрузке заказа из 1С.");
  }

  const rows = matrix
    .slice(headerIndex + 1)
    .filter((row) => {
      const rowNumber = stringValue(getCell(row, headers, "rowNumber"));
      const item = stringValue(getCell(row, headers, "item"));
      const article = stringValue(getCell(row, headers, "article"));
      return Boolean(rowNumber || item || article);
    })
    .map((row, index): ProjectRow => ({
      id: `${file.name}-${index}`,
      rowNumber: stringValue(getCell(row, headers, "rowNumber")) || String(index + 1),
      priority: stringValue(getCell(row, headers, "priority")),
      checked: stringValue(getCell(row, headers, "checked")),
      specification: stringValue(getCell(row, headers, "specification")),
      line: stringValue(getCell(row, headers, "line")),
      item: stringValue(getCell(row, headers, "item")),
      article: stringValue(getCell(row, headers, "article")),
      quantity: numberValue(getCell(row, headers, "quantity")),
      unit: stringValue(getCell(row, headers, "unit")),
      marking: stringValue(getCell(row, headers, "marking")),
      drawingNumber: stringValue(getCell(row, headers, "drawingNumber")),
      l1: stringValue(getCell(row, headers, "l1")),
      l2: stringValue(getCell(row, headers, "l2")),
      l3: stringValue(getCell(row, headers, "l3")),
      version: stringValue(getCell(row, headers, "version")),
      constructionType: stringValue(getCell(row, headers, "constructionType")),
      extra: stringValue(getCell(row, headers, "extra")),
    }));

  if (!rows.length) throw new Error("В выгрузке не найден состав проекта.");

  const numberMatch = file.name.match(/\b(\d{11})\b/);
  const dateMatch = file.name.match(/от\s+(\d{2}\.\d{2}\.\d{4})/i);
  const number = numberMatch?.[1] ?? `Excel-${Date.now()}`;
  const knownWorkflow: WorkflowState = number === "02600000351" ? "in_progress" : "received";
  const projectName = file.name
    .split(/заказ\s+на\s+производство/i)[0]
    .replace(/[_.\-\s]+$/g, "")
    .trim();

  return {
    id: `${number}-${file.lastModified}`,
    number,
    date: dateMatch?.[1] ?? "Дата не определена",
    filename: file.name,
    specification: rows.find((row) => row.specification)?.specification ?? "Не указана",
    workflow: knownWorkflow,
    rows,
    loadedAt: new Date().toISOString(),
    projectName: forcedProjectName?.trim() || projectName || undefined,
    sourceKind: "production_order",
  };
}

export function orderMetrics(order: ProjectOrder) {
  const complete = order.rows.filter((row) => row.drawingNumber.trim()).length;
  const missing = order.rows.length - complete;
  const progress = order.rows.length ? Math.round((complete / order.rows.length) * 1000) / 10 : 0;
  const quantity = order.rows.reduce((sum, row) => sum + row.quantity, 0);
  const lines = new Set(order.rows.map((row) => row.line).filter(Boolean)).size;
  const ready = order.rows.length > 0 && missing === 0;
  return { complete, missing, progress, quantity, lines, ready };
}

export function workflowLabel(order: ProjectOrder) {
  const metrics = orderMetrics(order);
  if (metrics.ready) return "Готов к производству";
  return order.workflow === "in_progress" ? "В работе КО" : "Поступил в КО";
}

type ProjectCompositionPanelProps = {
  orders: ProjectOrder[];
  setOrders: Dispatch<SetStateAction<ProjectOrder[]>>;
  onCalculateOrder?: (order: ProjectOrder) => void;
  onOpenCurrentOrder?: (orderNumber: string) => void;
  onImportFiles?: (files: File[]) => Promise<ProjectOrder[]>;
  onDeleteOrder?: (order: ProjectOrder) => Promise<void>;
};

export default function ProjectCompositionPanel({ orders, setOrders, onCalculateOrder, onOpenCurrentOrder, onImportFiles, onDeleteOrder }: ProjectCompositionPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<RowFilter>("missing");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const activeOrder = orders.find((order) => order.id === activeId) ?? orders[0];
  const metrics = activeOrder ? orderMetrics(activeOrder) : null;
  const filteredRows = useMemo(() => {
    if (!activeOrder) return [];
    const normalizedQuery = normalizeHeader(query);
    return activeOrder.rows.filter((row) => {
      const hasDrawing = Boolean(row.drawingNumber.trim());
      const matchesFilter = filter === "all" || (filter === "missing" ? !hasDrawing : hasDrawing);
      const haystack = normalizeHeader(`${row.rowNumber} ${row.line} ${row.item} ${row.article} ${row.marking} ${row.drawingNumber}`);
      return matchesFilter && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [activeOrder, filter, query]);

  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setLoading(true);
    setError("");
    try {
      const parsed = onImportFiles ? await onImportFiles(files) : await Promise.all(files.map((file) => parseProductionOrder(file)));
      if (!onImportFiles) setOrders((current) => {
          const next = [...current];
          parsed.forEach((order) => {
            const index = next.findIndex((candidate) => candidate.number === order.number);
            if (index >= 0) next[index] = order;
            else next.unshift(order);
          });
          return next;
        });
      setActiveId(parsed[0].id);
      setFilter("missing");
      setPage(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось прочитать Excel-файл.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  function updateDrawing(rowId: string, drawingNumber: string) {
    if (!activeOrder) return;
    setOrders((current) =>
      current.map((order) =>
        order.id === activeOrder.id
          ? {
              ...order,
              workflow: "in_progress",
              rows: order.rows.map((row) => (row.id === rowId ? { ...row, drawingNumber } : row)),
            }
          : order,
      ),
    );
  }

  function startWork() {
    if (!activeOrder) return;
    setOrders((current) => current.map((order) => (order.id === activeOrder.id ? { ...order, workflow: "in_progress" } : order)));
  }

  async function deleteOrder(order: ProjectOrder) {
    if (!window.confirm(`Удалить заказ № ${order.number}? Это действие удалит его из текущего состава.`)) return;
    try {
      if (onDeleteOrder) await onDeleteOrder(order);
      else setOrders((current) => current.filter((candidate) => candidate.id !== order.id));
      setActiveId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить заказ.");
    }
  }

  function changeFilter(next: RowFilter) {
    setFilter(next);
    setPage(1);
  }

  return (
    <div className="project-composition">
      <div className="notice composition-notice">
        <b>Правило передачи в производство</b>
        <span>Учитываются только фактические строки состава. Заказ становится готовым к передаче, когда «Номер чертежа» заполнен во всех строках.</span>
      </div>

      <div className={`import-layout ${orders.length ? "" : "single"}`}>
        <section className="panel upload-panel">
          <div className="panel-title">
            <div><span>01</span><h2>Заказ на производство</h2></div>
            <small>фактическая Excel-выгрузка</small>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple onChange={handleFiles} hidden />
          <button className="dropzone" onClick={() => inputRef.current?.click()} disabled={loading}>
            <span className="upload-icon">⇧</span>
            <strong>{loading ? "Читаю выгрузку…" : "Загрузить выгрузку заказа"}</strong>
            <small>.xlsx или .xls · можно выбрать несколько заказов</small>
          </button>
          {error && <p className="import-error">{error}</p>}
          <div className="source-modes">
            <div className="source-mode active"><b>Excel</b><span>Рабочий импорт</span></div>
          </div>
        </section>

        {orders.length > 0 && <section className="panel examples-panel">
          <div className="panel-title">
            <div><span>02</span><h2>Загруженные контрольные заказы</h2></div>
            <small>{onImportFiles ? "сохранены между сеансами" : "только текущий сеанс"}</small>
          </div>
          <div className="example-orders">
            {orders.map((order) => {
              const orderData = orderMetrics(order);
              return <button type="button" className="example-order linked" key={order.id} onClick={() => onOpenCurrentOrder?.(order.number)}>
                <div><strong>№ {order.number}</strong><small>от {order.date}</small></div>
                <span className={orderData.missing ? "order-state work" : "order-state ready"}>{workflowLabel(order)}</span>
                <i><b style={{ width: `${orderData.progress}%` }} /></i>
                <footer><span>{orderData.complete} из {order.rows.length} чертежей</span><strong>{orderData.progress}%</strong></footer>
                <span className="control-order-link">Открыть в текущих заказах →</span>
              </button>;
            })}
          </div>
        </section>}
      </div>

      {orders.length > 0 && <section className="panel order-workspace">
        <div className="panel-title order-title">
          <div><span>03</span><h2>Заказы конструкторского отдела</h2></div>
          <small>{orders.length} загружено</small>
        </div>
        <div className="order-tabs">
          {orders.map((order) => {
            const orderReady = orderMetrics(order).ready;
            return <button key={order.id} className={order.id === activeOrder?.id ? "active" : ""} onClick={() => { setActiveId(order.id); setPage(1); }}>
              <span className={orderReady ? "dot ready" : "dot"} />
              <b>№ {order.number}</b>
              <small>{workflowLabel(order)}</small>
            </button>;
          })}
        </div>

        {activeOrder && metrics && <>
          <div className={`readiness-banner ${metrics.ready ? "is-ready" : ""}`}>
            <div>
              <small>{activeOrder.sourceKind === "preliminary_specification" ? "Черновик заказа из предварительной спецификации" : "Заказ на производство"}</small>
              <h3>№ {activeOrder.number} от {activeOrder.date}</h3>
              <p>{activeOrder.specification}</p>
            </div>
            <div className="readiness-status">
              <span>{workflowLabel(activeOrder)}</span>
              <strong>{metrics.progress}%</strong>
              {!metrics.ready && activeOrder.workflow === "received" && <button onClick={startWork}>Взять в работу</button>}
              {onCalculateOrder && <button className="calculate-order" onClick={() => onCalculateOrder(activeOrder)}>Выгрузить в калькулятор</button>}
              <button className="danger-button" onClick={() => void deleteOrder(activeOrder)}>Удалить заказ</button>
            </div>
          </div>

          <div className="composition-kpis">
            <div><span>Строк состава</span><strong>{activeOrder.rows.length}</strong><small>фактические позиции</small></div>
            <div><span>Чертежи заполнены</span><strong>{metrics.complete}</strong><small>из {activeOrder.rows.length}</small></div>
            <div className={metrics.missing ? "risk" : "ok"}><span>Без номера чертежа</span><strong>{metrics.missing}</strong><small>{metrics.ready ? "блокировок нет" : "блокируют передачу"}</small></div>
            <div><span>Изделий / линий</span><strong>{metrics.quantity} / {metrics.lines}</strong><small>шт. / уникальных линий</small></div>
          </div>

          <div className="completion-track"><i><b style={{ width: `${metrics.progress}%` }} /></i><span>{metrics.complete} заполнено · {metrics.missing} осталось</span></div>

          <div className="table-toolbar">
            <div className="filter-group">
              <button className={filter === "all" ? "active" : ""} onClick={() => changeFilter("all")}>Все {activeOrder.rows.length}</button>
              <button className={filter === "missing" ? "active" : ""} onClick={() => changeFilter("missing")}>Без чертежа {metrics.missing}</button>
              <button className={filter === "complete" ? "active" : ""} onClick={() => changeFilter("complete")}>Заполнено {metrics.complete}</button>
            </div>
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Поиск по линии, артикулу, маркировке…" aria-label="Поиск по составу заказа" />
          </div>

          <div className="table-wrap project-table-wrap">
            <table className="project-table">
              <thead><tr><th>№</th><th>Линия / маркировка</th><th>Номенклатура / артикул</th><th>Кол-во</th><th>Размеры</th><th>Номер чертежа</th></tr></thead>
              <tbody>{visibleRows.map((row) => <tr key={row.id} className={row.drawingNumber.trim() ? "complete-row" : "missing-row"}>
                <td>{row.rowNumber}</td>
                <td><strong>{row.line || "—"}</strong><small>{row.marking ? `Маркировка: ${row.marking}` : "Маркировка не указана"}</small></td>
                <td><strong>{row.item}</strong><small>{row.article}</small></td>
                <td>{row.quantity} {row.unit}</td>
                <td>{[row.l1, row.l2, row.l3].filter(Boolean).join(" × ") || "—"}</td>
                <td><input className={row.drawingNumber.trim() ? "drawing-complete" : "drawing-missing"} value={row.drawingNumber} onChange={(event) => updateDrawing(row.id, event.target.value)} placeholder="Требуется номер" /></td>
              </tr>)}</tbody>
            </table>
          </div>

          {!visibleRows.length && <div className="empty">По выбранному фильтру строк нет.</div>}
          {filteredRows.length > pageSize && <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Назад</button>
            <span>Страница {page} из {pageCount} · {filteredRows.length} строк</span>
            <button disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Далее →</button>
          </div>}
        </>}
      </section>}

      {!orders.length && <section className="empty-workspace">
        <span>Состав проекта появится здесь</span>
        <h2>Загрузите заказ на производство из Excel</h2>
        <p>Панель определит строки состава, посчитает заполненность чертежей и покажет, что блокирует передачу заказа в производство.</p>
      </section>}

    </div>
  );
}
