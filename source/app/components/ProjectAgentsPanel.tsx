import type { ProjectAuditReport } from "../lib/projectAgents";

const statusLabel = { passed: "Проверено", review: "Требуется проверка", blocked: "Заблокировано" } as const;
const severityLabel = { info: "Информация", warning: "Предупреждение", blocker: "Блокировка" } as const;

export default function ProjectAgentsPanel({ report }: { report: ProjectAuditReport }) {
  const findings = report.agents.slice(0, 3).flatMap((agent) => agent.findings.map((item) => ({ ...item, agent: agent.title })));
  return (
    <section className={`panel project-agents agents-${report.status}`}>
      <div className="panel-title">
        <div><span>AI</span><h2>Агенты контроля проекта</h2></div>
        <small>Только чтение · {statusLabel[report.status]}</small>
      </div>
      <div className="agent-summary">
        {report.agents.map((agent) => (
          <article key={agent.id} className={`agent-card agent-${agent.status}`}>
            <small>{agent.mode === "read-only" ? "ТОЛЬКО ПРОВЕРКА" : agent.mode}</small>
            <strong>{agent.title}</strong>
            <span>{statusLabel[agent.status]}</span>
            <b>{agent.findings.length} замечаний</b>
          </article>
        ))}
      </div>
      <div className="agent-totals">
        <span>Блокировки: <b>{report.summary.blockers}</b></span>
        <span>Предупреждения: <b>{report.summary.warnings}</b></span>
        <span>Информация: <b>{report.summary.information}</b></span>
      </div>
      {findings.length > 0 && (
        <details className="transfer-details agent-details" open={report.status === "blocked"}>
          <summary>Единый журнал замечаний — {findings.length}</summary>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Уровень</th><th>Агент / источник</th><th>Строка</th><th>Артикул</th><th>Замечание</th></tr></thead>
              <tbody>{findings.map((item, index) => (
                <tr key={`${item.agent}-${item.rowNumber}-${index}`}>
                  <td><span className={`agent-severity severity-${item.severity}`}>{severityLabel[item.severity]}</span></td>
                  <td><strong>{item.agent}</strong><small>{item.source}</small></td>
                  <td>{item.rowNumber}</td><td>{item.article || "—"}</td><td>{item.message}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      )}
      <p className="agent-readonly-note">Агенты не изменяют заказ, КД, расчёт, справочники или базу данных. Исправления выполняются только после решения пользователя.</p>
    </section>
  );
}
