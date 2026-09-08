'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  autoReserve,
  freeStock,
  normalizeReservation,
  reservedTotal,
  type AvailabilityLine,
  type DemandLine,
  type ReservationLine,
} from '../lib/reservations';

type Props = {
  demands: DemandLine[];
  availability: AvailabilityLine[];
};

type ReservationEvent = {
  operation: 'create' | 'transfer';
  occurredAt: string;
  actor: string;
  source: string;
  materialCode: string;
  materialName: string;
  quantity: number;
  fromProject?: string;
  toProject?: string;
  sourceDeficitAfter: number;
  reason: string;
};

export default function ReservationsPanel({
  demands,
  availability,
}: Props) {
  const [rows, setRows] = useState<ReservationLine[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetch('/api/workspace?category=material_reservation')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        const latest = data?.records?.[0]?.payload?.rows;
        if (Array.isArray(latest))
          setRows(latest.map(normalizeReservation));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const projects = useMemo(
    () => [...new Set(demands.map((demand) => demand.projectKey))],
    [demands],
  );

  async function persist(
    next: ReservationLine[],
    event: ReservationEvent,
  ) {
    setRows(next);
    const savedAt = new Date().toISOString();
    const snapshotResponse = await fetch('/api/workspace', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: 'material_reservation',
        projectKey: 'GLOBAL',
        entityKey: savedAt,
        payload: { rows: next, savedAt, lastEvent: event },
      }),
    });
    const eventResponse = await fetch('/api/workspace', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: 'material_reservation_event',
        projectKey:
          event.toProject || event.fromProject || 'GLOBAL',
        entityKey: event.occurredAt,
        payload: { event },
      }),
    });
    setMessage(
      snapshotResponse.ok && eventResponse.ok
        ? 'Резервы и операция сохранены в журнале.'
        : 'Ошибка сохранения резерва или журнала.',
    );
  }

  function build() {
    const occurredAt = new Date().toISOString();
    const next = autoReserve(demands, availability, occurredAt);
    void persist(next, {
      operation: 'create',
      occurredAt,
      actor: 'Пользователь KLM',
      source: 'Автоматическое резервирование',
      materialCode: '*',
      materialName: 'Групповое резервирование',
      quantity: next.reduce((sum, row) => sum + row.qty, 0),
      sourceDeficitAfter: 0,
      reason: 'Распределено по очереди приоритетов проектов',
    });
  }

  function transfer(index: number) {
    const row = rows[index];
    const candidates = projects.filter(
      (project) => project !== row.projectKey,
    );
    if (!candidates.length) return;
    const to = window.prompt(
      `Новый проект для резерва «${row.name}»:\n${candidates.join('\n')}`,
      candidates[0],
    );
    if (!to || !candidates.includes(to)) return;
    const qty = Number(
      window.prompt('Количество к переносу', String(row.qty)),
    );
    if (!(qty > 0 && qty <= row.qty)) return;
    const remaining = row.qty - qty;
    const sourceNeed =
      demands.find(
        (demand) =>
          demand.projectKey === row.projectKey &&
          demand.code === row.code,
      )?.qty ?? 0;
    const sourceDeficitAfter = Math.max(sourceNeed - remaining, 0);
    const confirmation = [
      `Исходный проект: ${row.projectKey}`,
      `Новый проект: ${to}`,
      `Материал: ${row.code} · ${row.name}`,
      `Количество: ${qty.toFixed(3)} ${row.unit}`,
      `Остаток резерва исходного проекта: ${remaining.toFixed(3)} ${row.unit}`,
      sourceDeficitAfter > 0
        ? `ВНИМАНИЕ: у исходного проекта возникнет дефицит ${sourceDeficitAfter.toFixed(3)} ${row.unit}`
        : 'Дефицит у исходного проекта не возникнет',
      '',
      'Подтвердить перенос резерва?',
    ].join('\n');
    if (!window.confirm(confirmation)) return;

    const occurredAt = new Date().toISOString();
    const reason =
      sourceDeficitAfter > 0
        ? 'Перенос подтверждён пользователем; у исходного проекта возник дефицит'
        : 'Перенос подтверждён пользователем';
    const next = [...rows];
    next[index] = { ...row, qty: remaining, reason };
    const target = next.findIndex(
      (item) =>
        item.projectKey === to && item.code === row.code,
    );
    if (target >= 0)
      next[target] = {
        ...next[target],
        qty: next[target].qty + qty,
        reservedAt: occurredAt,
        actor: 'Пользователь KLM',
        source: 'Перенос резерва',
        reason,
      };
    else
      next.push({
        ...row,
        projectKey: to,
        qty,
        reservedAt: occurredAt,
        actor: 'Пользователь KLM',
        source: 'Перенос резерва',
        reason,
      });
    void persist(
      next.filter((item) => item.qty > 0),
      {
        operation: 'transfer',
        occurredAt,
        actor: 'Пользователь KLM',
        source: 'Интерфейс KLM',
        materialCode: row.code,
        materialName: row.name,
        quantity: qty,
        fromProject: row.projectKey,
        toProject: to,
        sourceDeficitAfter,
        reason,
      },
    );
  }

  return (
    <div className='panel reservation-panel'>
      <div className='panel-title'>
        <div>
          <span>◫</span>
          <h2>Резервы материалов по проектам</h2>
        </div>
        <button className='primary' onClick={build}>
          Автоматически зарезервировать
        </button>
      </div>
      <div className='notice'>
        <b>Правило:</b>
        <span>
          чужой резерв исключается из свободного остатка. Любой перенос
          требует явного подтверждения и сохраняется отдельной записью
          журнала.
        </span>
      </div>
      {message && <p className='status'>{message}</p>}
      <div className='table-wrap'>
        <table className='reservation-table'>
          <thead>
            <tr>
              <th>Код 1С / материал</th>
              <th>Общий остаток</th>
              <th>Свободный остаток</th>
              <th>Зарезервировано</th>
              <th>Проект</th>
              <th>Дата</th>
              <th>Пользователь / источник</th>
              <th>Дефицит проекта</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const available = availability.find(
                (item) => item.code === row.code,
              );
              const total = available?.stock ?? 0;
              const free = Math.max(
                total - reservedTotal(row.code, rows),
                0,
              );
              const projectAvailable = freeStock(
                row.code,
                total,
                rows,
                row.projectKey,
              );
              const need =
                demands.find(
                  (demand) =>
                    demand.projectKey === row.projectKey &&
                    demand.code === row.code,
                )?.qty ?? 0;
              const deficit = Math.max(need - row.qty, 0);
              return (
                <tr
                  key={`${row.projectKey}|${row.code}|${index}`}
                  className={
                    deficit > 0 ? 'shortage-row' : 'covered-row'
                  }
                >
                  <td>
                    <small>{row.code}</small>
                    <strong>{row.name}</strong>
                  </td>
                  <td>
                    {total.toFixed(3)} {row.unit}
                  </td>
                  <td>
                    {free.toFixed(3)} {row.unit}
                    <small>
                      для проекта доступно {projectAvailable.toFixed(3)}
                    </small>
                  </td>
                  <td>
                    {row.qty.toFixed(3)} {row.unit}
                  </td>
                  <td>
                    <b>{row.projectKey}</b>
                    <small>
                      приоритет {row.priority ?? 'не назначен'}
                    </small>
                  </td>
                  <td>
                    {new Date(row.reservedAt).toLocaleString('ru-RU')}
                  </td>
                  <td>
                    <strong>{row.actor}</strong>
                    <small>{row.source}</small>
                  </td>
                  <td>
                    {deficit > 0 ? (
                      <span className='planning-status shortage'>
                        Дефицит {deficit.toFixed(3)}
                        <small>{row.reason}</small>
                      </span>
                    ) : (
                      <span className='planning-status covered'>
                        Обеспечено
                      </span>
                    )}
                  </td>
                  <td>
                    <button onClick={() => transfer(index)}>
                      Перенести резерв
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
