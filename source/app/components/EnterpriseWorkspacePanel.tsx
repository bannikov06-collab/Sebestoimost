"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import parametricSource from "../data/parametricModels.json";
import elementCatalogSource from "../data/elementCatalog.json";
import { getCalculationCoverage, normalizeElementFamily } from "../lib/calculationCoverage";
import { calculateBreakerDiscountPrices } from "../lib/breakerPricing";
import { buildBreakerIndexes, BreakerCatalogRow, isBreakerText, matchBreaker, matchBreakerStock, normalizeBreakerArticle, normalizeBreakerName } from "../lib/breakerMatching";
import { calculateKomMaterials, findKomEnvelope, KomConnection, kom250Drawing, kom250Fasteners, kom250SheetParts } from "../lib/komSelection";
import type { StockItem } from "./MaterialsPlanningPanel";
import type { ProjectOrder } from "./ProjectCompositionPanel";

type Mode = "projects" | "commercial" | "reservations" | "models" | "breakers" | "management" | "shifts";
type WorkspaceRecord = { id: number; category: string; projectKey: string; entityKey: string; createdAt: string; payload: Record<string, unknown> };
type Props = {
  mode: Mode;
  orders: ProjectOrder[];
  stock: StockItem[];
  onOpenComposition?: () => void;
  onImportOrders?: (files: File[], projectKey?: string) => Promise<ProjectOrder[]>;
  onDeleteOrder?: (order: ProjectOrder) => Promise<void>;
  onSelectOrder?: (order: ProjectOrder) => void;
  onProjectDeleted?: (projectKey: string) => void;
};
type BreakerPriceDraft = { date: string; price: string; actual: string };

const documentTypes = ["Договор поставки", "Договорная спецификация", "Коммерческое предложение", "Дополнительное соглашение", "Приложение"];
const productionCompensators = [
  [100,1,30,1,30,50,1,1,"трубка",1.5,"—","22×1,5"],[160,1,30,1,30,50,1,1,"трубка",1.5,"—","22×1,5"],
  [250,1,30,1,30,50,1,1,"трубка",1.5,"—","22×1,5"],[400,1,30,1,40,100,2,2,"трубка",1.5,"—","30×1,5"],
  [630,1,50,1,40,150,3,3,"трубка",1.5,"—","30×1,5"],[800,1,65,1,60,200,4,4,"трубка",1.5,"—","42×1,5"],
  [1000,1,100,1,100,300,6,6,"лист",3,200,"70×3"],[1250,1,130,1,100,400,8,8,"лист",3,203,"70×3"],
  [1600,1,160,1,100,500,10,10,"лист",3,204,"70×3"],[2000,1,200,1,160,600,12,12,"лист",3,321,"109×3"],
  [2500,2,130,2,120,500,10,20,"лист",3,242,"83×3"],[3200,2,160,2,160,800,16,32,"лист",3,324,"109×3"],
  [4000,2,200,2,200,1000,20,40,"лист",3,404,"134×3"],[5000,4,130,4,140,600,12,48,"лист",3,282,"96×3"],
  [6300,4,160,4,160,800,16,64,"лист",3,324,"109×3"],
] as const;
const fasteningNodes = [
  { code: "В.1.1.1.1", profile: "KLM-E PLU 40×40×3,0", profileM: 2, bracket: "В.1.1.1.1.001", brackets: 2, bolts70: 4, bolts30: 4, nuts: 8, anchors: 4 },
  { code: "В.1.2.1.2", profile: "KLM-E PLU 40×40×3,0", profileM: 2, bracket: "KLM-E RKU 600×2,5", brackets: 2, bolts70: 8, bolts30: 4, nuts: 8, anchors: 8 },
  { code: "В.1.2.1.4", profile: "KLM-E PLU 40×40×3,0", profileM: 2, bracket: "KLM-E RKU 800×2,5", brackets: 2, bolts70: 8, bolts30: 4, nuts: 8, anchors: 8 },
  { code: "В.1.3.1.5", profile: "KLM-E PLU 40×40×3,0", profileM: 2, bracket: "KLM-E RKU 900×2,5", brackets: 2, bolts70: 12, bolts30: 8, nuts: 12, anchors: 12 },
  { code: "В.1.3.1.7", profile: "KLM-E PLU 40×40×3,0", profileM: 2, bracket: "KLM-E RKU 1200×3,0", brackets: 2, bolts70: 12, bolts30: 8, nuts: 12, anchors: 12 },
  { code: "В.1.3.1.8", profile: "KLM-E PLU 40×40×3,0", profileM: 2, bracket: "KLM-E RKU 1500×3,0", brackets: 2, bolts70: 12, bolts30: 8, nuts: 12, anchors: 12 },
  { code: "Г.1.1.1.1", profile: "KLM-E PLP 40×40×3", profileM: 0.5, bracket: "Г.1.1.1.1.001", brackets: 1, bolts70: 2, bolts30: 0, nuts: 4, anchors: 2 },
  { code: "Г.1.2.1.2 / Г.1.3.1.2", profile: "KLM-E PLP 40×40×3", profileM: 0.5, bracket: "KLM-E RKU 600×2,5", brackets: 1, bolts70: 4, bolts30: 0, nuts: 4, anchors: 4 },
];
const baseDocuments = [
  ["Параметрические модели","База параметрических моделей v2.4.xlsm","Общая база · .001–.010"],
  ["Компенсаторы","расчетная таблица КОСИЧКИ с учетом испытаний 17.08.2026.xlsx","Для производства"],
  ["Нормы проектных работ","Нормы ПО 1.0 от 01.06.2026.xlsx","Нормы ПО"],
  ["Нормы конструкторских работ","Нормы КО 6.0 от 01.06.26.xlsx","База / IP55 / IP68"],
  ["Сменные задания","Сменное задание 07–10.08.2026.xlsx","Мастер №1–3"],
  ["КОМ и крепления","КОМ.png + комплект В./Г.","Таблица + сборочные чертежи"],
  ["Ухо PE","260.045.pdf","Лист АМг3 2,0 · переменная L по высоте шинопровода"],
  ["Стыковочные элементы G","G.001.000 + Excel-состав","IP55 · 4P · шина 6/7 мм · 400–6300 А"],
  ["Цены автоматических выключателей","Hyundai, CHINT, KEAZ, IEK, EKF, Systeme, DEKraft","7 прайсов · дата + цена с НДС + фактическая стоимость"],
];

const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => Number(value) || 0;
const currency = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function EnterpriseWorkspacePanel({ mode, orders, stock, onOpenComposition, onImportOrders, onDeleteOrder, onSelectOrder, onProjectDeleted }: Props) {
  const [records, setRecords] = useState<WorkspaceRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [projectName, setProjectName] = useState("");
  const [customer, setCustomer] = useState("");
  const [manager, setManager] = useState("");
  const [activeProject, setActiveProject] = useState("");
  const [docType, setDocType] = useState(documentTypes[0]);
  const [rates, setRates] = useState({ usd: "", eur: "", cny: "", copper: "", aluminium: "", lme: "" });
  const [yuanRate, setYuanRate] = useState({ rate: "", date: "", source: "", note: "" });
  const [commercial, setCommercial] = useState({ stage: "КП", date: "", cost: "", note: "" });
  const [payment, setPayment] = useState({ order: "", due: "", paid: "", amount: "", composition: "" });
  const [reserve, setReserve] = useState({ order: "", element: "", article: "", name: "", stock: "", requested: "" });
  const [rule, setRule] = useState({ scope: "Общие", type: "FE", field: "", value: "", source: "" });
  const [lengths, setLengths] = useState({ S1: 750, S2: 1500, S3: 2500 });
  const [compCurrent, setCompCurrent] = useState(2000);
  const [compUpdated, setCompUpdated] = useState("");
  const [kom, setKom] = useState({ current: 250, connection: "Plug-in" as KomConnection, maker: "", model: "", article: "", width: "", depth: "", height: "" });
  const [fastening, setFastening] = useState("В.1.1.1.1");
  const [shiftDraft, setShiftDraft] = useState({ date: "", shop: "1", master: "", post: "", worker: "", project: "", task: "", plan: "", planTime: "", fact: "", factTime: "", comment: "" });
  const [resource, setResource] = useState({ order: "", element: "", kind: "Состав элемента", name: "", article: "", quantity: "", unit: "шт", meters: "" });
  const [breakerDrafts, setBreakerDrafts] = useState<Record<string, BreakerPriceDraft>>({});
  const [breakerSearch, setBreakerSearch] = useState("");
  const [komSearch, setKomSearch] = useState("");
  const [breakerManufacturer, setBreakerManufacturer] = useState("");
  const [breakerCurrent, setBreakerCurrent] = useState(0);
  const [breakerPage, setBreakerPage] = useState(1);
  const [breakers, setBreakers] = useState<BreakerCatalogRow[]>([]);
  const [breakerCatalogError, setBreakerCatalogError] = useState("");
  const lastAuditSignature = useRef("");

  async function load() {
    try {
      const response = await fetch("/api/workspace");
      const data = await response.json() as { records?: WorkspaceRecord[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить данные");
      setRecords(data.records ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка загрузки"); }
  }
  useEffect(() => { queueMicrotask(() => void load()); }, []);
  useEffect(() => {
    if (mode !== "breakers" || breakers.length) return;
    fetch("/data/breakerCatalog.json")
      .then((response) => {
        if (!response.ok) throw new Error("Каталог автоматов недоступен");
        return response.json();
      })
      .then((data: BreakerCatalogRow[]) => setBreakers(data))
      .catch((error) => setBreakerCatalogError(error instanceof Error ? error.message : "Ошибка каталога автоматов"));
  }, [mode, breakers.length]);

  async function save(category: string, projectKey: string, entityKey: string, payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category, projectKey, entityKey, payload }) });
      const data = await response.json() as { record?: WorkspaceRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "Не удалось сохранить");
      setRecords((rows) => [data.record!, ...rows]);
      setMessage("Сохранено в истории.");
      return data.record;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка сохранения"); }
    finally { setBusy(false); }
  }

  const projects = useMemo(() => {
    const map = new Map<string, WorkspaceRecord>();
    records.filter((row) => row.category === "project").forEach((row) => { if (!map.has(row.entityKey)) map.set(row.entityKey, row); });
    return [...map.values()];
  }, [records]);
  useEffect(() => { if (!activeProject && projects[0]) queueMicrotask(() => setActiveProject(projects[0].entityKey)); }, [activeProject, projects]);
  const projectDocs = records.filter((row) => row.category === "document" && row.projectKey === activeProject);
  const projectCommercial = records.filter((row) => row.category === "commercial" && row.projectKey === activeProject).slice().reverse();
  const projectPayments = records.filter((row) => row.category === "payment" && row.projectKey === activeProject);
  const reservations = records.filter((row) => row.category === "reservation");
  const yuanRates = records.filter((row) => row.category === "exchange_rate" && row.entityKey === "CNY/RUB");
  const latestYuanRate = yuanRates[0];

  useEffect(() => {
    if (!latestYuanRate || yuanRate.rate || yuanRate.date || yuanRate.source || yuanRate.note) return;
    queueMicrotask(() => setYuanRate({
      rate: text(latestYuanRate.payload.rate),
      date: text(latestYuanRate.payload.rateDate),
      source: text(latestYuanRate.payload.source),
      note: text(latestYuanRate.payload.note),
    }));
  }, [latestYuanRate, yuanRate]);

  async function addProject() {
    if (!projectName.trim()) return setMessage("Укажите наименование проекта.");
    await save("project", projectName.trim(), projectName.trim(), { name: projectName.trim(), customer, manager, status: "Актуальный" });
    setActiveProject(projectName.trim()); setProjectName(""); setCustomer(""); setManager("");
  }

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>, category = "document") {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !activeProject) return setMessage("Сначала выберите проект.");
    if (category === "document") {
      const form = new FormData(); form.set("file", file); form.set("projectKey", activeProject); form.set("docType", docType);
      form.set("snapshot", JSON.stringify({ capturedAt: new Date().toISOString(), ...rates }));
      setBusy(true);
      try {
        const response = await fetch("/api/documents", { method: "POST", body: form });
        const data = await response.json() as { record?: WorkspaceRecord; error?: string };
        if (!response.ok || !data.record) throw new Error(data.error || "Ошибка загрузки");
        setRecords((rows) => [data.record!, ...rows]); setMessage("Документ загружен; курсы и цены зафиксированы в версии.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка загрузки"); }
      finally { setBusy(false); }
    } else {
      await save("base_document", "", category, { fileName: file.name, size: file.size, updatedAt: new Date().toISOString() });
    }
  }

  async function uploadBaseDocument(event: ChangeEvent<HTMLInputElement>, name: string) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const form = new FormData();
    form.set("file", file); form.set("projectKey", "__BASE__"); form.set("docType", name); form.set("category", "base_document");
    form.set("snapshot", JSON.stringify({ capturedAt: new Date().toISOString(), source: "Управление правилами" }));
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const data = await response.json() as { record?: WorkspaceRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "Ошибка загрузки");
      setRecords((rows) => [data.record!, ...rows]);
      setMessage(`Базовый документ «${name}» загружен новой версией.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка загрузки"); }
    finally { setBusy(false); }
  }

  async function uploadProjectOrders(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || !activeProject || !onImportOrders) return setMessage("Сначала выберите проект.");
    setBusy(true); setMessage("");
    try {
      const imported = await onImportOrders(files, activeProject);
      setMessage(`В проект «${activeProject}» загружено заказов: ${imported.length}. Они доступны во всех рабочих вкладках.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось загрузить заказ"); }
    finally { setBusy(false); }
  }

  async function deleteDocument(row: WorkspaceRecord) {
    if (!window.confirm(`Удалить документ «${text(row.payload.fileName) || row.entityKey}»?`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/documents?id=${row.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось удалить документ");
      setRecords((current) => current.filter((item) => item.id !== row.id));
      setMessage("Документ и его сохранённый файл удалены.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка удаления документа"); }
    finally { setBusy(false); }
  }

  async function deleteProject(projectKey: string) {
    if (!window.confirm(`Удалить проект «${projectKey}» со всеми загруженными документами и связанными заказами?`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/projects?project=${encodeURIComponent(projectKey)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось удалить проект");
      setRecords((current) => current.filter((row) => row.projectKey !== projectKey && !(row.category === "project" && row.entityKey === projectKey)));
      setActiveProject("");
      onProjectDeleted?.(projectKey);
      setMessage(`Проект «${projectKey}» удалён.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка удаления проекта"); }
    finally { setBusy(false); }
  }

  const commercialDeltas = useMemo(() => projectCommercial.map((row, index) => {
    const cost = number(row.payload.cost); const previous = index ? number(projectCommercial[index - 1].payload.cost) : cost;
    return { row, cost, delta: cost - previous, percent: previous ? ((cost - previous) / previous) * 100 : 0 };
  }), [projectCommercial]);

  const priority = useMemo(() => {
    const types = new Map<string, { key: string; type: string; article: string; quantity: number; examples: string[] }>();
    const catalogTypes = [...new Set((elementCatalogSource as { code?: string }[]).map((row) => text(row.code)).filter(Boolean))];
    const modelTypes = [...new Set((parametricSource as (string | number)[][]).map((row) => text(row[0])).filter(Boolean))];
    const knownTypes = [...new Set([...catalogTypes, ...modelTypes])];
    for (const order of orders) for (const row of order.rows) {
      const haystack = `${row.article} ${row.item} ${row.marking} ${row.drawingNumber}`;
      const type = normalizeElementFamily(haystack, knownTypes);
      const key = `${type}|${row.article || row.item}`; const current = types.get(key) ?? { key, type, article: row.article || row.item, quantity: 0, examples: [] };
      current.quantity += row.quantity || 1; if (current.examples.length < 2) current.examples.push(`№ ${order.number}`);
      types.set(key, current);
    }
    return [...types.values()].map((row) => {
      const models = [...new Set((parametricSource as (string | number)[][]).filter((source) => text(source[0]).toUpperCase() === row.type.toUpperCase()).map((source) => text(source[5])))];
      return { ...row, models, coverage: getCalculationCoverage(row.type) };
    }).sort((a, b) => b.quantity - a.quantity);
  }, [orders]);

  const calculationGaps = useMemo(() => priority.filter((row) => row.coverage.status !== "calculated"), [priority]);
  useEffect(() => {
    if (mode !== "models" || !calculationGaps.length) return;
    const payload = calculationGaps.map((row) => ({ family: row.type, article: row.article, quantity: row.quantity, status: row.coverage.status, required: row.coverage.required }));
    const signature = JSON.stringify(payload);
    if (lastAuditSignature.current === signature) return;
    lastAuditSignature.current = signature;
    void save("calculation_gap_snapshot", "__KLM__", `audit|${Date.now()}`, { capturedAt: new Date().toISOString(), mode: "read-only", items: payload });
  }, [mode, calculationGaps]);

  const comp = productionCompensators.find((row) => row[0] === compCurrent) ?? productionCompensators.reduce((best, row) => Math.abs(row[0] - compCurrent) < Math.abs(best[0] - compCurrent) ? row : best);
  const komDims = findKomEnvelope(kom.current, kom.connection);
  const breakerDimensions = number(kom.width) && number(kom.depth) && number(kom.height) ? [number(kom.width), number(kom.depth), number(kom.height)] as [number, number, number] : null;
  const exactKOM = Boolean(komDims && breakerDimensions && breakerDimensions.every((value, index) => value <= komDims[index]));
  const komMaterials = calculateKomMaterials(kom.current, kom.connection, komDims);

  async function addReservation() {
    const stock = number(reserve.stock), requested = number(reserve.requested);
    if (!reserve.article || requested <= 0) return setMessage("Укажите артикул и требуемое количество.");
    const already = reservations.filter((row) => text(row.payload.article) === reserve.article).reduce((sum, row) => sum + number(row.payload.reserved), 0);
    const available = Math.max(0, stock - already); const reserved = Math.min(available, requested); const demand = Math.max(0, requested - reserved);
    await save("reservation", activeProject, `${reserve.order}|${reserve.element}|${reserve.article}`, { ...reserve, stock, requested, reserved, demand, action: "Резервирование" });
  }

  async function importShift(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      let count = 0;
      for (const sheetName of workbook.SheetNames.filter((name) => /^Мастер/i.test(name))) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
        let master = "", post = "", worker = "";
        for (const row of rows.slice(5)) {
          master = text(row[1]) || master; post = text(row[2]) || post; worker = text(row[3]) || worker;
          const project = text(row[4]), task = text(row[5]);
          if (!project && !task) continue;
          await save("shift", project, `${file.name}|${sheetName}|${count}`, { source: file.name, sheet: sheetName, master, post, worker, project, task, plan: text(row[6]), fact: text(row[7]), planTime: text(row[8]), factTime: text(row[9]), comment: text(row[10]) });
          count++;
        }
      }
      setMessage(`Импортировано заданий: ${count}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось прочитать сменное задание"); }
  }

  const breakerPrices = records.filter((row) => row.category === "breaker_price");
  const breakerImports = records.filter((row) => row.category === "breaker_price_import");
  const importedPriceMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const record of breakerImports) {
      const items = Array.isArray(record.payload.items) ? record.payload.items as Record<string, unknown>[] : [];
      for (const item of items) {
        const key = text(item.key);
        if (key && !map.has(key)) map.set(key, { ...item, source: record.payload.fileName });
      }
    }
    return map;
  }, [breakerImports]);
  const breakerIndexes = useMemo(() => buildBreakerIndexes(breakers), [breakers]);
  const manufacturers = useMemo(() => [...new Set(breakers.map((row) => row.manufacturer))].sort((a, b) => a.localeCompare(b, "ru")), [breakers]);
  const filteredBreakers = breakers.filter((row) => {
    const query = breakerSearch.trim().toLowerCase();
    const matchesQuery = !query || `${row.article} ${row.model ?? ""} ${row.manufacturer} ${row.name} ${row.currentA}`.toLowerCase().includes(query);
    return matchesQuery && (!breakerManufacturer || row.manufacturer === breakerManufacturer) && (!breakerCurrent || row.currentA === breakerCurrent);
  });
  const breakerPageSize = 100;
  const breakerPageCount = Math.max(1, Math.ceil(filteredBreakers.length / breakerPageSize));
  const visibleBreakers = filteredBreakers.slice((breakerPage - 1) * breakerPageSize, breakerPage * breakerPageSize);
  const komCandidates = useMemo(() => {
    const query = komSearch.trim().toLowerCase().replace(/ё/g, "е");
    if (query.length < 2) return [];
    return breakers
      .filter((row) =>
        `${row.article} ${row.model ?? ""} ${row.manufacturer} ${row.name} ${row.currentA}`
          .toLowerCase()
          .replace(/ё/g, "е")
          .includes(query),
      )
      .slice(0, 20);
  }, [breakers, komSearch]);
  const orderBreakers = useMemo(() => orders.flatMap((order) => order.rows.flatMap((row) => {
    const catalog = matchBreaker(row, breakerIndexes);
    if (!catalog.item && !isBreakerText(`${row.item} ${row.marking}`)) return [];
    const stockMatch = matchBreakerStock(row, catalog.item, stock);
    return [{ order, row, catalog, stockMatch }];
  })), [orders, breakerIndexes, stock]);

  async function deleteProjectOrder(order: ProjectOrder) {
    if (!window.confirm(`Удалить заказ № ${order.number} из проекта «${order.projectName || "Без проекта"}»?`)) return;
    setBusy(true); setMessage("");
    try {
      await onDeleteOrder?.(order);
      setMessage(`Заказ № ${order.number} удалён.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить заказ");
    } finally {
      setBusy(false);
    }
  }

  function selectKomBreaker(item: BreakerCatalogRow) {
    setKom({
      ...kom,
      current: item.currentA || kom.current,
      maker: item.manufacturer,
      model: item.name,
      article: item.article,
    });
    setKomSearch(item.article || item.name);
  }

  function updateBreakerDraft(key: string, patch: Partial<BreakerPriceDraft>) {
    setBreakerDrafts((drafts) => {
      const previous = drafts[key];
      return { ...drafts, [key]: { date: previous?.date ?? "", price: previous?.price ?? "", actual: previous?.actual ?? "", ...patch } };
    });
  }

  async function saveBreakerPrice(item: BreakerCatalogRow) {
    const draft = breakerDrafts[item.key] ?? { date: "", price: "", actual: "" };
    const latest = breakerPrices.find((row) => row.entityKey === item.key || row.entityKey === item.article);
    const imported = importedPriceMap.get(item.key);
    const usesSourcePrice = !latest && !draft.date && !draft.price.trim() && Boolean(item.sourcePrice && item.sourceDate && item.sourceFile);
    const priceDate = draft.date || text(latest?.payload.priceDate) || text(imported?.priceDate) || item.sourceDate || "";
    const listPrice = draft.price.trim() ? number(draft.price) : number(latest?.payload.listPrice) || number(imported?.listPrice) || item.sourcePrice || 0;
    if (!priceDate || listPrice <= 0) return setMessage("Для сохранения укажите дату и цену по прайсу.");
    const discounts = calculateBreakerDiscountPrices(listPrice);
    await save("breaker_price", "__BREAKERS__", item.key, {
      ...item,
      priceDate,
      listPrice,
      ...discounts,
      actualCost: draft.actual.trim() ? number(draft.actual) : null,
      source: usesSourcePrice ? item.sourceFile : "Ручной ввод",
      sourceSheet: usesSourcePrice ? "Price" : "",
      dateBasis: usesSourcePrice ? "Дата из строки прайса" : "Дата указана пользователем",
    });
    setBreakerDrafts((drafts) => ({ ...drafts, [item.key]: { date: "", price: "", actual: "" } }));
  }

  function excelDateToIso(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === "number") {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
    const raw = text(value);
    const match = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
    if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  }

  function findPriceDate(rows: unknown[][], headerIndex: number) {
    for (let rowIndex = 0; rowIndex < headerIndex; rowIndex++) {
      const row = rows[rowIndex];
      for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
        if (!/дата.*(?:актуаль|прайс)/i.test(text(row[columnIndex]))) continue;
        for (const candidate of [row[columnIndex + 1], rows[rowIndex + 1]?.[columnIndex], rows[rowIndex + 1]?.[columnIndex + 1]]) {
          const parsed = excelDateToIso(candidate);
          if (parsed) return parsed;
        }
      }
    }
    return "";
  }

  async function importBreakerPrices(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    setBusy(true); setMessage("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const imported = new Map<string, Record<string, unknown>>();
      const byArticle = buildBreakerIndexes(breakers).byArticle;
      const byName = buildBreakerIndexes(breakers).byName;
      const parsePrice = (value: unknown) => {
        const raw = text(value).replace(/\u00a0/g, "").replace(/\s/g, "");
        const normalized = raw.includes(".") ? raw.replace(/,/g, "") : raw.replace(",", ".");
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true });
        const headerIndex = rows.slice(0, 30).findIndex((row) => row.some((cell) => /артикул|модель/i.test(text(cell))) && row.some((cell) => /цена/i.test(text(cell))));
        if (headerIndex < 0) continue;
        const headers = rows[headerIndex].map((cell) => text(cell).toLowerCase());
        const articleIndex = headers.findIndex((cell) => /артикул/.test(cell));
        const modelIndex = headers.findIndex((cell) => /модель|наименование|номенклатура|название товара/.test(cell));
        const dateIndex = headers.findIndex((cell) => /дата|актуальност/.test(cell));
        const preferredPriceIndex = headers.findIndex((cell) => /цена/.test(cell) && /с ндс/.test(cell) && !/скид|факт/.test(cell));
        const priceIndex = preferredPriceIndex >= 0 ? preferredPriceIndex : headers.findIndex((cell) => /цена/.test(cell) && !/скид|факт|без ндс/.test(cell));
        if (priceIndex < 0 || (articleIndex < 0 && modelIndex < 0)) continue;
        const workbookPriceDate = findPriceDate(rows, headerIndex);
        for (const row of rows.slice(headerIndex + 1)) {
          const article = articleIndex >= 0 ? text(row[articleIndex]) : "";
          const model = modelIndex >= 0 ? text(row[modelIndex]) : "";
          const item = (article ? byArticle.get(normalizeBreakerArticle(article)) : undefined) ?? (model ? (byName.get(normalizeBreakerName(model)) ?? [])[0] : undefined);
          const listPrice = parsePrice(row[priceIndex]);
          if (!item || listPrice <= 0) continue;
          const explicitDate = dateIndex >= 0 ? excelDateToIso(row[dateIndex]) : "";
          const priceDate = explicitDate || workbookPriceDate || new Date(file.lastModified).toISOString().slice(0, 10);
          const discounts = calculateBreakerDiscountPrices(listPrice);
          const dateBasis = explicitDate ? "Дата из строки прайса" : workbookPriceDate ? "Дата актуальности прайса" : "Дата изменения файла";
          imported.set(item.key, { key: item.key, article: item.article, name: item.name, priceDate, listPrice, ...discounts, sourceSheet: sheetName, dateBasis });
        }
      }
      if (!imported.size) return setMessage("В файле не найдено цен, сопоставимых с точными артикулами или наименованиями каталога.");
      const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "breaker_price_import", projectKey: "__BREAKERS__", entityKey: `${file.name}|${new Date().toISOString()}`, payload: { fileName: file.name, items: [...imported.values()] } }) });
      const data = await response.json() as { record?: WorkspaceRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "Ошибка сохранения импортированных цен");
      setRecords((current) => [data.record!, ...current]);
      setMessage(`Импортировано цен автоматов: ${imported.size}. Сохранена одна версия прайса.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось прочитать прайс автоматов"); }
    finally { setBusy(false); }
  }

  const status = message && <div className="notice enterprise-status"><b>{message}</b></div>;

  if (mode === "projects") return <div className="enterprise-workspace">
    {status}<div className="enterprise-grid">
      <section className="panel"><div className="panel-title"><div><span>01</span><h2>Реестр проектов</h2></div><small>договорной отдел</small></div>
        <div className="form-grid"><label>Наименование проекта<input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Например, ЦОД СТИ" /></label><label>Заказчик<input value={customer} onChange={(e) => setCustomer(e.target.value)} /></label><label>Менеджер<input value={manager} onChange={(e) => setManager(e.target.value)} /></label></div>
        <button className="primary" onClick={addProject} disabled={busy}>＋ Завести проект</button>
        <div className="project-tree">{projects.map((row) => <div className={`project-tree-row ${activeProject === row.entityKey ? "active" : ""}`} key={row.id}><button onClick={() => setActiveProject(row.entityKey)}><b>▾ {text(row.payload.name) || row.entityKey}</b><span>{text(row.payload.customer) || "Заказчик не указан"} · {text(row.payload.manager) || "Менеджер не назначен"}</span><small>{orders.filter((order) => order.projectName === row.entityKey).length} заказов на производство</small></button><button className="danger-button" disabled={busy} onClick={() => void deleteProject(row.entityKey)}>Удалить</button></div>)}</div>
      </section>
      <section className="panel"><div className="panel-title"><div><span>02</span><h2>Документы проекта</h2></div><small>{activeProject || "выберите проект"}</small></div>
        <label>Тип документа<select value={docType} onChange={(e) => setDocType(e.target.value)}>{documentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="form-grid compact"><label>USD<input value={rates.usd} onChange={(e) => setRates({ ...rates, usd: e.target.value })} /></label><label>EUR<input value={rates.eur} onChange={(e) => setRates({ ...rates, eur: e.target.value })} /></label><label>CNY<input value={rates.cny} onChange={(e) => setRates({ ...rates, cny: e.target.value })} /></label><label>Медь<input value={rates.copper} onChange={(e) => setRates({ ...rates, copper: e.target.value })} /></label><label>Алюминий<input value={rates.aluminium} onChange={(e) => setRates({ ...rates, aluminium: e.target.value })} /></label><label>LME Al<input value={rates.lme} onChange={(e) => setRates({ ...rates, lme: e.target.value })} /></label></div>
        <label className="file-button">⇧ Загрузить новую версию<input type="file" hidden onChange={uploadDocument} /></label>
        <div className="record-list">{projectDocs.map((row) => { const snap = row.payload.snapshot as Record<string, unknown> | undefined; return <div key={row.id}><b>{row.entityKey}</b><span>{text(row.payload.fileName)}</span><small>{new Date(row.createdAt).toLocaleString("ru-RU")} · USD {text(snap?.usd) || "—"} · CNY {text(snap?.cny) || "—"} · Cu {text(snap?.copper) || "—"} · Al/LME {text(snap?.aluminium) || "—"} / {text(snap?.lme) || "—"}</small>{Boolean(row.payload.storageKey) && <a href={`/api/documents?key=${encodeURIComponent(text(row.payload.storageKey))}`}>Скачать версию</a>}<button className="danger-link" onClick={() => void deleteDocument(row)} disabled={busy}>Удалить документ</button></div>; })}</div>
      </section>
    </div>
    <section className="panel project-orders-panel"><div className="panel-title"><div><span>03</span><h2>Заказы на производство внутри проекта</h2></div><small>{activeProject ? `${orders.filter((order) => order.projectName === activeProject).length} заказов` : "выберите проект"}</small></div>
      <div className="project-order-actions"><label className={`file-button ${!activeProject ? "disabled" : ""}`}>⇧ Загрузить заказ на производство<input type="file" accept=".xlsx,.xls" multiple hidden disabled={!activeProject || busy} onChange={(event) => void uploadProjectOrders(event)} /></label><button onClick={onOpenComposition}>Открыть полный состав заказов</button></div>
      <p>Заказ принудительно связывается с выбранным проектом, сохраняется и сразу становится доступен в составе, текущих заказах, параметризации, расчёте и подборе КОМ.</p>
      <div className="project-order-grid">{orders.filter((order) => order.projectName === activeProject).map((order) => <article key={order.id}><small>Заказ на производство</small><b>№ {order.number} от {order.date}</b><span>{order.rows.length} строк · {order.filename}</span><div><button onClick={() => onSelectOrder?.(order)}>Передать в расчёт</button><button className="danger-link" disabled={busy} onClick={() => void deleteProjectOrder(order)}>Удалить</button></div></article>)}</div>
      {activeProject && !orders.some((order) => order.projectName === activeProject) && <div className="empty">В выбранном проекте пока нет заказов на производство.</div>}
    </section>
  </div>;

  if (mode === "commercial") return <div className="enterprise-workspace">{status}
    <div className="panel project-selector"><label>Проект<select value={activeProject} onChange={(e) => setActiveProject(e.target.value)}><option value="">Выберите проект</option>{projects.map((row) => <option key={row.id}>{row.entityKey}</option>)}</select></label></div>
    <div className="enterprise-grid">
      <section className="panel"><div className="panel-title"><div><span>01</span><h2>Коммерческая шкала</h2></div><small>КП → договор → оплата</small></div>
        <div className="form-grid"><label>Этап<select value={commercial.stage} onChange={(e) => setCommercial({ ...commercial, stage: e.target.value })}><option>КП</option><option>Договор</option><option>Оплата</option></select></label><label>Дата<input type="date" value={commercial.date} onChange={(e) => setCommercial({ ...commercial, date: e.target.value })} /></label><label>Стоимость, ₽<input type="number" value={commercial.cost} onChange={(e) => setCommercial({ ...commercial, cost: e.target.value })} /></label><label>Комментарий<input value={commercial.note} onChange={(e) => setCommercial({ ...commercial, note: e.target.value })} /></label></div>
        <button className="primary" disabled={!activeProject || busy} onClick={() => save("commercial", activeProject, `${commercial.stage}|${commercial.date}`, { ...commercial, ...rates })}>Добавить контрольную точку</button>
        <div className="timeline">{commercialDeltas.map(({ row, cost, delta, percent }) => <div key={row.id}><i /><b>{text(row.payload.stage)} · {text(row.payload.date)}</b><strong>{cost.toLocaleString("ru-RU")} ₽</strong><span className={delta > 0 ? "risk-text" : "ok-text"}>{delta >= 0 ? "+" : ""}{delta.toLocaleString("ru-RU")} ₽ · {percent.toFixed(1)}%</span><small>Источники: курс/медь/алюминий/LME фиксируются в точке. Решение не меняет договор автоматически.</small></div>)}</div>
      </section>
      <section className="panel"><div className="panel-title"><div><span>02</span><h2>Оплаты и решение по росту</h2></div><small>доступ — отдельная роль</small></div>
        <div className="form-grid"><label>Заказ<input value={payment.order} onChange={(e) => setPayment({ ...payment, order: e.target.value })} /></label><label>Оплатить до<input type="date" value={payment.due} onChange={(e) => setPayment({ ...payment, due: e.target.value })} /></label><label>Оплачено<input type="date" value={payment.paid} onChange={(e) => setPayment({ ...payment, paid: e.target.value })} /></label><label>Сумма<input type="number" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></label><label>Состав<input value={payment.composition} onChange={(e) => setPayment({ ...payment, composition: e.target.value })} /></label></div>
        <button className="primary" disabled={!activeProject || busy} onClick={() => save("payment", activeProject, payment.order, payment)}>Сохранить оплату</button>
        <div className="decision-grid">{["Переложить на заказчика · доп. соглашение","Принять на компанию · стоимость проекта","Рентабельность и бонус менеджера · стоимость проекта"].map((item) => <button key={item} onClick={() => save("cost_decision", activeProject, new Date().toISOString(), { decision: item, approved: false })}>{item}<small>Требует подтверждения уполномоченного сотрудника</small></button>)}</div>
        <div className="record-list">{projectPayments.map((row) => <div key={row.id}><b>Заказ {text(row.payload.order)}</b><span>{number(row.payload.amount).toLocaleString("ru-RU")} ₽</span><small>срок {text(row.payload.due) || "—"} · оплачено {text(row.payload.paid) || "нет"}</small></div>)}</div>
      </section>
    </div>
    <section className="panel separated-costs"><h3>Отдельные статьи себестоимости</h3><div className="form-grid"><label>Местоположение объекта<input placeholder="город / адрес" /></label><label>Доставка, ₽<input type="number" /></label><label>Шеф-монтаж, ₽<input type="number" /></label><label>Финансирование, ₽<input type="number" /></label></div><p>Статьи сохраняются раздельно и связываются с проектом, заказчиком, менеджером и версией входных данных.</p></section>
  </div>;

  if (mode === "reservations") return <div className="enterprise-workspace">{status}<div className="enterprise-grid">
    <section className="panel"><div className="panel-title"><div><span>01</span><h2>Резервирование</h2></div><small>заказ + элемент</small></div>
      <div className="form-grid"><label>Проект<select value={activeProject} onChange={(e) => setActiveProject(e.target.value)}><option value="">Выберите</option>{projects.map((row) => <option key={row.id}>{row.entityKey}</option>)}</select></label><label>Заказ<input value={reserve.order} onChange={(e) => setReserve({ ...reserve, order: e.target.value })} /></label><label>Элемент<input value={reserve.element} onChange={(e) => setReserve({ ...reserve, element: e.target.value })} /></label><label>Артикул 1С<input value={reserve.article} onChange={(e) => setReserve({ ...reserve, article: e.target.value })} /></label><label>Материал<input value={reserve.name} onChange={(e) => setReserve({ ...reserve, name: e.target.value })} /></label><label>Остаток<input type="number" value={reserve.stock} onChange={(e) => setReserve({ ...reserve, stock: e.target.value })} /></label><label>Потребность<input type="number" value={reserve.requested} onChange={(e) => setReserve({ ...reserve, requested: e.target.value })} /></label></div>
      <button className="primary" onClick={addReservation} disabled={!activeProject || busy}>Зарезервировать доступное</button><p>Сверх доступного остатка резерв не создаётся: разница автоматически переходит в потребность.</p>
    </section>
    <section className="panel"><div className="panel-title"><div><span>02</span><h2>История резервов</h2></div><small>{reservations.length} операций</small></div><div className="table-wrap"><table><thead><tr><th>Проект / заказ / элемент</th><th>Артикул</th><th>Остаток</th><th>Резерв</th><th>Потребность</th><th>Действие</th></tr></thead><tbody>{reservations.map((row) => <tr key={row.id}><td><b>{row.projectKey}</b><small>{text(row.payload.order)} · {text(row.payload.element)}</small></td><td>{text(row.payload.article)}</td><td>{number(row.payload.stock)}</td><td>{number(row.payload.reserved)}</td><td><strong>{number(row.payload.demand)}</strong></td><td><button onClick={() => save("reservation", row.projectKey, row.entityKey, { ...row.payload, reserved: 0, demand: number(row.payload.requested), action: "Снятие резерва", sourceRecord: row.id })}>Снять</button></td></tr>)}</tbody></table></div></section>
    </div>
    <section className="panel"><div className="panel-title"><div><span>03</span><h2>Заказ материалов по секциям</h2></div><small>потребность / наличие / резерв / дефицит</small></div><div className="table-wrap"><table><thead><tr><th>Секция</th><th>Что требуется</th><th>Есть</th><th>Резерв</th><th>Не хватает на складе</th><th>Не хватает в документации</th><th>Покрыто</th></tr></thead><tbody>{reservations.map((row) => { const requested=number(row.payload.requested), reserved=number(row.payload.reserved); return <tr key={`s-${row.id}`}><td>{text(row.payload.element) || "Весь заказ"}</td><td>{text(row.payload.name) || text(row.payload.article)} · {requested}</td><td>{number(row.payload.stock)}</td><td>{reserved}</td><td>{number(row.payload.demand)}</td><td>{row.payload.article ? 0 : requested}</td><td>{requested ? ((reserved/requested)*100).toFixed(0) : 0}%</td></tr>; })}</tbody></table></div></section>
    <section className="panel readiness-panel"><div className="panel-title"><div><span>04</span><h2>Предварительная проверка заказа</h2></div><small>до фактического размещения</small></div>{(() => { const rows=reservations.filter((row)=>!activeProject||row.projectKey===activeProject); const demand=rows.reduce((sum,row)=>sum+number(row.payload.demand),0); const requested=rows.reduce((sum,row)=>sum+number(row.payload.requested),0); const covered=rows.reduce((sum,row)=>sum+number(row.payload.reserved),0); return <div className="resource-grid"><div><b>Потребность</b><strong>{requested}</strong><span>по введённым материалам</span></div><div><b>Покрыто</b><strong>{covered}</strong><span>{requested ? ((covered/requested)*100).toFixed(0) : 0}%</span></div><div><b>Дефицит</b><strong>{demand}</strong><span>к заказу</span></div><div><b>Возможность начать</b><strong>{demand===0&&requested>0?"Да":"Нет"}</strong><span>{demand===0&&requested>0?"материалы закрыты остатками":"после закрытия дефицита"}</span></div><div><b>Ориентир старта</b><strong>{demand===0&&requested>0?"Сейчас":"Не определён"}</strong><span>{demand?"нужен срок поставки дефицита":"по производственному плану"}</span></div></div>; })()}</section>
    <section className="panel"><div className="panel-title"><div><span>05</span><h2>Ресурсная спецификация элемента</h2></div><small>состав / стыки / метры / артикулы</small></div><div className="form-grid"><label>Проект<select value={activeProject} onChange={(e)=>setActiveProject(e.target.value)}><option value="">Выберите</option>{projects.map((row)=><option key={row.id}>{row.entityKey}</option>)}</select></label><label>Заказ<input value={resource.order} onChange={(e)=>setResource({...resource,order:e.target.value})}/></label><label>Элемент<input value={resource.element} onChange={(e)=>setResource({...resource,element:e.target.value})}/></label><label>Тип позиции<select value={resource.kind} onChange={(e)=>setResource({...resource,kind:e.target.value})}><option>Состав элемента</option><option>Комплект стыка</option></select></label><label>Номенклатура<input value={resource.name} onChange={(e)=>setResource({...resource,name:e.target.value})}/></label><label>Артикул 1С<input value={resource.article} onChange={(e)=>setResource({...resource,article:e.target.value})}/></label><label>Количество<input type="number" value={resource.quantity} onChange={(e)=>setResource({...resource,quantity:e.target.value})}/></label><label>Единица<select value={resource.unit} onChange={(e)=>setResource({...resource,unit:e.target.value})}><option>шт</option><option>кг</option><option>м</option><option>компл.</option></select></label><label>Метры<input type="number" value={resource.meters} onChange={(e)=>setResource({...resource,meters:e.target.value})}/></label></div><button className="primary" onClick={()=>save("resource_spec",activeProject,`${resource.order}|${resource.element}|${resource.kind}|${resource.article}`,resource)} disabled={!activeProject||!resource.element}>Добавить позицию</button><div className="record-list">{records.filter((row)=>row.category==="resource_spec"&&(!activeProject||row.projectKey===activeProject)).map((row)=><div key={row.id}><b>{text(row.payload.element)} · {text(row.payload.kind)}</b><span>{text(row.payload.article)||"артикул не задан"} · {text(row.payload.name)}</span><small>{text(row.payload.quantity)} {text(row.payload.unit)}{row.payload.meters?` · ${text(row.payload.meters)} м`:""} · заказ {text(row.payload.order)}</small></div>)}</div></section>
  </div>;

  if (mode === "models") return <div className="enterprise-workspace">{status}<div className="object-kpis"><div><span>Строк моделей</span><strong>718</strong><small>{(parametricSource as unknown[]).length} уникальных сочетаний · .001–.010</small></div><div><span>Позиций заказов</span><strong>{priority.length}</strong><small>группы артикулов/типов</small></div><div><span>Расчёт закрыт</span><strong>{priority.filter((row) => row.coverage.status === "calculated").length}</strong><small>по действующим утверждённым правилам</small></div><div><span>Требуют данных</span><strong>{calculationGaps.length}</strong><small>агент только сверяет и анализирует</small></div></div>
    <section className="panel calculation-audit-panel"><div className="panel-title"><div><span>01</span><h2>Агент сверки расчёта</h2></div><small>только анализ · правила задаёт владелец</small></div><p>Панель автоматически сверяет актуальные заказы с действующими расчётными правилами. Она не создаёт формулы и не подменяет отсутствующие данные предположениями. Изменения очереди сохраняются в истории проекта как снимки аудита.</p><div className="table-wrap"><table><thead><tr><th>Элемент</th><th>Количество</th><th>Статус расчёта</th><th>Почему</th><th>Что необходимо предоставить</th></tr></thead><tbody>{calculationGaps.map((row) => <tr key={`gap-${row.key}`}><td><b>{row.type}</b><small>{row.article}</small><small>{row.examples.join(", ")}</small></td><td><strong>{row.quantity}</strong></td><td><span className={`planning-status ${row.coverage.status === "partial" ? "mapping" : "no-stock"}`}>{row.coverage.status === "partial" ? "Частично" : "Не рассчитан"}</span></td><td>{row.coverage.reason}</td><td><ol className="audit-requirements">{row.coverage.required.map((item) => <li key={item}>{item}</li>)}</ol></td></tr>)}</tbody></table></div>{!calculationGaps.length && <div className="empty">По актуальным заказам нет элементов без утверждённого расчётного правила.</div>}</section>
    <section className="panel"><div className="panel-title"><div><span>02</span><h2>Очередь параметрических моделей</h2></div><small>наличие модели не означает автоматически готовый расчёт себестоимости</small></div><div className="table-wrap"><table><thead><tr><th>Приоритет</th><th>Тип / артикул</th><th>Количество</th><th>Заказы</th><th>Параметрическая модель</th><th>Расчёт</th></tr></thead><tbody>{priority.map((row, index) => <tr key={row.key}><td><strong>#{index+1}</strong></td><td><b>{row.type}</b><small>{row.article}</small></td><td><strong>{row.quantity}</strong></td><td>{row.examples.join(", ")}</td><td>{row.models.length ? `есть: ${row.models.join(", ")}` : "нет отметки"}</td><td><span className={`planning-status ${row.coverage.status === "calculated" ? "available" : row.coverage.status === "partial" ? "mapping" : "no-stock"}`}>{row.coverage.status === "calculated" ? "Рассчитывается" : row.coverage.status === "partial" ? "Частично" : "Нужны данные"}</span></td></tr>)}</tbody></table></div>{!priority.length && <div className="empty">Загрузите актуальные заказы — очередь сформируется автоматически.</div>}</section>
    <section className="notice"><b>Критерий готовности модели</b><span>«Проверочный пример» — это реальная секция, для которой результат модели сравнен с выпущенным чертежом/спецификацией. «Диапазоны параметров» — подтверждённые минимальные и максимальные значения длины, тока, количества проводников, IP и других изменяемых полей. Пока оба пункта не подтверждены, модель отмечается как «есть в базе», но не как готовая к автоматическому выпуску.</span></section>
  </div>;

  if (mode === "breakers") return <div className="enterprise-workspace">{status}
    {breakerCatalogError && <section className="notice warn-notice"><b>Каталог не загружен</b><span>{breakerCatalogError}</span></section>}
    <section className="notice ok-notice"><b>Единый каталог семи прайсов</b><span>{breakers.length ? `${breakers.length.toLocaleString("ru-RU")} автоматических выключателей: CHINT, DEKraft, EKF, Hyundai, IEK, KEAZ и Systeme Electric.` : "Каталог загружается…"} Цена берётся из колонки с НДС. Скидки 50% и 70% рассчитываются как цена × 0,50 и цена × 0,30.</span></section>

    <section className="panel"><div className="panel-title"><div><span>01</span><h2>Автоматы в заказах на производство</h2></div><small>{orderBreakers.length} строк</small></div>
      <div className="table-wrap"><table className="breaker-order-table"><thead><tr><th>Проект / заказ</th><th>Строка заказа</th><th>Сопоставление прайса</th><th>Цена с НДС</th><th>Остаток</th><th>Подбор</th></tr></thead><tbody>{orderBreakers.map(({ order, row, catalog, stockMatch }) => <tr key={`${order.id}-${row.id}`}><td><b>{order.projectName || "Без проекта"}</b><small>№ {order.number}</small></td><td><b>{row.article || "без артикула"}</b><span>{row.item}</span><small>{row.quantity} {row.unit}</small></td><td>{catalog.item ? <><b>{catalog.item.manufacturer} · {catalog.item.article}</b><span>{catalog.item.name}</span><small>{catalog.basis} · уверенность {catalog.confidence.toLowerCase()}</small></> : <span className="planning-status mapping">Не сопоставлено</span>}</td><td>{catalog.item ? currency.format(number(importedPriceMap.get(catalog.item.key)?.listPrice) || catalog.item.sourcePrice) : "—"}</td><td>{stockMatch.item ? <><b>{stockMatch.item.balance.toLocaleString("ru-RU")} {stockMatch.item.unit}</b><small>{stockMatch.item.code} · {stockMatch.basis}</small></> : <span className="planning-status no-stock">{stockMatch.basis}</span>}</td><td>{catalog.item ? <button onClick={() => selectKomBreaker(catalog.item!)}>Выбрать КОМ</button> : "—"}</td></tr>)}</tbody></table></div>
      {!orderBreakers.length && <div className="empty">В актуальных заказах не найдено строк с автоматическими выключателями.</div>}
    </section>

    <section className="panel breaker-toolbar"><div className="panel-title"><div><span>02</span><h2>База автоматических выключателей</h2></div><small>{filteredBreakers.length.toLocaleString("ru-RU")} найдено</small></div><div className="form-grid breaker-filters"><label>Поиск<input value={breakerSearch} onChange={(e) => { setBreakerSearch(e.target.value); setBreakerPage(1); }} placeholder="Артикул или полное наименование" /></label><label>Производитель<select value={breakerManufacturer} onChange={(e) => { setBreakerManufacturer(e.target.value); setBreakerPage(1); }}><option value="">Все производители</option>{manufacturers.map((item) => <option key={item}>{item}</option>)}</select></label><label>Номинальный ток, А<input type="number" min="0" value={breakerCurrent || ""} onChange={(e) => { setBreakerCurrent(number(e.target.value)); setBreakerPage(1); }} placeholder="Все токи" /></label><label className="file-button">⇧ Актуализировать прайс<input type="file" accept=".xlsx,.xls,.xlsm" hidden onChange={importBreakerPrices} /></label></div><p>Сопоставление выполняется по точному артикулу, затем по точному нормализованному наименованию. Приблизительное совпадение не назначается.</p></section>
    <section className="panel"><div className="table-wrap breaker-price-table"><table><thead><tr><th>Автомат</th><th>Дата / цена</th><th>−50%</th><th>−70%</th><th>Фактическая стоимость</th><th>КОМ</th></tr></thead><tbody>{visibleBreakers.map((item) => {
      const latest = breakerPrices.find((row) => row.entityKey === item.key || row.entityKey === item.article);
      const imported = importedPriceMap.get(item.key);
      const draft = breakerDrafts[item.key] ?? { date: "", price: "", actual: "" };
      const listPrice = draft.price !== "" ? number(draft.price) : number(latest?.payload.listPrice) || number(imported?.listPrice) || item.sourcePrice;
      const discounts = calculateBreakerDiscountPrices(listPrice);
      const actualValue = draft.actual !== "" ? draft.actual : text(latest?.payload.actualCost);
      const priceDate = draft.date || text(latest?.payload.priceDate) || text(imported?.priceDate) || item.sourceDate;
      const displayedPrice = draft.price !== "" ? draft.price : text(latest?.payload.listPrice) || text(imported?.listPrice) || text(item.sourcePrice);
      return <tr key={item.key} className={item.status === "Не использовать" ? "mapping-row" : ""}><td><b>{item.article}</b><small>{item.manufacturer} · {item.currentA ? `${item.currentA} А` : "ток не извлечён"} · {item.poles ? `${item.poles}P` : "полюса не извлечены"}</small><span>{item.name}</span><small>{item.sourceFile} · {item.sourceSheet}{item.status ? ` · ${item.status}` : ""}</small></td><td><input type="date" value={priceDate} onChange={(e) => updateBreakerDraft(item.key, { date: e.target.value })} /><input type="number" min="0" step="0.01" value={displayedPrice} onChange={(e) => updateBreakerDraft(item.key, { price: e.target.value })} /></td><td>{currency.format(discounts.discount50)}</td><td>{currency.format(discounts.discount70)}</td><td><input type="number" min="0" step="0.01" value={actualValue} onChange={(e) => updateBreakerDraft(item.key, { actual: e.target.value })} placeholder="вручную" /><button onClick={() => void saveBreakerPrice(item)} disabled={busy}>Сохранить</button></td><td><button onClick={() => selectKomBreaker(item)}>Подобрать</button></td></tr>;
    })}</tbody></table></div>{!visibleBreakers.length && <div className="empty">Ничего не найдено.</div>}{filteredBreakers.length > breakerPageSize && <div className="pagination"><button disabled={breakerPage <= 1} onClick={() => setBreakerPage((value) => value - 1)}>← Назад</button><span>Страница {breakerPage} из {breakerPageCount}</span><button disabled={breakerPage >= breakerPageCount} onClick={() => setBreakerPage((value) => value + 1)}>Вперёд →</button></div>}</section>

    <section className="panel kom-selector"><div className="panel-title"><div><span>03</span><h2>Подбор габарита КОМ</h2></div><small>прайс + заказ + КД</small></div>
      <div className="kom-quick-search">
        <label>Быстрый поиск автомата<input value={komSearch} onChange={(e) => setKomSearch(e.target.value)} placeholder="Введите не менее 2 символов артикула или наименования" /></label>
        {komSearch.trim().length >= 2 && <div className="kom-search-results">
          {komCandidates.map((item) => <button type="button" key={item.key} onClick={() => selectKomBreaker(item)}><b>{item.article}</b><span>{item.manufacturer} · {item.currentA ? `${item.currentA} А` : "ток не указан"}</span><small>{item.name}</small></button>)}
          {!komCandidates.length && <span className="kom-search-empty">Совпадений не найдено.</span>}
        </div>}
      </div>
      <div className="form-grid"><label>Номинальный ток<input type="number" value={kom.current} onChange={(e) => setKom({ ...kom, current: number(e.target.value) })} /></label><label>Исполнение<select value={kom.connection} onChange={(e) => setKom({ ...kom, connection: e.target.value as KomConnection })}><option>Bolt-on</option><option>Plug-in</option></select></label><label>Производитель<input value={kom.maker} onChange={(e) => setKom({ ...kom, maker: e.target.value })} /></label><label>Артикул<input value={kom.article} onChange={(e) => setKom({ ...kom, article: e.target.value })} /></label><label className="wide-field">Модель / наименование<input value={kom.model} onChange={(e) => setKom({ ...kom, model: e.target.value })} /></label><label>Ширина автомата, мм<input type="number" value={kom.width} onChange={(e) => setKom({ ...kom, width: e.target.value })} /></label><label>Глубина автомата, мм<input type="number" value={kom.depth} onChange={(e) => setKom({ ...kom, depth: e.target.value })} /></label><label>Высота автомата, мм<input type="number" value={kom.height} onChange={(e) => setKom({ ...kom, height: e.target.value })} /></label></div>
      <div className="kom-comparison"><div><small>Предыдущая таблица типоразмеров</small><strong>{komDims ? komDims.join("×") : "типоразмер не задан"} мм</strong><span>{kom.connection} · {kom.current} А</span></div><div><small>Подтверждённая КД</small><strong>{kom.current === 250 && kom.connection === "Plug-in" ? `${kom250Drawing.dimensions.join("×")} мм` : "КД не приложена"}</strong><span>{kom.current === 250 && kom.connection === "Plug-in" ? kom250Drawing.designation : "материалы только предварительно"}</span></div><div className={exactKOM ? "ok" : "risk"}><small>Автомат в габарите</small><strong>{breakerDimensions ? exactKOM ? "Да" : "Нет / проверить" : "Введите размеры"}</strong><span>Монтажные зазоры отдельно не подтверждены</span></div></div>
      {kom.current === 250 && kom.connection === "Plug-in" && komDims && komDims.join("×") !== kom250Drawing.dimensions.join("×") && <div className="notice warn-notice"><b>Размеры источников различаются</b><span>Предыдущая таблица даёт {komDims.join("×")} мм, КД {kom250Drawing.designation} — {kom250Drawing.dimensions.join("×")} мм. Для материалов принят чертёж; прежний типоразмер показан как отдельный источник.</span></div>}
    </section>

    <section className="panel"><div className="panel-title"><div><span>04</span><h2>Материалы КОМ</h2></div><small>{komMaterials ? `уверенность: ${komMaterials.confidence.toLowerCase()}` : "нет исходных данных"}</small></div>{komMaterials ? <><div className="resource-grid"><div><b>Лист ОЦ 1,5 мм</b><strong>{komMaterials.steel15Kg.toFixed(2)} кг</strong><span>{komMaterials.exact ? "по деталям КД" : "предварительно"}</span></div><div><b>Лист ОЦ 0,7 мм</b><strong>{komMaterials.steel07Kg.toFixed(2)} кг</strong><span>{komMaterials.exact ? "по деталям КД" : "предварительно"}</span></div><div><b>Корпус в сборе</b><strong>{komMaterials.housingMassKg.toFixed(2)} кг</strong><span>{komMaterials.exact ? "по сборочному чертежу" : "масштабированная оценка"}</span></div><div><b>КОМ в сборе</b><strong>{komMaterials.totalMassKg ? `${komMaterials.totalMassKg.toFixed(2)} кг` : "не рассчитано"}</strong><span>{komMaterials.exact ? "по основной надписи" : "автомат и шины не масштабируются"}</span></div></div><p>{komMaterials.basis}</p>{komMaterials.exact ? <><div className="table-wrap"><table><thead><tr><th>Обозначение</th><th>Деталь</th><th>Материал</th><th>Кол-во</th><th>Масса</th></tr></thead><tbody>{kom250SheetParts.map((part) => <tr key={part.designation}><td>{part.designation}</td><td>{part.name}</td><td>{part.material}</td><td>{part.quantity}</td><td>{part.massKg.toFixed(2)} кг</td></tr>)}</tbody></table></div><details className="transfer-details"><summary>Крепёж по сборочным чертежам</summary><div className="table-wrap"><table><tbody>{kom250Fasteners.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.quantity} шт.</td></tr>)}</tbody></table></div></details><div className="reference-files"><a href="/references/kom/626.250.PB.012.000.000.pdf" target="_blank">Сборочный чертёж КОМ</a><a href="/references/kom/626.250.PB.012.001.000.pdf" target="_blank">Корпус КОМ</a></div></> : <div className="notice warn-notice"><b>Предварительная оценка</b><span>Масса пересчитана пропорционально площади оболочки относительно КОМ 250 А. Эти значения не включаются автоматически в заказ материалов до выпуска КД/развёрток выбранного типоразмера.</span></div>}</> : <div className="empty">Для выбранного тока и исполнения типоразмер не задан.</div>}</section>

    <section className="panel"><div className="panel-title"><div><span>05</span><h2>История цен</h2></div><small>{breakerPrices.length} ручных версий · {breakerImports.length} импортов</small></div><div className="record-list">{breakerImports.map((row) => <div key={row.id}><b>{text(row.payload.fileName)}</b><span>{Array.isArray(row.payload.items) ? row.payload.items.length : 0} сопоставленных цен</span><small>{new Date(row.createdAt).toLocaleString("ru-RU")} · одна сохранённая версия прайса</small></div>)}</div><div className="table-wrap breaker-history-table"><table><thead><tr><th>Дата</th><th>Артикул / модель</th><th>Цена</th><th>−50%</th><th>−70%</th><th>Фактическая стоимость</th><th>Источник</th></tr></thead><tbody>{breakerPrices.map((row) => <tr key={row.id}><td>{text(row.payload.priceDate)}<small>{text(row.payload.dateBasis)}</small></td><td><b>{text(row.payload.article)}</b><small>{text(row.payload.model)}</small></td><td>{currency.format(number(row.payload.listPrice))}</td><td>{currency.format(number(row.payload.discount50))}</td><td>{currency.format(number(row.payload.discount70))}</td><td>{row.payload.actualCost === null || row.payload.actualCost === undefined ? "не указана" : currency.format(number(row.payload.actualCost))}</td><td>{text(row.payload.source)}<small>{text(row.payload.sourceSheet)}</small></td></tr>)}</tbody></table></div></section>
  </div>;

  if (mode === "management") return <div className="enterprise-workspace">{status}<div className="enterprise-grid">
    <section className="panel"><div className="panel-title"><div><span>01</span><h2>Базовая документация</h2></div><small>управляемые версии</small></div><div className="record-list">{baseDocuments.map(([name,file,sheet]) => { const version = records.find((row) => row.category === "base_document" && row.entityKey === name); return <div key={name}><b>{name}</b><span>{text(version?.payload.fileName) || file}</span><small>{sheet} · {version ? `обновлено ${new Date(version.createdAt).toLocaleString("ru-RU")}` : "исходная версия учтена"}</small><label className="inline-file">Обновить<input type="file" hidden onChange={(event) => void uploadBaseDocument(event, name)} /></label>{Boolean(version?.payload.storageKey) && <a href={`/api/documents?key=${encodeURIComponent(text(version?.payload.storageKey))}`}>Скачать текущую версию</a>}</div>; })}</div></section>
    <section className="panel exchange-rate-panel"><div className="panel-title"><div><span>FX</span><h2>Курс юаня для импортных комплектующих</h2></div><small>{latestYuanRate ? `действует версия от ${text(latestYuanRate.payload.rateDate) || new Date(latestYuanRate.createdAt).toLocaleDateString("ru-RU")}` : "курс не задан"}</small></div><div className="form-grid"><label>Курс CNY/RUB<input type="number" min="0" step="0.0001" value={yuanRate.rate} onChange={(e) => setYuanRate({ ...yuanRate, rate: e.target.value })} placeholder="руб. за 1 CNY" /></label><label>Дата курса<input type="date" value={yuanRate.date} onChange={(e) => setYuanRate({ ...yuanRate, date: e.target.value })} /></label><label>Источник<input value={yuanRate.source} onChange={(e) => setYuanRate({ ...yuanRate, source: e.target.value })} placeholder="банк / договор / внутренний курс" /></label><label>Комментарий<input value={yuanRate.note} onChange={(e) => setYuanRate({ ...yuanRate, note: e.target.value })} placeholder="например, запас на колебание курса" /></label></div><button className="primary" disabled={busy || number(yuanRate.rate) <= 0 || !yuanRate.date} onClick={() => void save("exchange_rate", "__GLOBAL__", "CNY/RUB", { currency: "CNY", quoteCurrency: "RUB", rate: number(yuanRate.rate), rateDate: yuanRate.date, source: yuanRate.source, note: yuanRate.note })}>Сохранить курс CNY/RUB</button><p>Будущая цена в рублях: цена в CNY × курс CNY/RUB. Доставка, таможенные платежи, банковская комиссия и НДС этой формулой не учитываются и должны задаваться отдельными правилами.</p>{yuanRates.length > 0 && <details className="transfer-details"><summary>История курса — {yuanRates.length} версий</summary><div className="table-wrap"><table><thead><tr><th>Дата курса</th><th>Курс</th><th>Источник</th><th>Комментарий</th><th>Сохранено</th></tr></thead><tbody>{yuanRates.map((row) => <tr key={row.id}><td>{text(row.payload.rateDate)}</td><td>{number(row.payload.rate).toLocaleString("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} RUB/CNY</td><td>{text(row.payload.source) || "—"}</td><td>{text(row.payload.note) || "—"}</td><td>{new Date(row.createdAt).toLocaleString("ru-RU")}</td></tr>)}</tbody></table></div></details>}</section>
    <section className="panel"><div className="panel-title"><div><span>02</span><h2>Правила секций</h2></div><small>общие + индивидуальные</small></div><div className="form-grid"><label>Область<select value={rule.scope} onChange={(e) => setRule({ ...rule, scope: e.target.value })}><option>Общие</option><option>Тип секции</option></select></label><label>Тип<select disabled={rule.scope === "Общие"} value={rule.type} onChange={(e) => setRule({ ...rule, type: e.target.value })}>{["FE","CD","CP","ZD","ZP","TP","ZDP","TD","ATSC","ATCP","ATCD"].map((type) => <option key={type}>{type}</option>)}</select></label><label>Параметр<input value={rule.field} onChange={(e) => setRule({ ...rule, field: e.target.value })} placeholder="например, норма скотча" /></label><label>Значение<input value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} /></label><label>Источник<input value={rule.source} onChange={(e) => setRule({ ...rule, source: e.target.value })} placeholder="файл / лист / строка" /></label></div><button className="primary" onClick={() => save("rule", rule.scope === "Общие" ? "" : rule.type, rule.field, rule)}>Добавить версию правила</button><p>Индивидуальное правило заменяет одноимённое общее только для выбранного типа. Каждое изменение сохраняется отдельной версией.</p></section>
    <section className="panel"><div className="panel-title"><div><span>03</span><h2>Типовые длины и номинал</h2></div><small>редактируемые оценки</small></div><div className="form-grid compact">{Object.entries(lengths).map(([key,value]) => <label key={key}>{key}, мм<input type="number" value={value} onChange={(e) => setLengths({ ...lengths, [key]: number(e.target.value) })} /></label>)}</div><div className="decision-grid"><button>Стандартный номинал<small>без снижения</small></button><button>−1 шаг<small>например 2000 → 1600 А</small></button><button>−2 шага<small>например 2000 → 1250 А</small></button></div><p>После выбора режима должны пересчитываться шина и корпус. Верхняя/нижняя границы пока не утверждены и поэтому автоматическое применение режима заблокировано.</p></section>
    <section className="panel"><div className="panel-title"><div><span>04</span><h2>Компенсаторы</h2></div><small>только «Для производства»</small></div><label>Номинальный ток<select value={compCurrent} onChange={(e) => setCompCurrent(number(e.target.value))}>{productionCompensators.map((row) => <option key={row[0]} value={row[0]}>{row[0]} А</option>)}</select></label><button className="primary" onClick={() => setCompUpdated(new Date().toLocaleString("ru-RU"))}>Обновить расчёт</button><div className="calc-card"><b>{comp[0]} А · {comp[3]} шт./фазу</b><span>ширина {comp[4]} мм · сечение {comp[5]} мм²</span><small>{comp[7]} косичек/фазу · {comp[8]} {comp[9]} мм · развёртка {comp[10]} мм · аналог {comp[11]}</small>{compUpdated && <i>обновлено {compUpdated}</i>}</div></section>
    </div>
    <section className="panel"><div className="panel-title"><div><span>05</span><h2>Стандартные крепления</h2></div><small>по приложенным сборочным чертежам</small></div><label>Узел<select value={fastening} onChange={(e) => setFastening(e.target.value)}>{fasteningNodes.map((row) => <option key={row.code}>{row.code}</option>)}</select></label>{fasteningNodes.filter((row) => row.code === fastening).map((row) => <div className="resource-grid" key={row.code}><div><b>Профиль</b><span>{row.profile}</span><strong>{row.profileM} м</strong></div><div><b>Кронштейн</b><span>{row.bracket}</span><strong>{row.brackets} шт.</strong></div><div><b>Болт M10×70</b><span>DIN 933</span><strong>{row.bolts70} шт.</strong></div><div><b>Болт M10×30</b><span>DIN 933</span><strong>{row.bolts30} шт.</strong></div><div><b>Гайка M10</b><span>DIN 934</span><strong>{row.nuts} шт.</strong></div><div><b>Анкер 16×60</b><span>4-сегментный M10</span><strong>{row.anchors} шт.</strong></div></div>)}</section>
  </div>;

  const shifts = records.filter((row) => row.category === "shift");
  return <div className="enterprise-workspace">{status}<div className="object-kpis"><div><span>Рабочий день КО</span><strong>9 ч</strong><small>стандартный производственный календарь</small></div><div><span>Рабочий день ПО</span><strong>12 ч</strong><small>производственный отдел</small></div><div><span>Заданий</span><strong>{shifts.length}</strong><small>в журнале</small></div><div><span>Обновление</span><strong>ручное</strong><small>режим подтверждён</small></div></div>
    <div className="enterprise-grid"><section className="panel"><div className="panel-title"><div><span>01</span><h2>Сформировать сменное задание</h2></div><small>привычная форма производства</small></div><div className="form-grid"><label>Дата<input type="date" value={shiftDraft.date} onChange={(e) => setShiftDraft({ ...shiftDraft, date: e.target.value })} /></label><label>Цех<input value={shiftDraft.shop} onChange={(e) => setShiftDraft({ ...shiftDraft, shop: e.target.value })} /></label><label>Мастер<input value={shiftDraft.master} onChange={(e) => setShiftDraft({ ...shiftDraft, master: e.target.value })} /></label><label>Пост<input value={shiftDraft.post} onChange={(e) => setShiftDraft({ ...shiftDraft, post: e.target.value })} /></label><label>Работник / бригада<input value={shiftDraft.worker} onChange={(e) => setShiftDraft({ ...shiftDraft, worker: e.target.value })} /></label><label>Заказ и проект<input value={shiftDraft.project} onChange={(e) => setShiftDraft({ ...shiftDraft, project: e.target.value })} /></label><label>Задание<input value={shiftDraft.task} onChange={(e) => setShiftDraft({ ...shiftDraft, task: e.target.value })} /></label><label>План, шт.<input value={shiftDraft.plan} onChange={(e) => setShiftDraft({ ...shiftDraft, plan: e.target.value })} /></label><label>Время план<input value={shiftDraft.planTime} onChange={(e) => setShiftDraft({ ...shiftDraft, planTime: e.target.value })} placeholder="08:00–19:30" /></label><label>Комментарий<input value={shiftDraft.comment} onChange={(e) => setShiftDraft({ ...shiftDraft, comment: e.target.value })} /></label></div><button className="primary" onClick={() => save("shift", shiftDraft.project, `${shiftDraft.date}|${shiftDraft.master}|${Date.now()}`, shiftDraft)}>Добавить в смену</button></section>
      <section className="panel"><div className="panel-title"><div><span>02</span><h2>Импорт прежней формы</h2></div><small>.xlsx</small></div><label className="file-button">⇧ Загрузить сменное задание<input type="file" accept=".xlsx,.xls" hidden onChange={importShift} /></label><p>Распознаются листы «Мастер №1–3» и колонки исходной формы. Пустые повторяющиеся значения мастера, поста и работника наследуются от предыдущей строки.</p><button onClick={() => setShiftDraft({ ...shiftDraft, planTime: "08:00–20:00" })}>Автозаполнить 12-часовую смену ПО</button></section></div>
    <section className="panel"><div className="panel-title"><div><span>03</span><h2>Сменная ведомость</h2></div><small>план / факт / причины</small></div><div className="table-wrap"><table><thead><tr><th>Дата / цех</th><th>Мастер</th><th>Пост / работник</th><th>Проект</th><th>Задание</th><th>План</th><th>Время</th><th>Комментарий</th></tr></thead><tbody>{shifts.map((row) => <tr key={row.id}><td>{text(row.payload.date) || "из файла"}<small>цех {text(row.payload.shop) || text(row.payload.sheet)}</small></td><td>{text(row.payload.master)}</td><td>{text(row.payload.post)}<small>{text(row.payload.worker)}</small></td><td>{text(row.payload.project)}</td><td>{text(row.payload.task)}</td><td>{text(row.payload.plan)}</td><td>{text(row.payload.planTime)}</td><td>{text(row.payload.comment)}</td></tr>)}</tbody></table></div></section>
  </div>;
}
