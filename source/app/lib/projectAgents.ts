export type IpExecution = "IP55" | "IP68" | "unknown" | "conflict";
export type AuditSeverity = "info" | "warning" | "blocker";
export type AuditStatus = "passed" | "review" | "blocked";

export type AuditedOrderRow = {
  rowNumber?: string;
  item?: string;
  article?: string;
  quantity?: number;
  unit?: string;
  drawingNumber?: string;
  version?: string;
};

export type AuditFinding = {
  severity: AuditSeverity;
  source: string;
  rowNumber: string;
  article: string;
  message: string;
  confidence: "high" | "medium" | "low";
};

export type AgentReport = {
  id: "specification" | "materials" | "drawings" | "project";
  title: string;
  mode: "read-only";
  status: AuditStatus;
  findings: AuditFinding[];
};

export type ProjectAuditReport = {
  mode: "read-only";
  status: AuditStatus;
  generatedAt: string;
  agents: AgentReport[];
  summary: {
    blockers: number;
    warnings: number;
    information: number;
  };
};

const normalized = (...values: unknown[]) => values
  .map((value) => String(value ?? "").toUpperCase().replace(/Ё/g, "Е"))
  .join(" ")
  .replace(/[–—]/g, "-");

const containsExecution = (text: string, value: "55" | "68") => {
  const pattern = new RegExp(`(?:^|[^0-9])(?:IP[\\s_-]*)?${value}(?:[^0-9]|$)`, "i");
  return pattern.test(text);
};

export function detectIpExecution(...values: unknown[]): IpExecution {
  const text = normalized(...values);
  const has55 = containsExecution(text, "55");
  const has68 = containsExecution(text, "68");
  if (has55 && has68) return "conflict";
  if (has55) return "IP55";
  if (has68) return "IP68";
  return "unknown";
}

export function executionBlockReason(execution: IpExecution) {
  if (execution === "IP55" || execution === "IP68") return "";
  if (execution === "conflict") return "Конфликт IP55/IP68: расчёт запрещён до уточнения исполнения";
  return "Исполнение IP не распознано: запрещено автоматически применять правила IP55";
}

const finding = (
  severity: AuditSeverity,
  source: string,
  row: AuditedOrderRow,
  message: string,
  confidence: AuditFinding["confidence"] = "high",
): AuditFinding => ({
  severity,
  source,
  rowNumber: String(row.rowNumber ?? "—"),
  article: String(row.article ?? ""),
  message,
  confidence,
});

const statusFor = (findings: AuditFinding[]): AuditStatus => {
  if (findings.some((item) => item.severity === "blocker")) return "blocked";
  if (findings.some((item) => item.severity === "warning")) return "review";
  return "passed";
};

function specificationAgent(rows: AuditedOrderRow[]): AgentReport {
  const findings: AuditFinding[] = [];
  for (const row of rows) {
    const execution = detectIpExecution(row.article, row.item);
    const reason = executionBlockReason(execution);
    if (reason) findings.push(finding("blocker", "Артикул / наименование", row, reason));
    if (!String(row.article ?? "").trim()) findings.push(finding("blocker", "Артикул", row, "Артикул не заполнен"));
    if (!(Number(row.quantity) > 0)) findings.push(finding("blocker", "Количество", row, "Количество должно быть больше нуля"));
    if (!String(row.unit ?? "").trim()) findings.push(finding("warning", "Единица измерения", row, "Единица измерения не заполнена"));
    const article = normalized(row.article);
    if (!/(?:^|-)AL(?:-|$)|(?:^|-)CU(?:-|$)/.test(article)) findings.push(finding("warning", "Артикул", row, "Материал шин Al/Cu не распознан", "medium"));
    if (!/(?:^|-)4(?:P)?(?:-|$)|(?:^|-)5(?:P)?(?:-|$)/.test(article)) findings.push(finding("warning", "Артикул", row, "Количество проводников 4P/5P не распознано", "medium"));
  }
  return { id: "specification", title: "Разбор спецификации", mode: "read-only", status: statusFor(findings), findings };
}

function materialsAgent(rows: AuditedOrderRow[], unsupportedRows: Array<{ rowNumber?: string; article?: string; reason?: string }>, defaultedRows: Array<{ rowNumber?: string; article?: string; dimensions?: string[] }>): AgentReport {
  const findings: AuditFinding[] = [];
  for (const row of rows) {
    if (!(Number(row.quantity) > 0)) findings.push(finding("blocker", "Количество заказа", row, "Строка не может участвовать в потребности материалов"));
  }
  for (const row of unsupportedRows) {
    findings.push(finding("blocker", "Расчётный контур", row, String(row.reason ?? "Строка исключена из расчёта")));
  }
  for (const row of defaultedRows) {
    findings.push(finding("warning", "Правило типовых размеров", row, `Подставлены размеры: ${(row.dimensions ?? []).join(", ")}`, "high"));
  }
  if (!findings.length) {
    findings.push(finding("info", "Расчётный контур", {}, "Количество строк заказа передано без блокирующих расхождений"));
  }
  return { id: "materials", title: "Проверка материалов", mode: "read-only", status: statusFor(findings), findings };
}

function drawingsAgent(rows: AuditedOrderRow[]): AgentReport {
  const findings: AuditFinding[] = [];
  for (const row of rows) {
    if (!String(row.drawingNumber ?? "").trim()) findings.push(finding("blocker", "Номер чертежа", row, "Номер чертежа не заполнен: запуск в производство запрещён"));
    if (!String(row.version ?? "").trim()) findings.push(finding("warning", "Версия КД", row, "Версия КД не указана", "medium"));
  }
  if (!findings.length) findings.push(finding("info", "КД", {}, "Номера чертежей и версии заполнены; геометрия PDF/DXF автоматически не подтверждалась"));
  return { id: "drawings", title: "Сверка КД", mode: "read-only", status: statusFor(findings), findings };
}

export function runReadOnlyProjectAgents(
  rows: AuditedOrderRow[],
  transfer: {
    unsupportedRows?: Array<{ rowNumber?: string; article?: string; reason?: string }>;
    defaultedRows?: Array<{ rowNumber?: string; article?: string; dimensions?: string[] }>;
  } = {},
  generatedAt = new Date().toISOString(),
): ProjectAuditReport {
  const agents = [
    specificationAgent(rows),
    materialsAgent(rows, transfer.unsupportedRows ?? [], transfer.defaultedRows ?? []),
    drawingsAgent(rows),
  ];
  const sourceFindings = agents.flatMap((agent) => agent.findings);
  const summary = {
    blockers: sourceFindings.filter((item) => item.severity === "blocker").length,
    warnings: sourceFindings.filter((item) => item.severity === "warning").length,
    information: sourceFindings.filter((item) => item.severity === "info").length,
  };
  const projectStatus: AuditStatus = summary.blockers ? "blocked" : summary.warnings ? "review" : "passed";
  const projectFinding: AuditFinding = finding(
    projectStatus === "blocked" ? "blocker" : projectStatus === "review" ? "warning" : "info",
    "Свод трёх агентов",
    {},
    projectStatus === "blocked"
      ? `Проект заблокирован: ${summary.blockers} блокирующих расхождений`
      : projectStatus === "review"
        ? `Требуется проверка: ${summary.warnings} предупреждений`
        : "Блокирующих расхождений не найдено",
  );
  agents.push({ id: "project", title: "Комплексная проверка проекта", mode: "read-only", status: projectStatus, findings: [projectFinding] });
  return { mode: "read-only", status: projectStatus, generatedAt, agents, summary };
}
