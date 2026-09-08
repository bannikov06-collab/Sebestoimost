'use client';

type ProjectOption={key:string;label:string;orderNumber:string;projectName:string};
type Props={projects:ProjectOption[];selected:string[];onChange:(keys:string[])=>void};
export default function MultiProjectSelector({projects,selected,onChange}:Props){
 const toggle=(key:string)=>onChange(selected.includes(key)?selected.filter(x=>x!==key):[...selected,key]);
 return <section className='panel multi-project-selector'>
  <div className='panel-title'><div><span>Σ</span><h2>Совместный расчёт проектов</h2></div><small>{selected.length} выбрано</small></div>
  <p className='muted'>Выберите несколько заказов на производство. Потребность ниже будет объединена по всем выбранным проектам.</p>
  <div className='multi-project-grid'>{projects.map(p=><label key={p.key}><input type='checkbox' checked={selected.includes(p.key)} onChange={()=>toggle(p.key)}/><span><b>{p.orderNumber}</b><small>{p.projectName}</small></span></label>)}</div>
  <div className='commercial-actions'><button onClick={()=>onChange(projects.map(p=>p.key))}>Выбрать все</button><button onClick={()=>onChange([])}>Снять выбор</button></div>
 </section>;
}
