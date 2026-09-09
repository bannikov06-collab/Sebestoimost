'use client';

import { useEffect, useMemo, useState } from 'react';
import registrySource from '../data/approvedRulesRegistry.json';

type Registry = typeof registrySource;
type Kind = 'businessRules' | 'calculationRules' | 'codes' | 'sources';
type OverrideRecord = { id: number; entityKey: string; payload: { value?: unknown; changedAt?: string } };

const labels: Record<Kind, string> = {
  businessRules: 'Утверждённые правила',
  calculationRules: 'Расчётные правила',
  codes: 'Коды 1С',
  sources: 'Источники',
};

function keyFor(kind: Kind, row: any, index: number) {
  return `${kind}:${row.id ?? row.number ?? index + 1}`;
}

export default function ApprovedRulesRegistryPanel() {
  const [kind, setKind] = useState<Kind>('businessRules');
  const [query, setQuery] = useState('');
  const [overrides, setOverrides] = useState<Record<string, { id: number; value: any; changedAt?: string }>>({});
  const [selectedKey, setSelectedKey] = useState('');
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/workspace?category=managed_rule_override&project=GLOBAL')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const latest: Record<string, { id: number; value: any; changedAt?: string }> = {};
        for (const record of (data?.records ?? []) as OverrideRecord[]) {
          if (!latest[record.entityKey] && record.payload?.value !== undefined) {
            latest[record.entityKey] = { id: record.id, value: record.payload.value, changedAt: record.payload.changedAt };
          }
        }
        setOverrides(latest);
      })
      .catch(() => {});
  }, []);

  const sourceRows = (registrySource[kind] ?? []) as any[];
  const rows = useMemo(() => sourceRows.map((base, index) => {
    const key = keyFor(kind, base, index);
    return { key, base, value: overrides[key]?.value ?? base, changedAt: overrides[key]?.changedAt };
  }), [kind, overrides]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => !needle || JSON.stringify(row.value).toLowerCase().includes(needle));
  }, [rows, query]);
  const selected = rows.find((row) => row.key === selectedKey) ?? filtered[0];

  useEffect(() => {
    if (!selected) { setDraft(''); return; }
    setSelectedKey(selected.key);
    setDraft(JSON.stringify(selected.value, null, 2));
  }, [kind, selected?.key, overrides]);

  async function save() {
    if (!selected) return;
    setBusy(true); setMessage('');
    try {
      const value = JSON.parse(draft);
      const changedAt = new Date().toISOString();
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category: 'managed_rule_override', projectKey: 'GLOBAL', entityKey: selected.key, payload: { value, changedAt, source: registrySource.sourceFile } }),
      });
      const data = await response.json();
      if (!response.ok || !data.record) throw new Error(data.error || 'Не удалось сохранить правило');
      setOverrides((current) => ({ ...current, [selected.key]: { id: Number(data.record.id), value, changedAt } }));
      setMessage('Изменение сохранено отдельной версией. Расчётный код автоматически не переписан.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Проверьте формат JSON.');
    } finally { setBusy(false); }
  }

  return <section className='panel managed-rules-panel'>
    <div className='panel-title'><div><span>00</span><h2>Управляемый реестр кодов и правил</h2></div><small>{registrySource.codes.length} кодов · {registrySource.calculationRules.length} правил · {registrySource.sources.length} источников</small></div>
    <div className='notice ok-notice'><b>Источник:</b><span>{registrySource.sourceFile} · {registrySource.asOf}. Любая ручная правка сохраняется отдельной записью и не меняет формулы скрыто.</span></div>
    <div className='managed-rule-tabs'>{(Object.keys(labels) as Kind[]).map((item) => <button key={item} className={kind === item ? 'active' : ''} onClick={() => { setKind(item); setQuery(''); setSelectedKey(''); }}>{labels[item]} <span>{(registrySource[item] as any[]).length}</span></button>)}</div>
    <input className='managed-rule-search' value={query} onChange={(event) => setQuery(event.target.value)} placeholder='Поиск по коду, названию, разделу или правилу' />
    <div className='managed-rule-layout'>
      <div className='managed-rule-list'>{filtered.map((row) => <button key={row.key} className={selected?.key === row.key ? 'active' : ''} onClick={() => { setSelectedKey(row.key); setDraft(JSON.stringify(row.value, null, 2)); }}><strong>{row.value.title ?? row.value.name ?? row.value.object ?? row.value.source ?? row.key}</strong><small>{row.value.code ?? row.value.approvedDecision ?? row.value.approvedRule ?? row.value.scope ?? ''}</small>{row.changedAt && <em>изменено {new Date(row.changedAt).toLocaleString('ru-RU')}</em>}</button>)}</div>
      <div className='managed-rule-editor'>{selected ? <><div className='panel-title'><div><span>✎</span><h3>{selected.value.title ?? selected.value.name ?? selected.value.object ?? selected.key}</h3></div><small>{selected.key}</small></div><textarea value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false}/><div className='managed-rule-actions'><button className='primary' disabled={busy} onClick={() => void save()}>{busy ? 'Сохраняю…' : 'Сохранить новую редакцию'}</button><button onClick={() => setDraft(JSON.stringify(selected.value, null, 2))}>Отменить несохранённое</button></div>{message && <p className='status'>{message}</p>}</> : <div className='empty'>По выбранному фильтру записей нет.</div>}</div>
    </div>
  </section>;
}
