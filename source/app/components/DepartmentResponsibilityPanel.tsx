"use client";

import { useEffect, useMemo, useState } from "react";

type AssignmentHistory = {
  id: string;
  at: string;
  area: string;
  previous: string;
  next: string;
};

type ProjectAssignment = {
  poOwner: string;
  koMode: "order" | "element";
  koOrderOwner: string;
  koElementOwners: Record<string, string>;
  toTechnologyOwner: string;
  toNormsOwner: string;
  toToolingOwner: string;
  history: AssignmentHistory[];
};

type Registry = Record<string, ProjectAssignment>;
type ElementOption = { id: number; label: string };

const storageKey = "klm-project-responsibilities-v1";
const emptyAssignment = (): ProjectAssignment => ({
  poOwner: "",
  koMode: "order",
  koOrderOwner: "",
  koElementOwners: {},
  toTechnologyOwner: "",
  toNormsOwner: "",
  toToolingOwner: "",
  history: [],
});

function PersonSelect({ value, members, onChange, label }: { value: string; members: string[]; onChange: (value: string) => void; label: string }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Не назначен</option>{members.map((member) => <option value={member} key={member}>{member}</option>)}</select></label>;
}

export default function DepartmentResponsibilityPanel({ projectName, elements, projectMembers, designMembers, technologyMembers }: { projectName: string; elements: ElementOption[]; projectMembers: string[]; designMembers: string[]; technologyMembers: string[] }) {
  const projectKey = projectName.trim() || "Проект без наименования";
  const [registry, setRegistry] = useState<Registry>({});
  const [hydrated, setHydrated] = useState(false);
  const assignment = registry[projectKey] ?? emptyAssignment();

  useEffect(() => {
    let savedRegistry: Registry | null = null;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) savedRegistry = JSON.parse(saved) as Registry;
    } catch {}
    queueMicrotask(() => {
      if (savedRegistry) setRegistry(savedRegistry);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify(registry));
  }, [hydrated, registry]);

  const elementLabels = useMemo(() => new Map(elements.map((item) => [String(item.id), item.label])), [elements]);

  function change(field: keyof Omit<ProjectAssignment, "history" | "koElementOwners">, area: string, next: string) {
    setRegistry((current) => {
      const old = current[projectKey] ?? emptyAssignment();
      const previous = String(old[field] ?? "");
      if (previous === next) return current;
      const history: AssignmentHistory = { id: `${Date.now()}-${Math.random()}`, at: new Date().toISOString(), area, previous: previous || "Не назначен", next: next || "Не назначен" };
      return { ...current, [projectKey]: { ...old, [field]: next, history: [history, ...old.history].slice(0, 200) } };
    });
  }

  function changeElementOwner(elementId: string, next: string) {
    setRegistry((current) => {
      const old = current[projectKey] ?? emptyAssignment();
      const previous = old.koElementOwners[elementId] ?? "";
      if (previous === next) return current;
      const area = `КО · ${elementLabels.get(elementId) ?? `элемент ${elementId}`}`;
      const history: AssignmentHistory = { id: `${Date.now()}-${Math.random()}`, at: new Date().toISOString(), area, previous: previous || "Не назначен", next: next || "Не назначен" };
      return { ...current, [projectKey]: { ...old, koElementOwners: { ...old.koElementOwners, [elementId]: next }, history: [history, ...old.history].slice(0, 200) } };
    });
  }

  return <section className="responsibility-panel panel">
    <div className="panel-title"><div><span>04</span><h2>Ответственные по проекту</h2></div><small>история хранится в этом браузере</small></div>
    <div className="responsibility-project"><span>Текущий проект / заказ</span><strong>{projectKey}</strong><small>Для другого заказа загрузите его состав или измените название проекта в калькуляторе.</small></div>
    <div className="responsibility-grid">
      <article><div className="responsibility-head"><span>ПО</span><div><strong>Один ответственный за заказ</strong><small>Смену можно выполнить в любой момент; изменение попадёт в журнал.</small></div></div><PersonSelect label="Ответственный ПО" value={assignment.poOwner} members={projectMembers} onChange={(value) => change("poOwner", "ПО · весь заказ", value)} /></article>
      <article><div className="responsibility-head"><span>КО</span><div><strong>На заказ или поэлементно</strong><small>Режим задаётся отдельно для текущего проекта.</small></div></div><label>Схема назначения<select value={assignment.koMode} onChange={(event) => change("koMode", "КО · схема назначения", event.target.value)}><option value="order">Один конструктор на весь заказ</option><option value="element">Отдельный конструктор на каждый элемент</option></select></label>{assignment.koMode === "order" ? <PersonSelect label="Ответственный КО" value={assignment.koOrderOwner} members={designMembers} onChange={(value) => change("koOrderOwner", "КО · весь заказ", value)} /> : <div className="element-owners">{elements.map((element, index) => <PersonSelect key={element.id} label={`${index + 1}. ${element.label}`} value={assignment.koElementOwners[String(element.id)] ?? ""} members={designMembers} onChange={(value) => changeElementOwner(String(element.id), value)} />)}</div>}</article>
      <article><div className="responsibility-head"><span>ТО</span><div><strong>Раздельно по операциям</strong><small>Технология, нормы и оснастка могут выполняться разными сотрудниками.</small></div></div><PersonSelect label="Технология" value={assignment.toTechnologyOwner} members={technologyMembers} onChange={(value) => change("toTechnologyOwner", "ТО · технология", value)} /><PersonSelect label="Нормы" value={assignment.toNormsOwner} members={technologyMembers} onChange={(value) => change("toNormsOwner", "ТО · нормы", value)} /><PersonSelect label="Оснастка" value={assignment.toToolingOwner} members={technologyMembers} onChange={(value) => change("toToolingOwner", "ТО · оснастка", value)} /></article>
    </div>
    <details className="assignment-history" open={assignment.history.length > 0}><summary>История изменений — {assignment.history.length}</summary>{assignment.history.length ? <div className="table-wrap"><table><thead><tr><th>Дата и время</th><th>Область</th><th>Было</th><th>Стало</th></tr></thead><tbody>{assignment.history.map((item) => <tr key={item.id}><td>{new Date(item.at).toLocaleString("ru-RU")}</td><td>{item.area}</td><td>{item.previous}</td><td><strong>{item.next}</strong></td></tr>)}</tbody></table></div> : <div className="empty">Назначения ещё не изменялись.</div>}</details>
  </section>;
}
