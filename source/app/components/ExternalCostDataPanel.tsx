'use client';

import { useEffect, useMemo, useState } from 'react';
import { applyMarketLock, createProjectMarketSnapshot, type MarketPoint, type ProjectMarketSnapshot } from '../lib/marketLock';

type SupplierPrice = { supplier: string; material: string; priceRub: number; unit: string };
type MarketData = { fetchedAt?: string; lme?: { aluminium?: { bid?: number; ask?: number }; copper?: { bid?: number; ask?: number }; date?: string; source?: string } | null; cbr?: { usdRub?: number; date?: string; source?: string } | null; errors?: string[] };
type Inputs = { aluminiumUsdT: number; copperUsdT: number; usdRub: number; suppliers: SupplierPrice[]; sourceDate: string };
type Props = { projectKey?: string; projectKeys?: string[]; onEffectiveChange?: (snapshot: ProjectMarketSnapshot | null) => void };

const empty: Inputs = { aluminiumUsdT: 0, copperUsdT: 0, usdRub: 0, suppliers: [], sourceDate: '' };
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export default function ExternalCostDataPanel({ projectKey = 'GLOBAL', projectKeys = [], onEffectiveChange }: Props) {
  const [open, setOpen] = useState(true);
  const [inputs, setInputs] = useState<Inputs>(empty);
  const [market, setMarket] = useState<MarketData>({});
  const [effective, setEffective] = useState<ProjectMarketSnapshot | null>(null);
  const [history, setHistory] = useState<ProjectMarketSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const key = projectKey.trim() || 'GLOBAL';
    Promise.all([
      fetch('/api/external-market-data').then((response) => response.ok ? response.json() : null),
      fetch('/api/workspace?category=external_cost_inputs&project=GLOBAL').then((response) => response.ok ? response.json() : null),
      fetch(`/api/workspace?category=project_market_snapshot&project=${encodeURIComponent(key)}`).then((response) => response.ok ? response.json() : null),
    ]).then(async ([marketData, saved, projectHistory]) => {
      if (cancelled) return;
      const latestGlobal = saved?.records?.[0]?.payload?.inputs as Inputs | undefined;
      const currentInputs: Inputs = {
        aluminiumUsdT: Number(marketData?.lme?.aluminium?.ask) || latestGlobal?.aluminiumUsdT || 0,
        copperUsdT: Number(marketData?.lme?.copper?.ask) || latestGlobal?.copperUsdT || 0,
        usdRub: Number(marketData?.cbr?.usdRub) || latestGlobal?.usdRub || 0,
        suppliers: latestGlobal?.suppliers ?? [],
        sourceDate: String(marketData?.lme?.date || marketData?.cbr?.date || latestGlobal?.sourceDate || ''),
      };
      const snapshots = (projectHistory?.records ?? []).map((record: any) => record.payload?.snapshot).filter(Boolean) as ProjectMarketSnapshot[];
      const previous = snapshots[0] ?? null;
      const point: MarketPoint = {
        aluminiumUsdT: currentInputs.aluminiumUsdT,
        copperUsdT: currentInputs.copperUsdT,
        usdRub: currentInputs.usdRub,
        sourceDate: currentInputs.sourceDate,
        capturedAt: new Date().toISOString(),
      };
      let next = previous ? applyMarketLock(previous, point) : createProjectMarketSnapshot(key, point);
      next = { ...next, projectKey: key };
      setMarket(marketData ?? {});
      setInputs(currentInputs);
      setHistory(snapshots);
      setEffective(next);
      onEffectiveChange?.(next);
      const mustPersist = !previous || next.capturedAt !== previous.capturedAt || next.usdRub !== previous.usdRub || next.aluminiumUsdT !== previous.aluminiumUsdT || next.copperUsdT !== previous.copperUsdT;
      if (mustPersist && key !== 'GLOBAL') {
        await fetch('/api/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: 'project_market_snapshot', projectKey: key, entityKey: next.capturedAt, payload: { snapshot: next } }) }).catch(() => null);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectKey, onEffectiveChange]);

  useEffect(() => {
    const keys=[...new Set(projectKeys.map(key=>key.trim()).filter(key=>key&&key!=='GLOBAL'))];
    if(!keys.length||!(inputs.usdRub>0)||!(inputs.aluminiumUsdT>0)||!(inputs.copperUsdT>0))return;
    let cancelled=false;
    const point:MarketPoint={aluminiumUsdT:inputs.aluminiumUsdT,copperUsdT:inputs.copperUsdT,usdRub:inputs.usdRub,sourceDate:inputs.sourceDate,capturedAt:new Date().toISOString()};
    Promise.all(keys.map(async key=>{
      const response=await fetch(`/api/workspace?category=project_market_snapshot&project=${encodeURIComponent(key)}`);
      const data=response.ok?await response.json():null;
      const previous=(data?.records?.[0]?.payload?.snapshot??null) as ProjectMarketSnapshot|null;
      let next=previous?applyMarketLock(previous,point):createProjectMarketSnapshot(key,point); next={...next,projectKey:key};
      const changed=!previous||next.capturedAt!==previous.capturedAt||next.usdRub!==previous.usdRub||next.aluminiumUsdT!==previous.aluminiumUsdT||next.copperUsdT!==previous.copperUsdT;
      if(changed&&!cancelled)await fetch('/api/workspace',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({category:'project_market_snapshot',projectKey:key,entityKey:next.capturedAt,payload:{snapshot:next}})});
    })).catch(()=>{});
    return()=>{cancelled=true};
  },[projectKeys.join('|'),inputs.usdRub,inputs.aluminiumUsdT,inputs.copperUsdT,inputs.sourceDate]);

  const derived = useMemo(() => ({
    aluminiumRubKg: (effective?.aluminiumUsdT ?? inputs.aluminiumUsdT) > 0 && (effective?.usdRub ?? inputs.usdRub) > 0 ? (effective?.aluminiumUsdT ?? inputs.aluminiumUsdT) * (effective?.usdRub ?? inputs.usdRub) / 1000 : 0,
    copperRubKg: (effective?.copperUsdT ?? inputs.copperUsdT) > 0 && (effective?.usdRub ?? inputs.usdRub) > 0 ? (effective?.copperUsdT ?? inputs.copperUsdT) * (effective?.usdRub ?? inputs.usdRub) / 1000 : 0,
  }), [inputs, effective]);

  async function save() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: 'external_cost_inputs', projectKey: 'GLOBAL', entityKey: new Date().toISOString(), payload: { inputs, derived, savedAt: new Date().toISOString() } }) });
      const data = await response.json();
      if (!response.ok || !data.record) throw new Error(data.error || 'Не удалось сохранить внешние данные');
      setMessage('Внешние данные сохранены. Для проектов действует 14-дневная фиксация с защитой от снижения курса/металла.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка сохранения'); }
    finally { setBusy(false); }
  }

  function updateSupplier(index: number, patch: Partial<SupplierPrice>) {
    setInputs((current) => ({ ...current, suppliers: current.suppliers.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) }));
  }

  const lockDate = (value?: string) => value ? new Date(value).toLocaleDateString('ru-RU') : '—';
  return <>
    <button className='market-data-button' onClick={() => setOpen(true)}>LME / USD / поставщики</button>
    {open && <div className='market-modal-backdrop' role='dialog' aria-modal='true' aria-label='Внешние данные для расчёта стоимости'>
      <section className='market-modal panel'>
        <div className='panel-title'><div><span>₽</span><h2>Внешние данные для себестоимости</h2></div><button onClick={() => setOpen(false)}>Закрыть</button></div>
        <div className='notice ok-notice'><b>Автоматические источники:</b><span>LME Official Prices (day-delayed) и официальный курс USD Банка России. По проекту значения фиксируются на 14 дней. После 14 дней рост применяется, снижение не уменьшает ранее зафиксированную базу.</span></div>
        {effective && <div className='market-lock-card'><strong>Проект: {projectKey}</strong><span>Контроль показателей ведётся отдельно</span><small>USD до {lockDate(effective.usdLock?.validUntil)} — {effective.usdReason}</small><small>Al до {lockDate(effective.aluminiumLock?.validUntil)} — {effective.aluminiumReason}</small><small>Cu до {lockDate(effective.copperLock?.validUntil)} — {effective.copperReason}</small></div>}
        <div className='external-input-grid'>
          <label>LME Aluminium, USD/т<input type='number' step='0.01' value={inputs.aluminiumUsdT || ''} onChange={(event) => setInputs({ ...inputs, aluminiumUsdT: Number(event.target.value) || 0 })}/><small>{market.lme?.date || 'дата источника не определена'}</small></label>
          <label>LME Copper, USD/т<input type='number' step='0.01' value={inputs.copperUsdT || ''} onChange={(event) => setInputs({ ...inputs, copperUsdT: Number(event.target.value) || 0 })}/><small>{market.lme?.date || 'дата источника не определена'}</small></label>
          <label>USD/RUB, ЦБ РФ<input type='number' step='0.0001' value={inputs.usdRub || ''} onChange={(event) => setInputs({ ...inputs, usdRub: Number(event.target.value) || 0 })}/><small>{market.cbr?.date || 'дата источника не определена'}</small></label>
        </div>
        <div className='external-derived'><div><span>Al, зафиксированная база</span><strong>{derived.aluminiumRubKg ? `${number.format(derived.aluminiumRubKg)} ₽/кг` : '—'}</strong><small>LME × зафиксированный USD/RUB ÷ 1000</small></div><div><span>Cu, зафиксированная база</span><strong>{derived.copperRubKg ? `${number.format(derived.copperRubKg)} ₽/кг` : '—'}</strong><small>LME × зафиксированный USD/RUB ÷ 1000</small></div></div>
        {history.length > 0 && <details className='market-history'><summary>История проекта ({history.length})</summary>{history.slice(0,12).map((row,index)=><div key={`${row.capturedAt}-${index}`}><span>{new Date(row.capturedAt).toLocaleDateString('ru-RU')}</span><span>USD {number.format(row.usdRub)}</span><span>Al {number.format(row.aluminiumUsdT)}</span><span>Cu {number.format(row.copperUsdT)}</span></div>)}</details>}
        <div className='panel-title'><div><span>П</span><h3>Цены основных поставщиков</h3></div><button onClick={() => setInputs((current) => ({ ...current, suppliers: [...current.suppliers, { supplier: '', material: '', priceRub: 0, unit: 'руб/кг' }] }))}>＋ Добавить</button></div>
        <div className='supplier-price-list'>{inputs.suppliers.map((row, index) => <div key={index}><input placeholder='Поставщик' value={row.supplier} onChange={(event) => updateSupplier(index, { supplier: event.target.value })}/><input placeholder='Материал' value={row.material} onChange={(event) => updateSupplier(index, { material: event.target.value })}/><input type='number' placeholder='Цена' value={row.priceRub || ''} onChange={(event) => updateSupplier(index, { priceRub: Number(event.target.value) || 0 })}/><input placeholder='Ед.' value={row.unit} onChange={(event) => updateSupplier(index, { unit: event.target.value })}/><button onClick={() => setInputs((current) => ({ ...current, suppliers: current.suppliers.filter((_, i) => i !== index) }))}>×</button></div>)}</div>
        {market.errors?.length ? <p className='status'>Автоисточник: {market.errors.join(' · ')}. Последнее зафиксированное значение проекта сохраняется.</p> : null}
        {message && <p className='status'>{message}</p>}
        <div className='commercial-actions'><button className='primary' disabled={busy} onClick={() => void save()}>{busy ? 'Сохраняю…' : 'Сохранить входные данные'}</button><button onClick={() => setOpen(false)}>Продолжить работу</button></div>
      </section>
    </div>}
  </>;
}
