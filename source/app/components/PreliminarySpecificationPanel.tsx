"use client";

import { ChangeEvent, Dispatch, SetStateAction, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  CommercialEstimate,
  parsePreliminaryMatrix,
  PreliminarySpecification,
} from "../lib/preliminarySpecification";

type Props = {
  specifications: PreliminarySpecification[];
  setSpecifications: Dispatch<SetStateAction<PreliminarySpecification[]>>;
  estimate: (specification: PreliminarySpecification) => CommercialEstimate;
  onImportFiles?: (files: File[]) => Promise<PreliminarySpecification[]>;
  onSave?: (specification: PreliminarySpecification) => Promise<PreliminarySpecification>;
  onDelete?: (specification: PreliminarySpecification) => Promise<void>;
  onConvert?: (specification: PreliminarySpecification) => Promise<void>;
};

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberValue = (value: string) => Math.max(0, Number(value.replace(",", ".")) || 0);

export async function parsePreliminarySpecification(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("В книге отсутствуют листы.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
  return parsePreliminaryMatrix(matrix, file.name);
}

export default function PreliminarySpecificationPanel({ specifications, setSpecifications, estimate, onImportFiles, onSave, onDelete, onConvert }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const active = specifications.find((item) => item.id === activeId) ?? specifications[0];
  const result = useMemo(() => active ? estimate(active) : null, [active, estimate]);
  const rows = useMemo(() => {
    if (!active) return [];
    const needle = query.trim().toLowerCase();
    return active.rows.filter((row) => !needle || `${row.rowNumber} ${row.article} ${row.item}`.toLowerCase().includes(needle));
  }, [active, query]);
  const hasCopperRows = Boolean(active?.rows.some((row) => row.article.toUpperCase().split("-").includes("CU")));
  const hasFivePoleRows = Boolean(active?.rows.some((row) => row.article.toUpperCase().split("-")[5] === "5"));

  function updateActive(patch: Partial<PreliminarySpecification>) {
    if (!active) return;
    setSpecifications((current) => current.map((item) => item.id === active.id ? { ...item, ...patch } : item));
  }

  function updateLength(rowId: string, value: string) {
    if (!active) return;
    updateActive({ rows: active.rows.map((row) => row.id === rowId ? { ...row, commercialLengthMm: numberValue(value) } : row) });
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true); setMessage("");
    try {
      const parsed = onImportFiles ? await onImportFiles(files) : await Promise.all(files.map(parsePreliminarySpecification));
      if (!onImportFiles) setSpecifications((current) => [...parsed, ...current]);
      setActiveId(parsed[0]?.id ?? "");
      setMessage(`Загружено предварительных спецификаций: ${parsed.length}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось прочитать спецификацию."); }
    finally { setBusy(false); }
  }

  async function saveParameters() {
    if (!active || !onSave) return;
    setBusy(true); setMessage("");
    try {
      const saved = await onSave(active);
      setActiveId(saved.id);
      setMessage("Коммерческие параметры сохранены новой версией.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить параметры."); }
    finally { setBusy(false); }
  }

  async function deleteSpecification() {
    if (!active || !onDelete || !window.confirm(`Удалить предварительную спецификацию № ${active.number}?`)) return;
    setBusy(true); setMessage("");
    try { await onDelete(active); setActiveId(""); setMessage("Предварительная спецификация удалена."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось удалить спецификацию."); }
    finally { setBusy(false); }
  }

  async function convertToProduction() {
    if (!active || !onConvert) return;
    setBusy(true); setMessage("");
    try { await onConvert(active); setMessage("Создан черновик заказа на производство. Он доступен в соседнем окне."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось создать заказ на производство."); }
    finally { setBusy(false); }
  }

  return <div className="preliminary-specification">
    <div className="notice ok-notice"><b>Коммерческий расчёт</b><span>S1 = стандартные размеры. S2 = 1500 мм, S3 = 2500 мм: для секции с одним размером меняется L1, для секций с двумя или тремя размерами меняется только L2; остальные размеры остаются стандартными. Наценка по умолчанию 22%, допускается 0%.</span></div>
    <div className={`import-layout ${specifications.length ? "" : "single"}`}>
      <section className="panel upload-panel"><div className="panel-title"><div><span>01</span><h2>Предварительная спецификация</h2></div><small>форма для договора</small></div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple hidden onChange={handleFiles} />
        <button className="dropzone" disabled={busy} onClick={() => inputRef.current?.click()}><span className="upload-icon">⇧</span><strong>{busy ? "Обрабатываю…" : "Загрузить предварительную спецификацию"}</strong><small>.xlsx или .xls · форма с Part No./Артикул и Q-ty/Кол.</small></button>
        {message && <p className="status">{message}</p>}
      </section>
      {specifications.length > 0 && <section className="panel examples-panel"><div className="panel-title"><div><span>02</span><h2>Сохранённые спецификации</h2></div><small>{specifications.length}</small></div><div className="example-orders">{specifications.map((item) => <button type="button" key={item.id} className={`example-order linked ${item.id === active?.id ? "focused" : ""}`} onClick={() => setActiveId(item.id)}><div><strong>№ {item.number}</strong><small>{item.projectName} · {item.date}</small></div><span className="order-state ready">Предварительная</span><footer><span>{item.rows.length} позиций</span><strong>{item.markupPercent}% наценка</strong></footer></button>)}</div></section>}
    </div>

    {active && result && <>
      <section className="panel commercial-settings"><div className="panel-title"><div><span>03</span><h2>Коммерческие параметры</h2></div><small>№ {active.number} · {active.projectName}</small></div>
        <div className="form-grid"><label>Наценка, %<input type="number" min="0" step="0.1" value={active.markupPercent} onChange={(event) => updateActive({ markupPercent: numberValue(event.target.value) })} /></label><label>НДС, %<input type="number" min="0" step="0.1" value={active.vatPercent} onChange={(event) => updateActive({ vatPercent: numberValue(event.target.value) })} /></label></div>
        <div className="commercial-actions"><button className="primary" disabled={busy || !onSave} onClick={() => void saveParameters()}>Сохранить параметры</button><button disabled={busy || !onConvert} onClick={() => void convertToProduction()}>Создать заказ на производство</button><button className="danger-button" disabled={busy || !onDelete} onClick={() => void deleteSpecification()}>Удалить</button></div>
        <p>НДС рассчитывается после наценки и показан отдельно. Транспортные, таможенные и банковские расходы включаются только при наличии отдельного правила или цены в базе.</p>
      </section>
      <div className="commercial-kpis"><div><span>Расчётная себестоимость</span><strong>{money.format(result.baseCost)}</strong><small>{result.calculatedRows} строк рассчитано</small></div><div><span>Наценка {active.markupPercent}%</span><strong>{money.format(result.markupAmount)}</strong><small>редактируемая</small></div><div><span>Цена без НДС</span><strong>{money.format(result.subtotalWithMarkup)}</strong><small>себестоимость + наценка</small></div><div><span>НДС {active.vatPercent}%</span><strong>{money.format(result.vatAmount)}</strong><small>от цены с наценкой</small></div><div className="total"><span>Договорная стоимость</span><strong>{money.format(result.contractTotal)}</strong><small>{result.excludedRows} строк не включено</small></div></div>
      {hasCopperRows && <div className="notice warn-notice"><b>Ограничение расчётной базы</b><span>{hasCopperRows ? "Позиции Cu не рассчитываются по алюминиевой ресурсной модели. " : ""}Они остаются в спецификации со статусом «Не включено», пока не будут загружены подтверждённые составы и цены.</span></div>}
      <section className="panel"><div className="panel-title"><div><span>04</span><h2>Расчёт по позициям</h2></div><small>{rows.length} показано · {active.rows.length} всего</small></div><div className="table-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по артикулу или наименованию" aria-label="Поиск по предварительной спецификации" /></div><div className="table-wrap"><table className="preliminary-table"><thead><tr><th>№</th><th>Артикул / наименование</th><th>Кол-во</th><th>Класс / режим</th><th>Правило размера</th><th>Себестоимость за шт.</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>{rows.map((row) => { const calculated = result.rows.find((item) => item.rowId === row.id); return <tr key={row.id} className={calculated?.status === "excluded" ? "mapping-row" : ""}><td>{row.rowNumber}</td><td><b>{row.article}</b><small>{row.item}</small></td><td>{row.quantity} {row.unit}</td><td>{row.lengthClass || "Стандарт"}</td><td>{row.lengthClass === "S1" ? "стандартные размеры" : row.lengthClass ? <input type="number" min="1" step="1" value={row.commercialLengthMm} onChange={(event) => updateLength(row.id, event.target.value)} aria-label={`Целевой размер ${row.article}`} /> : row.commercialLengthMm ? `${row.commercialLengthMm} мм` : "по таблице стандартов"}</td><td>{calculated?.status === "calculated" ? money.format(calculated.unitCost) : "—"}</td><td>{calculated?.status === "calculated" ? money.format(calculated.totalCost) : "—"}</td><td><span className={`planning-status ${calculated?.status === "calculated" ? "covered" : "mapping"}`}>{calculated?.status === "calculated" ? "Рассчитано" : "Не включено"}</span><small>{calculated?.reason}</small></td></tr>; })}</tbody></table></div></section>
    </>}
    {!specifications.length && <section className="empty-workspace"><span>Коммерческий расчёт появится здесь</span><h2>Загрузите предварительную спецификацию</h2><p>Система распознает артикулы KLM, применит стандартные размеры или предварительное правило S1/S2/S3 и покажет себестоимость, наценку, НДС и договорную стоимость.</p></section>}
  </div>;
}
