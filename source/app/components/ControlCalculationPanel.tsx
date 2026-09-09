"use client";

import { useEffect, useMemo, useState } from "react";
import type { StockItem } from "./MaterialsPlanningPanel";
import {
  AvailabilityLine,
  AvailabilityStatus,
  calculateControlScenario,
  ControlDemand,
  reserveAvailability,
} from "../lib/controlCalculation";

type WorkspaceRecord = {
  id: number;
  projectKey: string;
  entityKey: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

type Props = {
  projectName: string;
  projectKey: string;
  documentKey: string;
  documentKind: "production" | "preliminary" | "manual";
  pilotDocuments: ControlPilotDocument[];
  items: ControlDemand[];
  stock: StockItem[];
  stockSource: string;
  rulesVersion: string;
};

export type ControlPilotDocument = {
  key: string;
  projectKey: string;
  number: string;
  date: string;
  kind: "production" | "preliminary";
  filename: string;
};

const statusLabels: Record<AvailabilityStatus, string> = {
  warehouse: "На складе",
  in_transit: "В пути от поставщика",
  manufacturer_production: "В производстве у поставщика",
  manufacturer_ready: "Готово у изготовителя",
};

const scenarioPresets: Array<{ label: string; statuses: AvailabilityStatus[] }> = [
  { label: "Без обеспеченности", statuses: [] },
  { label: "Только склад", statuses: ["warehouse"] },
  { label: "Склад + в пути", statuses: ["warehouse", "in_transit"] },
  { label: "Склад + в пути + производство + готово", statuses: ["warehouse", "in_transit", "manufacturer_production", "manufacturer_ready"] },
];

const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });

function parseAvailability(record: WorkspaceRecord): AvailabilityLine | null {
  const payload = record.payload;
  const status = String(payload.status ?? "") as AvailabilityStatus;
  if (!(status in statusLabels)) return null;
  return {
    id: record.id,
    code: String(payload.code ?? "").trim(),
    name: String(payload.name ?? "").trim(),
    unit: String(payload.unit ?? "").trim(),
    quantity: Number(payload.quantity) || 0,
    status,
    source: String(payload.source ?? "").trim(),
    confirmed: payload.confirmed === true,
  };
}

function dateValue(value: string) {
  const match = value.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

export default function ControlCalculationPanel({ projectName, projectKey, documentKey, documentKind, pilotDocuments, items, stock, stockSource, rulesVersion }: Props) {
  const [external, setExternal] = useState<AvailabilityLine[]>([]);
  const [snapshots, setSnapshots] = useState<WorkspaceRecord[]>([]);
  const [priorities, setPriorities] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<AvailabilityStatus[]>(["warehouse"]);
  const [form, setForm] = useState({ code: "", name: "", unit: "шт", quantity: "", status: "in_transit" as AvailabilityStatus, source: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const project = encodeURIComponent(projectKey.trim() || "Без проекта");
    Promise.all([
      fetch(`/api/workspace?category=supply_availability&project=${project}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : null),
      fetch("/api/workspace?category=control_calculation_snapshot", { signal: controller.signal }).then((response) => response.ok ? response.json() : null),
      fetch("/api/workspace?category=control_project_priority", { signal: controller.signal }).then((response) => response.ok ? response.json() : null),
    ]).then(([availabilityData, snapshotData, priorityData]) => {
      setExternal((availabilityData?.records ?? []).map(parseAvailability).filter(Boolean) as AvailabilityLine[]);
      setSnapshots((snapshotData?.records ?? []) as WorkspaceRecord[]);
      const records = (priorityData?.records ?? []) as WorkspaceRecord[];
      const latest: Record<string, string> = {};
      records.forEach((record) => { if (!(record.projectKey in latest)) latest[record.projectKey] = String(record.payload.priority ?? ""); });
      setPriorities(latest);
    }).catch(() => {});
    return () => controller.abort();
  }, [projectKey]);

  const warehouse = useMemo<AvailabilityLine[]>(() => stock.map((row) => ({
    code: row.code,
    name: row.name,
    unit: row.unit,
    quantity: Math.max(0, row.balance),
    status: "warehouse",
    source: stockSource,
    confirmed: true,
  })), [stock, stockSource]);
  const pilotProjects = useMemo(() => {
    const map = new Map<string, { projectKey: string; documents: ControlPilotDocument[]; earliestProduction: number }>();
    pilotDocuments.forEach((document) => {
      const current = map.get(document.projectKey) ?? { projectKey: document.projectKey, documents: [], earliestProduction: Number.MAX_SAFE_INTEGER };
      current.documents.push(document);
      if (document.kind === "production") current.earliestProduction = Math.min(current.earliestProduction, dateValue(document.date));
      map.set(document.projectKey, current);
    });
    return [...map.values()];
  }, [pilotDocuments]);
  const latestSnapshots = useMemo(() => {
    const map = new Map<string, WorkspaceRecord>();
    snapshots.forEach((record) => {
      const snapshotDocument = String(record.payload.documentKey ?? record.entityKey);
      const key = `${record.projectKey}|${snapshotDocument}`;
      if (!map.has(key)) map.set(key, record);
    });
    return [...map.values()];
  }, [snapshots]);
  const allocatedWarehouse = useMemo(() => {
    const currentPriority = Number(priorities[projectKey]);
    if (!(currentPriority > 0)) return warehouse;
    const currentProject = pilotProjects.find((project) => project.projectKey === projectKey);
    const currentDate = currentProject?.earliestProduction ?? Number.MAX_SAFE_INTEGER;
    const higherProjects = new Set(pilotProjects.filter((project) => {
      if (project.projectKey === projectKey) return false;
      const priority = Number(priorities[project.projectKey]);
      return priority > 0 && (priority < currentPriority || (priority === currentPriority && project.earliestProduction < currentDate));
    }).map((project) => project.projectKey));
    const reserved = latestSnapshots.filter((record) =>
      higherProjects.has(record.projectKey) && record.payload.documentKind === "production" && Array.isArray(record.payload.demand),
    ).map((record) => record.payload.demand as ControlDemand[]);
    return reserveAvailability(warehouse, reserved);
  }, [warehouse, priorities, projectKey, pilotProjects, latestSnapshots]);
  const availability = useMemo(() => [...allocatedWarehouse, ...external], [allocatedWarehouse, external]);
  const presetResults = useMemo(() => scenarioPresets.map((preset) => ({
    ...preset,
    result: calculateControlScenario(items, availability, preset.statuses),
  })), [items, availability]);
  const selectedResult = useMemo(() => calculateControlScenario(items, availability, selected), [items, availability, selected]);
  const pilotSnapshots = useMemo(() => new Set(latestSnapshots.map((row) => `${row.projectKey}|${String(row.payload.documentKey ?? row.entityKey)}`)).size, [latestSnapshots]);

  function toggleStatus(status: AvailabilityStatus) {
    setSelected((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status]);
  }

  async function addAvailability() {
    const quantity = Number(String(form.quantity).replace(",", "."));
    if (!form.code.trim() || !form.name.trim() || !form.unit.trim() || !(quantity > 0)) {
      setMessage("Заполните код 1С, наименование, единицу и количество больше нуля.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const payload = { ...form, quantity, confirmed: false };
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: "supply_availability",
          projectKey: projectKey.trim() || "Без проекта",
          entityKey: `${form.status}|${form.code}|${Date.now()}`,
          payload,
        }),
      });
      const data = await response.json() as { record?: WorkspaceRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "Не удалось сохранить строку");
      const line = parseAvailability(data.record);
      if (line) setExternal((current) => [line, ...current]);
      setForm({ code: "", name: "", unit: form.unit, quantity: "", status: form.status, source: form.source });
      setMessage("Строка сохранена. Она начнёт участвовать в расчёте после ручного подтверждения галочкой.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить строку");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAvailabilityConfirmation(line: AvailabilityLine, confirmed: boolean) {
    if (!line.id) return;
    setBusy(true);
    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: line.id, payload: { ...line, confirmed } }),
      });
      const data = await response.json() as { record?: WorkspaceRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "Не удалось сохранить подтверждение");
      setExternal((current) => current.map((item) => item.id === line.id ? { ...item, confirmed } : item));
      setMessage(confirmed ? "Поставка подтверждена и включена в выбранные сценарии." : "Подтверждение снято; поставка больше не уменьшает потребность.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить подтверждение");
    } finally {
      setBusy(false);
    }
  }

  async function savePriorities() {
    setBusy(true);
    setMessage("");
    try {
      for (const project of pilotProjects) {
        const priority = Number(priorities[project.projectKey]);
        if (!(priority > 0)) continue;
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            category: "control_project_priority",
            projectKey: project.projectKey,
            entityKey: project.projectKey,
            payload: { priority, ruleVersion: 1, updatedAt: new Date().toISOString() },
          }),
        });
        const data = await response.json() as { record?: WorkspaceRecord; error?: string };
        if (!response.ok || !data.record) throw new Error(data.error || `Не удалось сохранить приоритет «${project.projectKey}»`);
      }
      setMessage("Ручные приоритеты сохранены. Меньшее число получает складской остаток раньше.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить приоритеты");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAvailability(line: AvailabilityLine) {
    if (!line.id) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/workspace?id=${line.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Не удалось удалить строку");
      setExternal((current) => current.filter((item) => item.id !== line.id));
      setMessage("Строка обеспеченности удалена.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить строку");
    } finally {
      setBusy(false);
    }
  }

  async function saveSnapshot() {
    setBusy(true);
    setMessage("");
    try {
      const createdAt = new Date().toISOString();
      const payload = {
        schemaVersion: 1,
        mode: "shadow",
        createdAt,
        rulesVersion,
        tolerance: { codesExact: true, quantitiesExact: true, monetaryPercent: 1 },
        stockSource,
        projectKey,
        documentKey,
        documentKind,
        selectedStatuses: selected,
        demand: items,
        availability,
        result: selectedResult,
      };
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: "control_calculation_snapshot",
          projectKey: projectKey.trim() || "Без проекта",
          entityKey: createdAt,
          payload,
        }),
      });
      const data = await response.json() as { record?: WorkspaceRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "Не удалось сохранить снимок");
      setSnapshots((current) => [data.record!, ...current]);
      setMessage("Контрольный снимок сохранён отдельно. Рабочий расчёт не изменён.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить снимок");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel control-circuit">
    <div className="panel-title">
      <div><span>К</span><h2>Контрольный контур</h2></div>
      <small>теневой режим · {pilotDocuments.length} документов · {pilotSnapshots} снимков</small>
    </div>

    <div className="control-pilot-set">
      <div className="control-pilot-head"><div><h3>Первый контрольный набор</h3><small>Все загруженные заказы и предварительные спецификации</small></div><button className="stock-upload" disabled={busy} onClick={() => void savePriorities()}>Сохранить приоритеты</button></div>
      <div className="table-wrap"><table><thead><tr><th>Проект</th><th>Документы</th><th>Приоритет склада</th><th>Правило</th></tr></thead><tbody>{pilotProjects.map((project) => <tr key={project.projectKey}><td><strong>{project.projectKey}</strong></td><td>{project.documents.map((document) => <small key={document.key}>{document.kind === "production" ? "Заказ" : "Предварительная"} № {document.number} · {document.date}</small>)}</td><td><input type="number" min="1" step="1" value={priorities[project.projectKey] ?? ""} onChange={(event) => setPriorities((current) => ({ ...current, [project.projectKey]: event.target.value }))} aria-label={`Приоритет проекта ${project.projectKey}`} placeholder="1" /></td><td>{project.documents.some((document) => document.kind === "production") ? "Резерв по ручному приоритету" : "Контроль без резерва склада"}</td></tr>)}</tbody></table></div>
      <small className="control-rule-note">Стандартное правило: 1 — наивысший приоритет; резервируют только заказы на производство; предварительные спецификации склад не резервируют; при равном приоритете раньше получает проект с более ранней датой заказа. Сопоставление — только одинаковый код 1С и единица измерения.</small>
    </div>
    <div className="notice control-circuit-notice">
      <b>Базовая себестоимость защищена</b>
      <span>Остатки и поставки меняют только расчёт потребности к закупке. Исходный состав и полная стоимость оборудования не перезаписываются.</span>
    </div>

    <div className="control-scenario-grid">
      {presetResults.map(({ label, result }) => <article key={label}>
        <small>{label}</small>
        <strong>{result.procurementCost === null ? "Стоимость не определена" : money.format(result.procurementCost)}</strong>
        <span>{result.coveredRows} из {result.rows.length} позиций покрыто полностью</span>
        <span>{result.unresolvedRows} требуют подтверждения кода или единицы</span>
      </article>)}
    </div>

    <div className="control-config-grid">
      <div>
        <h3>Проверяемый сценарий</h3>
        {(Object.keys(statusLabels) as AvailabilityStatus[]).map((status) => <label className="control-checkbox" key={status}>
          <input type="checkbox" checked={selected.includes(status)} onChange={() => toggleStatus(status)} />
          <span>{statusLabels[status]}</span>
        </label>)}
        <div className="control-selected-result">
          <span>К закупке по выбранному сценарию</span>
          <strong>{selectedResult.procurementCost === null ? "Есть позиции без цены" : money.format(selectedResult.procurementCost)}</strong>
          <small>Допуск эталона: коды и количества точно; стоимость ≤ 1%.</small>
        </div>
        <button className="primary control-save" disabled={busy || !items.length} onClick={() => void saveSnapshot()}>Сохранить контрольный снимок</button>
      </div>
      <div>
        <h3>Поставка для текущего проекта</h3>
        <div className="control-supply-form">
          <label>Статус<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AvailabilityStatus })}><option value="in_transit">В пути</option><option value="manufacturer_production">В производстве у поставщика</option><option value="manufacturer_ready">Готово у изготовителя</option></select></label>
          <label>Код 1С<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="Ц0000000000" /></label>
          <label className="control-wide">Наименование<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Ед.<input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label>
          <label>Количество<input inputMode="decimal" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label>
          <label className="control-wide">Источник / поставщик<input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label>
        </div>
        <button className="stock-upload" disabled={busy} onClick={() => void addAvailability()}>Добавить строку</button>
      </div>
    </div>

    {message && <p className="status">{message}</p>}
    {external.length > 0 && <div className="table-wrap control-supply-table"><table><thead><tr><th>Подтверждение</th><th>Статус</th><th>Код / наименование</th><th>Количество</th><th>Источник</th><th></th></tr></thead><tbody>{external.map((line) => <tr key={line.id ?? `${line.status}-${line.code}`} className={line.confirmed ? "covered-row" : "mapping-row"}><td><label className="supply-confirmation"><input type="checkbox" checked={line.confirmed === true} disabled={busy} onChange={(event) => void toggleAvailabilityConfirmation(line, event.target.checked)} /><span>{line.confirmed ? "Подтверждено" : "Не подтверждено"}</span></label></td><td><span className={`planning-status ${line.confirmed ? "covered" : "mapping"}`}>{statusLabels[line.status]}</span></td><td><small>{line.code}</small><strong>{line.name}</strong></td><td>{number.format(line.quantity)} {line.unit}</td><td>{line.source || "—"}</td><td><button className="danger-link" disabled={busy} onClick={() => void deleteAvailability(line)}>Удалить</button></td></tr>)}</tbody></table></div>}

    <details className="control-details">
      <summary>Показать расчёт по позициям ({selectedResult.rows.length})</summary>
      <div className="table-wrap"><table><thead><tr><th>Код / ресурс</th><th>Требуется</th><th>Покрыто</th><th>К закупке</th><th>Стоимость закупки</th><th>Контроль</th></tr></thead><tbody>{selectedResult.rows.map((row) => <tr key={row.key} className={row.confidence === "unresolved" ? "mapping-row" : row.procurementQty > 0 ? "shortage-row" : "covered-row"}><td><small>{row.code || "код не подтверждён"}</small><strong>{row.name}</strong></td><td>{number.format(row.requiredQty)} {row.unit}</td><td>{number.format(row.coveredQty)} {row.unit}</td><td><strong>{number.format(row.procurementQty)} {row.unit}</strong></td><td>{row.procurementCost === null ? "цена не подтверждена" : money.format(row.procurementCost)}</td><td><span className={`planning-status ${row.confidence === "unresolved" ? "mapping" : row.procurementQty > 0 ? "shortage" : "covered"}`}>{row.confidence === "unresolved" ? "Уточнить" : row.procurementQty > 0 ? "Дефицит" : "Покрыто"}</span><small>{row.reason}</small></td></tr>)}</tbody></table></div>
    </details>
  </section>;
}
