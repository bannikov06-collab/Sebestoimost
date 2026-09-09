export type PeEarRule = {
  currentA: number;
  designation: string;
  lengthMm: number;
  quantityPerSection: number;
};

export type JointComponent = {
  designation: string;
  name: string;
  material: string;
  quantity: number;
  unit?: "шт" | "м" | "кг";
  source: "КД" | "Excel" | "КД + Excel" | "Правило";
  costable?: boolean;
};

export type JointRule = {
  currentA: number;
  designation: string;
  connectorDesignation: string;
  busbarThicknessMm: 6 | 7 | null;
  supportedBusbarThicknessMm: readonly [6, 7];
  mainBusSection: string;
  connectorHeightMm: number;
  heightMm: number;
  totalMassKg: number;
  connectorMassKg: number;
  busbarDesignation: string;
  busbarLengthMm: number;
  insulatorDesignation: string;
  components: JointComponent[];
};

export type JointDemandRow = {
  id: string;
  rowNumber: string;
  article: string;
  item: string;
  quantity: number;
  currentA: number;
  poles: 4 | 5;
  ip: "IP55" | "IP68";
  busbarThicknessMm: 6 | 7 | null;
  source: "production" | "preliminary" | "manual";
  dimensionsMm: readonly [0, 0, 0];
  recognitionStatus: "confirmed" | "missing-current";
};

export type JointMaterialLine = {
  code: string;
  designation: string;
  name: string;
  unit: "шт" | "м" | "кг";
  qty: number;
  group: string;
  basis: string;
  confidence: "Подтверждено" | "Расчётно" | "Требует уточнения";
};

export const PE_EAR_SOURCE = "260.045.pdf";
export const JOINT_DRAWING_SOURCE = "G.001.000-IP55-4P.pdf";
export const JOINT_CONNECTOR_SOURCE = "012.001.000(Соединитель G-IP55, Шина 6 мм, 4P).PDF";
export const JOINT_COMPOSITION_SOURCE = "G.001.000-components.xlsx";
export const JOINT_BUSBAR_SOURCE = "583.001.PDF";
export const GASKETING_DRAWING_SOURCE = "01.312.012.pdf";
export const PRODUCTION_NORMS_SOURCE = "ВЕДОМОСТЬ_ПРОИЗВОДСТВЕННЫХ_РАБОТ от 01.08.2026.xlsx";

export const PE_EAR_BLANK_WIDTH_MM = 113.52;
export const PE_EAR_THICKNESS_MM = 2;
export const AMG3_DENSITY_KG_M3 = 2700;

// Утвержденное пользователем правило после расчетов и испытаний.
export const BUSWAY_BUS_SECTION_BY_THICKNESS = {
  6: { thicknessMm: 6, widthMm: 65, label: "6×65" },
  7: { thicknessMm: 7, widthMm: 75, label: "7×75" },
} as const;

// 01.312.012СБ: размерный контур Gasketing на крышке.
// Длина вычисляется из геометрии чертежа, а не задается количеством "1" из спецификации.
export const GASKETING_RULE = {
  componentACode: "Ц0000060428",
  componentBCode: "Ц0000057680",
  ratioA: 100,
  ratioB: 20,
  gramsPerMeter: 20,
  contourWidthMm: 208,
  contourHeightMm: 93,
  coversPerJoint: 2,
  source: GASKETING_DRAWING_SOURCE,
} as const;

export function calculateGasketingForCover(widthMm = GASKETING_RULE.contourWidthMm, heightMm = GASKETING_RULE.contourHeightMm) {
  const lengthM = (2 * (Math.max(0, widthMm) + Math.max(0, heightMm))) / 1000;
  const totalGrams = lengthM * GASKETING_RULE.gramsPerMeter;
  const ratioTotal = GASKETING_RULE.ratioA + GASKETING_RULE.ratioB;
  return {
    widthMm,
    heightMm,
    lengthM,
    totalGrams,
    componentAGrams: totalGrams * GASKETING_RULE.ratioA / ratioTotal,
    componentBGrams: totalGrams * GASKETING_RULE.ratioB / ratioTotal,
    basis: `геометрия КД ${widthMm}×${heightMm} мм; расход ${GASKETING_RULE.gramsPerMeter} г/м; А:Б=${GASKETING_RULE.ratioA}:${GASKETING_RULE.ratioB}`,
  };
}

export function calculateGasketingForJoint(jointQuantity = 1) {
  const oneCover = calculateGasketingForCover();
  const covers = Math.max(0, jointQuantity) * GASKETING_RULE.coversPerJoint;
  return {
    ...oneCover,
    covers,
    lengthM: oneCover.lengthM * covers,
    totalGrams: oneCover.totalGrams * covers,
    componentAGrams: oneCover.componentAGrams * covers,
    componentBGrams: oneCover.componentBGrams * covers,
  };
}

const peEarByCurrent: Record<number, Omit<PeEarRule, "currentA" | "quantityPerSection">> = {
  160:{designation:"260.045-20",lengthMm:69},250:{designation:"260.045-20",lengthMm:69},315:{designation:"260.045-20",lengthMm:69},400:{designation:"260.045-20",lengthMm:69},
  500:{designation:"260.045-21",lengthMm:79},630:{designation:"260.045",lengthMm:89},800:{designation:"260.045-01",lengthMm:104},1000:{designation:"260.045-04",lengthMm:139},
  1250:{designation:"260.045-05",lengthMm:169},1600:{designation:"260.045-06",lengthMm:199},2000:{designation:"260.045-08",lengthMm:239},2500:{designation:"260.045-10",lengthMm:348},
  3200:{designation:"260.045-11",lengthMm:408},4000:{designation:"260.045-13",lengthMm:488},5000:{designation:"260.045-15",lengthMm:706},6300:{designation:"260.045-16",lengthMm:826},
};

export function getPeEarRule(currentA: number): PeEarRule | undefined {
  const rule = peEarByCurrent[currentA];
  return rule ? { currentA, ...rule, quantityPerSection: 4 } : undefined;
}

export function calculatePeEarBlank(currentA: number, quantity = 4) {
  const rule = getPeEarRule(currentA);
  if (!rule) return undefined;
  const onePieceKg = PE_EAR_BLANK_WIDTH_MM / 1000 * rule.lengthMm / 1000 * PE_EAR_THICKNESS_MM / 1000 * AMG3_DENSITY_KG_M3;
  return {
    ...rule, quantity, onePieceKg, totalKg: onePieceKg * quantity,
    materialCode: "Ц0000069668",
    materialName: "Лист АМг3 2,0 мм",
    productionBasis: "собственное производство: материал + операции по ведомости производственных работ",
    confidence: "Расчётно" as const,
    basis: `масса прямоугольной заготовки ${PE_EAR_BLANK_WIDTH_MM}×${rule.lengthMm}×${PE_EAR_THICKNESS_MM} мм; готового кода 1С для уха PE нет`,
  };
}

type JointSeed = {
  currentA: number; suffix: string; connectorHeightMm: number; totalMassKg: number; connectorMassKg: number;
  springQty: number; bushingQty: number; busbarDesignation: string; busbarLengthMm: number;
  insulatorDesignation: string; insulatorName?: string;
};

// Состав строго по 012.001.000СБ и G.001.000СБ. Стык не добавляется к секции автоматически.
const jointSeeds: JointSeed[] = [
  {currentA:400,suffix:"",connectorHeightMm:69,totalMassKg:1.8,connectorMassKg:1.0,springQty:2,bushingQty:1,busbarDesignation:"583.001",busbarLengthMm:30,insulatorDesignation:"781.005",insulatorName:"Изолятор-IP55-4P/5P"},
  {currentA:630,suffix:"-01",connectorHeightMm:89,totalMassKg:2.1,connectorMassKg:1.3,springQty:2,bushingQty:1,busbarDesignation:"583.001-12",busbarLengthMm:50,insulatorDesignation:"781.005-03",insulatorName:"Изолятор-IP55-4P/5P 630A"},
  // Для 800 А сборочная КД 012.001.000-02СБ требует 583.001-01; это намеренно, несмотря на историческое обозначение детали.
  {currentA:800,suffix:"-02",connectorHeightMm:104,totalMassKg:2.4,connectorMassKg:1.6,springQty:2,bushingQty:1,busbarDesignation:"583.001-01",busbarLengthMm:65,insulatorDesignation:"06A.G.01"},
  {currentA:1000,suffix:"-03",connectorHeightMm:139,totalMassKg:3.0,connectorMassKg:2.2,springQty:2,bushingQty:1,busbarDesignation:"583.001-03",busbarLengthMm:100,insulatorDesignation:"10A.G.01"},
  {currentA:1250,suffix:"-04",connectorHeightMm:169,totalMassKg:3.7,connectorMassKg:2.9,springQty:4,bushingQty:2,busbarDesignation:"583.001-04",busbarLengthMm:130,insulatorDesignation:"12A.G.01"},
  {currentA:1600,suffix:"-05",connectorHeightMm:199,totalMassKg:4.2,connectorMassKg:3.4,springQty:4,bushingQty:2,busbarDesignation:"583.001-05",busbarLengthMm:160,insulatorDesignation:"16A.G.01"},
  {currentA:2000,suffix:"-06",connectorHeightMm:239,totalMassKg:5.1,connectorMassKg:4.3,springQty:6,bushingQty:3,busbarDesignation:"583.001-06",busbarLengthMm:200,insulatorDesignation:"1S.20A.G.01"},
  {currentA:2500,suffix:"-07",connectorHeightMm:348,totalMassKg:7.1,connectorMassKg:6.3,springQty:8,bushingQty:4,busbarDesignation:"583.001-07",busbarLengthMm:310,insulatorDesignation:"25A.G.01"},
  {currentA:3200,suffix:"-08",connectorHeightMm:408,totalMassKg:8.0,connectorMassKg:7.2,springQty:8,bushingQty:4,busbarDesignation:"583.001-08",busbarLengthMm:370,insulatorDesignation:"1S.32A.G.01"},
  {currentA:4000,suffix:"-09",connectorHeightMm:488,totalMassKg:9.8,connectorMassKg:9.0,springQty:12,bushingQty:6,busbarDesignation:"583.001-09",busbarLengthMm:450,insulatorDesignation:"V.40Al.G.01.05"},
  {currentA:5000,suffix:"-10",connectorHeightMm:706,totalMassKg:13.5,connectorMassKg:12.7,springQty:16,bushingQty:8,busbarDesignation:"583.001-10",busbarLengthMm:670,insulatorDesignation:"781.005-01",insulatorName:"Изолятор-IP55-4P/5P 5000A"},
  {currentA:6300,suffix:"-11",connectorHeightMm:826,totalMassKg:15.3,connectorMassKg:14.5,springQty:16,bushingQty:8,busbarDesignation:"583.001-11",busbarLengthMm:790,insulatorDesignation:"781.005-02",insulatorName:"Изолятор-IP55-4P/5P 6300A"},
];

function buildJointRule(seed: JointSeed): JointRule {
  const suffix=seed.suffix;
  const connectorDesignation=`012.001.000${suffix}`;
  const designation=`G.001.000${suffix}`;
  const components: JointComponent[] = [
    {designation:"03.312.012",name:"Крышка стыка",material:"по КД 01.312.012СБ",quantity:2,unit:"шт",source:"КД",costable:true},
    {designation:seed.busbarDesignation,name:`Шина стыка G ${seed.currentA}А IP55`,material:"Шина АД0 3,5×70 ГОСТ 15176-89",quantity:10,unit:"шт",source:"КД",costable:true},
    {designation:"03.212.001-03",name:"Втулка",material:"по КД",quantity:seed.bushingQty,unit:"шт",source:"КД",costable:true},
    {designation:seed.insulatorDesignation,name:seed.insulatorName??"Изолятор",material:"по КД",quantity:5,unit:"шт",source:"КД",costable:true},
    {designation:`195.001${suffix}`,name:`Прижимной профиль стыка G ${seed.currentA}А IP55`,material:"АП 5786",quantity:1,unit:"шт",source:"КД",costable:true},
    {designation:`195.002${suffix}`,name:`Прижимной профиль стыка G ${seed.currentA}А IP55`,material:"АП 5785",quantity:1,unit:"шт",source:"КД",costable:true},
    {designation:"",name:"Болт DIN 933-M12×130-8.8",material:"",quantity:seed.bushingQty,unit:"шт",source:"КД",costable:true},
    {designation:"",name:"Гайка DIN 985-M12-8.8",material:"",quantity:seed.bushingQty,unit:"шт",source:"КД",costable:true},
    {designation:"",name:"Пружина тарельчатая 60,0×13,0×5,0×1,5",material:"",quantity:seed.springQty,unit:"шт",source:"КД",costable:true},
    {designation:"",name:"Болт DIN 6921-M6×12-8.8",material:"",quantity:8,unit:"шт",source:"КД",costable:true},
    {designation:"GASKETING-A",name:"Gasketing компонент А",material:GASKETING_RULE.componentACode,quantity:0,unit:"кг",source:"Правило",costable:true},
    {designation:"GASKETING-B",name:"Gasketing компонент Б",material:GASKETING_RULE.componentBCode,quantity:0,unit:"кг",source:"Правило",costable:true},
  ];
  return {currentA:seed.currentA,designation,connectorDesignation,busbarThicknessMm:null,supportedBusbarThicknessMm:[6,7],mainBusSection:"6×65 / 7×75 по спецификации",connectorHeightMm:seed.connectorHeightMm,heightMm:seed.connectorHeightMm,totalMassKg:seed.totalMassKg,connectorMassKg:seed.connectorMassKg,busbarDesignation:seed.busbarDesignation,busbarLengthMm:seed.busbarLengthMm,insulatorDesignation:seed.insulatorDesignation,components};
}

export const jointRules=jointSeeds.map(buildJointRule);
export function getJointRule(currentA:number){return jointRules.find((rule)=>rule.currentA===currentA);}

const currentBySuffix: Record<string, number> = {"":400,"01":630,"02":800,"03":1000,"04":1250,"05":1600,"06":2000,"07":2500,"08":3200,"09":4000,"10":5000,"11":6300};
const currentByArticleToken: Record<string, number> = {"02":250,"03":315,"04":400,"05":500,"06":630,"08":800,"10":1000,"12":1250,"16":1600,"20":2000,"25":2500,"32":3200,"40":4000,"50":5000,"63":6300};

type Ip68JointSeed = { currentA:number; suffix:string; bushingQty:number; insulatorDesignation:string; insulatorQty:number };
const ip68JointSeeds: Ip68JointSeed[] = [
  {currentA:630,suffix:"",bushingQty:1,insulatorDesignation:"06A.G.01",insulatorQty:7},
  {currentA:800,suffix:"-01",bushingQty:1,insulatorDesignation:"06A.G.01",insulatorQty:6},
  {currentA:1000,suffix:"-02",bushingQty:1,insulatorDesignation:"10A.G.01",insulatorQty:6},
  {currentA:1250,suffix:"-03",bushingQty:2,insulatorDesignation:"12A.G.01",insulatorQty:6},
  {currentA:1600,suffix:"-04",bushingQty:2,insulatorDesignation:"16A.G.01",insulatorQty:6},
  {currentA:2000,suffix:"-05",bushingQty:3,insulatorDesignation:"1S.20A.G.01",insulatorQty:6},
  {currentA:2500,suffix:"-06",bushingQty:4,insulatorDesignation:"25A.G.01",insulatorQty:6},
  {currentA:3200,suffix:"-07",bushingQty:4,insulatorDesignation:"1S.32A.G.01",insulatorQty:6},
  {currentA:4000,suffix:"-08",bushingQty:6,insulatorDesignation:"V.40Al.G.01.05",insulatorQty:6},
  {currentA:5000,suffix:"-09",bushingQty:8,insulatorDesignation:"781.006",insulatorQty:6},
];
const ip68CurrentBySuffix: Record<string, number> = Object.fromEntries(ip68JointSeeds.map((seed)=>[seed.suffix.replace(/^-/,""),seed.currentA]));
const getIp68JointSeed=(currentA:number)=>ip68JointSeeds.find((seed)=>seed.currentA===currentA);
const normalize=(v:unknown)=>String(v??"").replace(/\u00a0/g," ").replace(/[–—]/g,"-").replace(/\s+/g," ").trim();

export function isJointSpecificationRow(row:{article?:string;item?:string}) {
  const article=normalize(row.article);
  const item=normalize(row.item);
  const text=`${article} ${item}`;
  return /(?:G\.(?:001|005)\.000|012\.(?:001|003|007)\.000|стык(?:овочн\w*)?|соединитель\s*G)/i.test(text)
    || /(?:^|-)G(?:-|$)/i.test(article.replace(/\s+/g,""));
}

export function parseJointSpecificationRow(row:{rowNumber?:string;article?:string;item?:string;quantity?:number}, source:JointDemandRow["source"]="production"):JointDemandRow|undefined {
  const article=normalize(row.article); const item=normalize(row.item); const text=`${article} ${item}`;
  // A joint is classified before every section-family matcher. It can never
  // fall through to FE/CD/CP/ZD/ZDP or any other section calculation.
  if (!isJointSpecificationRow({article,item})) return undefined;
  const ip:"IP55"|"IP68"=/(?:012\.007\.000|IP68)/i.test(text)?"IP68":"IP55";
  let currentA=Number(text.match(/(400|500|630|800|1000|1250|1600|2000|2500|3200|4000|5000|6300)\s*А/i)?.[1]??0);
  if (!currentA && ip==="IP68") {
    const designation=article.match(/012\.007\.000(?:-(\d{2}))?/i);
    if (designation) currentA=ip68CurrentBySuffix[designation[1]??""]??0;
  }
  if (!currentA) {
    const designation=article.match(/(?:G\.(?:001|005)\.000|012\.(?:001|003)\.000)(?:-(\d{2}))?/i);
    if (designation) currentA=currentBySuffix[designation[1]??""]??0;
  }
  if (!currentA) {
    const token=article.replace(/\s+/g,"").split("-").find(part=>currentByArticleToken[part]);
    currentA=token?currentByArticleToken[token]:0;
  }
  const thicknessMatch=text.match(/(?:шина\s*)?(6|7)\s*мм/i);
  const busbarThicknessMm=(thicknessMatch?Number(thicknessMatch[1]):null) as 6|7|null;
  const articleTokens=article.toUpperCase().replace(/Р/g,"P").split("-");
  const poles:4|5=ip==="IP68"||/(?:G\.005\.000|012\.003\.000|5P)/i.test(text)||articleTokens[5]==="5"?5:4;
  const supported=ip==="IP68"?Boolean(getIp68JointSeed(currentA)):Boolean(getJointRule(currentA));
  return {id:`joint-${source}-${row.rowNumber??""}-${article}-${item}`,rowNumber:String(row.rowNumber??""),article,item,quantity:Math.max(0,Number(row.quantity)||0),currentA,poles,ip,busbarThicknessMm,source,dimensionsMm:[0,0,0],recognitionStatus:currentA&&supported?"confirmed":"missing-current"};
}

export function calculateJointMaterialLines(demand:JointDemandRow):JointMaterialLine[] {
  if(demand.ip==="IP68") {
    const seed=getIp68JointSeed(demand.currentA);
    if(!seed||!(demand.quantity>0)||demand.poles!==5) return [];
    const q=demand.quantity;
    const designation=`012.007.000${seed.suffix}`;
    const basis=`КД ${designation}; ${q} компл.`;
    const suffix=seed.suffix;
    const line=(designationValue:string,name:string,qty:number):JointMaterialLine=>({code:"",designation:designationValue,name,unit:"шт",qty,group:"Стыковочные элементы · IP68 · 5P",basis,confidence:"Подтверждено"});
    return [
      line(`583.002${suffix}`,`Шина стыка G ${demand.currentA}А IP68`,12*q),
      line(seed.insulatorDesignation,"Изолятор IP68",seed.insulatorQty*q),
      line(`195.003${suffix}`,`Прижимной профиль стыка G ${demand.currentA}А IP68`,q),
      line(`195.004${suffix}`,`Прижимной профиль стыка G ${demand.currentA}А IP68`,q),
      line("03.212.001-05","Втулка",seed.bushingQty*q),
      line("","Болт DIN 933-M12×150-8.8",seed.bushingQty*q),
      line("","Гайка DIN 985-M12-8.8",seed.bushingQty*q),
      line("","Пружина тарельчатая 60,0×13,0×5,0×1,5",seed.bushingQty*2*q),
    ];
  }
  const rule=getJointRule(demand.currentA); if(!rule||!(demand.quantity>0)) return [];
  const q=demand.quantity;
  const poles=demand.poles===5?5:4;
  const suffix=rule.designation.replace("G.001.000","");
  const assemblyDesignation=poles===5?`G.005.000${suffix}`:rule.designation;
  const connectorDesignation=poles===5?`012.003.000${suffix}`:rule.connectorDesignation;
  const drawingBasis=`${assemblyDesignation}; ${connectorDesignation}`;
  const gasket=calculateGasketingForJoint(q);
  const lines:JointMaterialLine[]=[];
  for(const c of rule.components){
    if(c.designation==="GASKETING-A") {lines.push({code:GASKETING_RULE.componentACode,designation:c.designation,name:c.name,unit:"кг",qty:gasket.componentAGrams/1000,group:`Стыковочные элементы · ${poles}P · Gasketing`,basis:`${drawingBasis}; ${gasket.lengthM.toFixed(3)} м на ${gasket.covers} крышк.; ${gasket.basis}`,confidence:"Расчётно"});continue;}
    if(c.designation==="GASKETING-B") {lines.push({code:GASKETING_RULE.componentBCode,designation:c.designation,name:c.name,unit:"кг",qty:gasket.componentBGrams/1000,group:`Стыковочные элементы · ${poles}P · Gasketing`,basis:`${drawingBasis}; ${gasket.lengthM.toFixed(3)} м на ${gasket.covers} крышк.; ${gasket.basis}`,confidence:"Расчётно"});continue;}
    if(!c.costable) continue;
    const isBusbar=c.designation===rule.busbarDesignation;
    const isInsulator=c.designation===rule.insulatorDesignation;
    const isBushing=c.name==="Втулка";
    const isMainBolt=/Болт DIN 933-M12/.test(c.name);
    const componentQuantity=isBusbar?(poles===5?10:8):isInsulator?(poles===5?5:4):c.quantity;
    const designation=poles===5&&isBushing?"03.212.001-04":c.designation;
    const name=poles===5&&isMainBolt?"Болт DIN 933-M12×140-8.8":c.name;
    lines.push({code:"",designation,name,unit:c.unit??"шт",qty:componentQuantity*q,group:`Стыковочные элементы · ${poles}P`,basis:`${drawingBasis}; ${q} компл.; ${c.source}`,confidence:"Подтверждено"});
  }
  return lines;
}
