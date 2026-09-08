"use client";

import { useMemo, useState } from "react";
import {
  resolveSectionRule,
  RuleCatalogItem,
  SECTION_RULES_DATE,
  SECTION_RULES_SOURCE,
  SECTION_RULES_VERSION,
} from "../lib/sectionRules";

export type GapCatalogItem = RuleCatalogItem;

export default function CalculationGapsPanel({
  catalog,
}: {
  catalog: GapCatalogItem[];
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<
    "Все" | "Листовые боковины" | "Горизонтальные" | "Вертикальные"
  >("Все");
  const [page, setPage] = useState(1);
  const rows = useMemo(
    () => catalog.map((item) => ({ ...item, rule: resolveSectionRule(item) })),
    [catalog],
  );
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().replace(/ё/g, "е").trim();
    return rows.filter((row) => {
      const modeMatch =
        mode === "Все" ||
        (mode === "Листовые боковины" && row.rule.sheetSidewall) ||
        (mode === "Горизонтальные" && row.rule.horizontalAngle) ||
        (mode === "Вертикальные" && row.rule.verticalAngle);
      return (
        modeMatch &&
        (!normalized ||
          `${row.sourceNumber} ${row.code} ${row.name}`
            .toLowerCase()
            .replace(/ё/g, "е")
            .includes(normalized))
      );
    });
  }, [mode, query, rows]);
  const pageSize = 30;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const sheetCount = rows.filter((row) => row.rule.sheetSidewall).length;
  const horizontalCount = rows.filter((row) => row.rule.horizontalAngle).length;
  const verticalCount = rows.filter((row) => row.rule.verticalAngle).length;

  function chooseMode(value: typeof mode) {
    setMode(value);
    setPage(1);
  }

  function downloadRules() {
    const header = [
      "№",
      "Код",
      "Тип элемента",
      "Формула длины",
      "Боковины",
      "Ориентация",
      "Скотч",
      "Сварка",
    ];
    const body = rows.map((row) => [
      row.sourceNumber,
      row.code,
      row.name,
      row.rule.developedLengthFormula,
      row.rule.sidewallDescription,
      row.rule.orientation,
      row.rule.horizontalAngle ? "Итоговая норма ×2,5" : "Базовая норма",
      row.rule.verticalAngle
        ? "При наличии сварки: +12% один раз на секцию и скотч ×2,5"
        : "Не применяется",
    ]);
    const csv = [header, ...body]
      .map((line) =>
        line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `Правила_расчета_секций_${SECTION_RULES_VERSION}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="calculation-gaps">
      <div className="notice">
        <b>Действующая версия правил: {SECTION_RULES_VERSION}</b>
        <span>
          Источник: {SECTION_RULES_SOURCE} · дата {SECTION_RULES_DATE}. Общая
          формула распространяется на все {catalog.length} типов каталога; при
          новой редакции файла версия и контрольные расчёты должны быть
          обновлены.
        </span>
      </div>
      <div className="composition-kpis gaps-kpis">
        <div className="ok">
          <span>Охвачено правилами</span>
          <strong>{catalog.length}</strong>
          <small>все типы каталога</small>
        </div>
        <div>
          <span>Листовые боковины</span>
          <strong>{sheetCount}</strong>
          <small>2 × АМг3, 2 мм</small>
        </div>
        <div>
          <span>Горизонтальные</span>
          <strong>{horizontalCount}</strong>
          <small>скотч ×2,5</small>
        </div>
        <div>
          <span>Вертикальные</span>
          <strong>{verticalCount}</strong>
          <small>контроль сварки шин</small>
        </div>
      </div>
      <div className="panel rules-summary">
        <div className="panel-title">
          <div>
            <span>01</span>
            <h2>Принятые правила V1.1</h2>
          </div>
          <small>по файлу и вашим уточнениям</small>
        </div>
        <ol>
          <li>
            <strong>Длина переменных ресурсов:</strong> L1 + L2 + L3 для шин
            АД0, крышек, боковин и ПЭТ.
          </li>
          <li>
            <strong>Общие ресурсы:</strong> остальные позиции действующей
            ресурсной спецификации применяются ко всем секциям.
          </li>
          <li>
            <strong>Горизонтальные углы:</strong> итоговая норма
            электроизоляционного скотча увеличивается в 2,5 раза.
          </li>
          <li>
            <strong>Угловые, Z, ZD, ZDP, TP, TD и TR:</strong> две боковины из
            листа АМг3 толщиной 2 мм; ширина каждой — высота шины + 60 мм.
          </li>
          <li>
            <strong>Вертикальный угол со сваркой шин:</strong> скотч ×2,5 и
            надбавка 12% один раз от себестоимости секции до надбавки.
          </li>
          <li>
            <strong>Профиль АП 4976:</strong> код Ц0000077015, складская длина
            5670 мм; потребность и списание ведутся в погонных метрах.
          </li>
        </ol>
      </div>
      <div className="panel rules-summary">
        <div className="panel-title">
          <div>
            <span>!</span>
            <h2>Что пока затрудняет нормальную потребность</h2>
          </div>
          <small>расчёт нормы продолжается, код помечается отдельно</small>
        </div>
        <ol>
          <li><strong>Шина АД0 6×40×3000:</strong> единственное используемое сечение без точного совпадения в полном справочнике 1С. Коды для 6×30, 6×50, 6×65, 6×100, 6×130, 6×160 и 6×200 подтверждены.</li>
          <li><strong>Листовые детали остальных фасонных секций:</strong> при отсутствии отдельной КД масса рассчитывается по геометрическому правилу V1.1 и плотности АМг3 2700 кг/м³. Для CD и CP контрольная масса взята непосредственно из КД.</li>
        </ol>
      </div>
      <div className="panel rules-summary">
        <div className="panel-title">
          <div>
            <span>КД</span>
            <h2>Чертежи CD, учтённые в расчёте</h2>
          </div>
          <small>комплект 132.10.CD.001</small>
        </div>
        <ol>
          <li><strong>Сборка:</strong> 132.10.CD.001.000 — горизонтальный угол 435×435 мм, 1000 А, масса сборки 7,5 кг.</li>
          <li><strong>Шины:</strong> .001, .002, .003 и .004 — АД0 6×100; длины развёрток 726,7 / 709,2 / 695,2 / 684,7 мм, суммарная масса 4,5 кг.</li>
          <li><strong>Боковины:</strong> .005 и .006 — АМг3 2 мм, суммарная масса 0,9 кг.</li>
          <li><strong>Крышки:</strong> .007 и .010 — АМг3 3 мм, суммарная масса 1,4 кг.</li>
          <li><strong>Крепёж:</strong> М6×12 — 16 шт., М6×16 — 16 шт., гайка М6 — 16 шт.; ухо PE и вставка — по 4 шт.</li>
        </ol>
        <div className="reference-files">
          <a href="/references/cd/132.10.CD.001.000.pdf" target="_blank" rel="noreferrer">Сборочный чертёж PDF</a>
          <a href="/references/cd/132.10.CD.001.000-spec.xlsx" download>Спецификация XLSX</a>
          {["001", "002", "003", "004", "005", "006", "007", "010"].map((number) => (
            <span key={number}>
              {number}: <a href={`/references/cd/132.10.CD.001.${number}.pdf`} target="_blank" rel="noreferrer">PDF</a>{" · "}
              <a href={`/references/cd/132.10.CD.001.${number}.dxf`} download>DXF</a>
            </span>
          ))}
        </div>
      </div>
      <div className="panel rules-summary">
        <div className="panel-title">
          <div>
            <span>КД</span>
            <h2>Чертежи CP, учтённые в расчёте</h2>
          </div>
          <small>информационное основание</small>
        </div>
        <ol>
          <li><strong>Сборка:</strong> 132.10.CP.001.000 и исполнения 100, 200, 300, 400.</li>
          <li><strong>Боковины:</strong> 132.10.CP.001.001 и .002 — две детали АМг3 2 мм, суммарно 0,92 кг для CP 1000 А.</li>
          <li><strong>Крышки:</strong> 132.10.CP.001.003 и .004 — две детали АМг3 3 мм, суммарно 1,47 кг.</li>
          <li><strong>Шины и крепёж:</strong> четыре шины общей массой 4,74 кг; М6×12 — 16 шт., М6×16 — 16 шт.</li>
          <li><strong>Вставка:</strong> 03.045.013, код Ц0000078870, 28×15×133,4 мм — 4 шт.</li>
        </ol>
      </div>
      <div className="panel gaps-panel">
        <div className="panel-title">
          <div>
            <span>02</span>
            <h2>Применение правил по типам</h2>
          </div>
          <div className="panel-title-actions">
            <small>{filtered.length} строк</small>
            <button className="mini-add" type="button" onClick={downloadRules}>
              Скачать список
            </button>
          </div>
        </div>
        <div className="gaps-toolbar">
          <div className="filter-group">
            {(
              [
                "Все",
                "Листовые боковины",
                "Горизонтальные",
                "Вертикальные",
              ] as const
            ).map((item) => (
              <button
                key={item}
                className={mode === item ? "active" : ""}
                onClick={() => chooseMode(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Поиск по номеру, коду или названию"
            aria-label="Поиск по правилам секций"
          />
        </div>
        <div className="table-wrap gaps-table-wrap">
          <table className="gaps-table">
            <thead>
              <tr>
                <th>№ / код</th>
                <th>Тип элемента</th>
                <th>Геометрия и боковины</th>
                <th>Надбавки</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>№ {row.sourceNumber}</strong>
                    <small>{row.code || "Код не указан"}</small>
                  </td>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>
                    <strong>{row.rule.developedLengthFormula}</strong>
                    <small>{row.rule.sidewallDescription}</small>
                  </td>
                  <td>
                    {row.rule.horizontalAngle
                      ? "Горизонтальный угол: скотч ×2,5. "
                      : ""}
                    {row.rule.verticalAngle
                      ? "При сварке шин: скотч ×2,5 и +12% один раз."
                      : "Без специальной надбавки."}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <button
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            ← Назад
          </button>
          <span>
            Страница {currentPage} из {pages}
          </span>
          <button
            disabled={currentPage >= pages}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
          >
            Далее →
          </button>
        </div>
      </div>
    </div>
  );
}
