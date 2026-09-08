"use client";

import { useEffect, useRef } from "react";
import {
  ProjectOrder,
  orderMetrics,
  workflowLabel,
} from "./ProjectCompositionPanel";

export type OrderTransferPreview = {
  supportedRows: number;
  unsupportedRows: number;
  totalQuantity: number;
  groupedElements: number;
};

type CurrentOrdersPanelProps = {
  orders: ProjectOrder[];
  analyzeOrder: (order: ProjectOrder) => OrderTransferPreview;
  onSelectOrder: (order: ProjectOrder) => void;
  onOpenImport: () => void;
  focusedOrderNumber?: string;
};

export default function CurrentOrdersPanel({
  orders,
  analyzeOrder,
  onSelectOrder,
  onOpenImport,
  focusedOrderNumber,
}: CurrentOrdersPanelProps) {
  const focusedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusedOrderNumber)
      focusedRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  }, [focusedOrderNumber]);
  if (!orders.length) {
    return (
      <section className="empty-workspace current-orders-empty">
        <span>Текущих заказов пока нет</span>
        <h2>Загрузите состав заказа из Excel</h2>
        <p>
          После загрузки незавершённые заказы появятся в этой вкладке. Нажатие
          на заказ полностью заменит текущий состав калькулятора.
        </p>
        <button className="primary inline-primary" onClick={onOpenImport}>
          Перейти к загрузке заказов <span>→</span>
        </button>
      </section>
    );
  }

  return (
    <div className="current-orders">
      <div className="notice current-orders-notice">
        <b>Перенос без подтверждения</b>
        <span>
          Нажатие на заказ полностью заменяет текущие позиции калькулятора.
          Строки без подтверждённой формулы не рассчитываются и показываются
          отдельным списком.
        </span>
      </div>

      <section className="panel current-orders-panel">
        <div className="panel-title">
          <div>
            <span>01</span>
            <h2>Все незавершённые заказы</h2>
          </div>
          <small>
            {orders.length} {orders.length === 1 ? "заказ" : "заказов"}
          </small>
        </div>
        <div className="current-order-list">
          {orders.map((order) => {
            const metrics = orderMetrics(order);
            const transfer = analyzeOrder(order);
            const focused = order.number === focusedOrderNumber;
            return (
              <button
                ref={focused ? focusedRef : undefined}
                className={`current-order-card ${focused ? "focused" : ""}`}
                key={order.id}
                onClick={() => onSelectOrder(order)}
              >
                <div className="current-order-title">
                  <div>
                    <small>Заказ на производство</small>
                    <strong>№ {order.number}</strong>
                    <span>от {order.date}</span>
                  </div>
                  <span
                    className={
                      metrics.ready ? "order-state ready" : "order-state work"
                    }
                  >
                    {workflowLabel(order)}
                  </span>
                </div>
                <div className="current-order-metrics">
                  <div>
                    <span>Строк состава</span>
                    <strong>{order.rows.length}</strong>
                  </div>
                  <div>
                    <span>Изделий</span>
                    <strong>{metrics.quantity}</strong>
                  </div>
                  <div>
                    <span>В расчёт</span>
                    <strong>{transfer.supportedRows}</strong>
                    <small>строк / {transfer.groupedElements} групп</small>
                  </div>
                  <div
                    className={transfer.unsupportedRows ? "metric-warning" : ""}
                  >
                    <span>Не сопоставлено</span>
                    <strong>{transfer.unsupportedRows}</strong>
                    <small>будут показаны отдельно</small>
                  </div>
                </div>
                <div className="current-order-footer">
                  <span>{order.specification}</span>
                  <strong>Перенести в калькулятор →</strong>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
