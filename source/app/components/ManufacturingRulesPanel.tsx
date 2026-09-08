"use client";

import { currents } from "../lib/calculation";
import { calculatePeEarBlank, getJointRule, jointRules } from "../lib/manufacturingRules";

const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

export default function ManufacturingRulesPanel() {
  return <div className="manufacturing-rules">
    <section className="panel">
      <div className="panel-title"><div><span>КД</span><h2>Ухо PE — изготавливаемая деталь</h2></div><small>чертёж 260.045</small></div>
      <div className="notice ok-notice"><b>Код 1С исключён</b><span>Ухо PE учитывается как изготовление из листа АМг3 2,0 мм. Исполнение выбирается по номинальному току и подтверждённой высоте L.</span></div>
      <div className="table-wrap"><table className="rules-source-table"><thead><tr><th>Ток</th><th>Шина</th><th>Исполнение</th><th>L</th><th>Заготовка на 1 шт.</th><th>На секцию</th></tr></thead><tbody>{currents.map((current) => {
        const ear = calculatePeEarBlank(current);
        return <tr key={current}><td><b>{current} А</b></td><td>{current <= 400 ? "1×30×6" : current === 500 ? "1×40×6" : current === 630 ? "1×50×6" : current === 800 ? "1×65×6" : current === 1000 ? "1×100×6" : current === 1250 ? "1×130×6" : current === 1600 ? "1×160×6" : current === 2000 ? "1×200×6" : current === 2500 ? "2×130×6" : current === 3200 ? "2×160×6" : current === 4000 ? "2×200×6" : current === 5000 ? "4×130×6" : "4×160×6"}</td><td>{ear?.designation ?? "—"}</td><td>{ear ? `${ear.lengthMm} мм` : "—"}</td><td>{ear ? `${number.format(ear.onePieceKg)} кг` : "—"}</td><td>{ear ? `4 шт. · ${number.format(ear.totalKg)} кг` : "—"}</td></tr>;
      })}</tbody></table></div>
      <p>Масса материала рассчитана по прямоугольной развёртке 113,52×L×2 мм с плотностью 2700 кг/м³. Отверстия не вычитаются, отход раскроя не добавляется.</p>
      <div className="reference-files"><a href="/references/rules/260.045.pdf" target="_blank">Открыть чертёж 260.045</a></div>
    </section>

    <section className="panel">
      <div className="panel-title"><div><span>G</span><h2>Стыковочные элементы IP55, 4P, шина 6/7 мм</h2></div><small>КД + Excel-состав</small></div>
      <div className="notice ok-notice"><b>Толщина подтверждена</b><span>Все загруженные исполнения стыков применимы для шин толщиной 6 и 7 мм. Указания 6/7 мм в наименованиях Excel не считаются противоречием.</span></div>
      <div className="table-wrap"><table className="rules-source-table"><thead><tr><th>Ток</th><th>Сборка</th><th>Соединитель</th><th>Шина</th><th>Высота</th><th>Масса сборки</th><th>Позиций состава</th></tr></thead><tbody>{jointRules.map((rule) => <tr key={rule.currentA}><td><b>{rule.currentA} А</b></td><td>{rule.designation}</td><td>{rule.connectorDesignation}</td><td>{rule.supportedBusbarThicknessMm.join("/")} мм</td><td>{rule.heightMm} мм</td><td>{number.format(rule.totalMassKg)} кг</td><td>{rule.components.length}</td></tr>)}</tbody></table></div>
      <details className="transfer-details"><summary>Показать полный состав выбранных стыков</summary><div className="joint-rule-cards">{jointRules.map((rule) => <article key={rule.currentA}><h3>{rule.currentA} А · {rule.designation}</h3><div className="table-wrap"><table><thead><tr><th>Обозначение</th><th>Наименование</th><th>Материал</th><th>Кол-во</th><th>Источник</th></tr></thead><tbody>{rule.components.map((item, index) => <tr key={`${item.designation}-${item.name}-${index}`}><td>{item.designation || "—"}</td><td>{item.name}</td><td>{item.material || "—"}</td><td>{item.quantity}</td><td>{item.source}</td></tr>)}</tbody></table></div></article>)}</div></details>
      {!getJointRule(500) && <div className="notice warn-notice"><b>500 А не назначен</b><span>Исполнение уха PE L=79 мм подтверждено чертежом 260.045, но отдельного листа G и Excel-состава стыка 500 А в загруженном комплекте нет.</span></div>}
      <div className="notice warn-notice"><b>Коды и цены стыков</b><span>Коды 1С для позиций состава в доступной базе не найдены. До загрузки кодов и прайса позиции сохраняются по обозначению и наименованию, без автоматически назначенной стоимости.</span></div>
      <div className="reference-files"><a href="/references/rules/G.001.000-IP55-4P.pdf" target="_blank">Сборочные чертежи G.001.000</a><a href="/references/rules/G.001.000-components.xlsx">Excel-состав G.001.000–11</a></div>
    </section>
  </div>;
}
