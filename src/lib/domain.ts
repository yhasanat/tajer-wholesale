export type Currency = 'ILS'|'USD'|'CNY'|'JOD'|'EUR';
export type ContainerStatus = 'draft'|'transit'|'received'|'final';
export type Container = {
  id:string;code:string;name:string;supplier:string;currency:Currency;fx:number;
  eta:string;notes:string;status:ContainerStatus;createdAt:string;receivedAt:string;
  parentId?:string;annexKind?:'addition'|'correction';documentDate?:string;
  correctionEffect?:{salesCost:number;stockLoss:number};
  shareCosts?:boolean;
};
export type Item = {
  id:string;containerId:string;model:string;name:string;color:string;size:string;
  barcode:string;quantity:number;purchase:number;currency:Currency;fx:number;
  volume:number;weight:number;price:number;notes:string;received:number;damaged:number;
  skuKey?:string;recoveryOf?:string;gradeOf?:string;
};
export type Cost = {
  id:string;containerId:string;name:string;amount:number;currency:Currency;fx:number;
  basis:'value'|'quantity'|'volume'|'weight'|'direct';target:string;confirmed:boolean;notes:string;
  sourceCostId?:string;activateOnReceipt?:boolean;
  scope?:'family'|'container';
};
export type Customer = {id:string;name:string;phone:string;address:string;notes:string;opening:number};
export type Allocation = {itemId:string;quantity:number;extraUnitCost?:number};
export type SaleLine = {key:string;model:string;name:string;color:string;size:string;quantity:number;price:number;gross:number;net:number;allocations:Allocation[]};
export type Sale = {id:string;number:string;date:string;customerId:string;lines:SaleLine[];discount:number;total:number;paid:number;method:'cash'|'bank'|'card'|'credit';delivery:number;notes:string;createdAt:string;voided:boolean;voidReason:string};
export type Payment = {id:string;date:string;customerId:string;amount:number;method:string;notes:string};
export type OperatingExpense = {id:string;date:string;amount:number;category:string;notes:string};
export type Settings = {name:string;phone:string;address:string;margin:number;invoiceFooter:string};
export type RecoveryPricing = {
  base:number;perPiece:number;quantity:number;total:number;price:number;approvedAt:string;
};
export type StockMovement = {
  id:string;itemId:string;kind:'damage'|'missing'|'grade'|'cost';quantity:number;
  date:string;reason:string;createdAt:string;extraUnitCost:number;
  amount?:number;netUnitValue?:number;outputItemId?:string;pricing?:RecoveryPricing;
};
export type ValuationEffect = {stockValue:number;salesCost:number;stockLoss:number};
type ValuationDocument = {id:string;containerId:string;date:string;createdAt:string;reason:string;effect:ValuationEffect};
export type ValuationChange = ValuationDocument & (
  {kind:'sharing';before:boolean;after:boolean;scopes:{costId:string;before:NonNullable<Cost['scope']>;after:NonNullable<Cost['scope']>}[]}
  |{kind:'receipt';itemId:string;before:number;after:number;mode:'received'|'stock';count:number;purchaseAmount:number}
);
export type State = {revision:number;settings:Settings;containers:Container[];items:Item[];costs:Cost[];customers:Customer[];sales:Sale[];payments:Payment[];operatingExpenses:OperatingExpense[];stockMovements:StockMovement[];valuationChanges:ValuationChange[]};
export type Action = {type:string;payload:Record<string,any>};
export const recordKinds = ['containers','items','costs','customers','sales','payments','operatingExpenses'] as const;
const unitCostCache=new WeakMap<State,Map<string,number>>();
const soldQuantityCache=new WeakMap<State,Map<string,number>>();
export const currencies:Currency[]=['ILS','USD','CNY','JOD','EUR'];
export const statusLabels:Record<ContainerStatus,string>={draft:'قيد التجهيز',transit:'في الطريق',received:'مستلمة · تكلفة تقديرية',final:'مستلمة · تكلفة معتمدة'};
export const paymentLabels:Record<string,string>={cash:'نقدي',bank:'تحويل بنكي',card:'بطاقة',credit:'آجل'};
export const basisLabels:Record<Cost['basis'],string>={value:'قيمة الشراء',quantity:'عدد القطع',volume:'الحجم CBM',weight:'الوزن',direct:'موديل محدد'};
export function emptyState():State{return {revision:0,settings:{name:'تاجر',phone:'',address:'',margin:30,invoiceFooter:'شكرًا لتعاملكم معنا'},containers:[],items:[],costs:[],customers:[],sales:[],payments:[],operatingExpenses:[],stockMovements:[],valuationChanges:[]};}
export function upgradeState(state:State):State {
  if(state.stockMovements!==undefined&&state.valuationChanges!==undefined) return state;
  return {...state,stockMovements:state.stockMovements??[],valuationChanges:state.valuationChanges??[]};
}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hebron',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function uid(){if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
export function cents(v:number){return Math.round((v+Number.EPSILON)*100);}
export function money(v:number){return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v/100)+' ₪';}
export function qty(v:number){return new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(v);}
function text(v:unknown,max=200){return String(v??'').trim().slice(0,max);}
function num(v:unknown,min=0,max=1e9){if(v===''||v===null||v===undefined)throw Error('أكمل الحقول الرقمية المطلوبة.');const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error('أدخل قيمة رقمية صحيحة ضمن الحدود المسموحة.');return n;}
function integer(v:unknown,min=0){const n=num(v,min,1e7);if(!Number.isInteger(n))throw Error('عدد القطع يجب أن يكون عددًا صحيحًا.');return n;}
function date(v:unknown){const s=text(v,10),timestamp=Date.parse(s+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==s)throw Error('أدخل تاريخًا صحيحًا.');return s;}
function currency(v:unknown){const s=text(v) as Currency;if(!currencies.includes(s))throw Error('اختر عملة صحيحة.');return s;}
function rate(c:Currency,v:unknown){return c==='ILS'?1:num(v,.000001,1e6);}
export function variant(i:Pick<Item,'model'|'color'|'size'>){return [i.model,i.color,i.size].map(x=>x.trim().toLocaleLowerCase()).join('|');}
export function regularProductKey(item:Item) {
  return item.skuKey || variant(item);
}

export function itemGroupKey(item:Item) {
  const key=regularProductKey(item);
  return item.gradeOf ? 'grade:'+encodeURIComponent(key) : key;
}

function assignProductKey(state:State,item:Item,excludingId?:string) {
  const key=variant(item);
  const candidates=state.items.filter(other=>!other.gradeOf&&other.id!==excludingId);
  const matching=candidates.find(other=>variant(other)===key);
  if(matching) item.skuKey=regularProductKey(matching);
  else if(candidates.some(other=>regularProductKey(other)===key)) item.skuKey='sku:'+uid();
}

export function batchItems(state:State,containerId:string) {
  return state.items.filter(item=>item.containerId===containerId&&!item.gradeOf);
}

export function containerAnnexes(state:State,containerId:string) {
  return state.containers.filter(container=>container.parentId===containerId);
}

export function containerRoot(state:State,containerId:string) {
  const container=getContainer(state,containerId);
  return container.parentId?getContainer(state,container.parentId):container;
}

export function familyCosts(state:State,containerId:string) {
  const root=containerRoot(state,containerId);
  const ids=new Set([root.id,...containerAnnexes(state,root.id).map(container=>container.id)]);
  return state.costs.filter(cost=>ids.has(cost.containerId)&&!cost.sourceCostId);
}

export function costScope(cost:Cost) {
  return cost.basis==='direct'?'container':cost.scope??'family';
}

function provisionalCost(state:State,containerId:string) {
  const container=getContainer(state,containerId),root=containerRoot(state,containerId);
  return container.status!=='final'||!!root.shareCosts&&[root,...containerAnnexes(state,root.id)].some(batch=>batch.status!=='final');
}

export function isReceived(container:Container|undefined) {
  return container?.status==='received'||container?.status==='final';
}

export function remainingShortage(state:State,item:Item) {
  const accounted=state.items.filter(row=>row.recoveryOf===item.id).reduce((total,row)=>{
    const container=state.containers.find(entry=>entry.id===row.containerId);
    return total+(isReceived(container)?row.received+row.damaged:row.quantity);
  },0);
  return Math.max(0,item.quantity-item.received-item.damaged-accounted);
}

export function sharedCostRemaining(state:State,cost:Cost) {
  const reserved=state.costs.filter(share=>share.sourceCostId===cost.id)
    .reduce((total,share)=>total+cents(share.amount*share.fx),0);
  return cents(cost.amount*cost.fx)-reserved;
}

export function split(total:number,weights:number[]){const sum=weights.reduce((a,b)=>a+b,0);if(!sum)return weights.map(()=>0);const raw=weights.map(v=>total*v/sum),out=raw.map(Math.floor);const remainder=total-out.reduce((a,b)=>a+b,0);const order=raw.map((n,i)=>({i,f:n-out[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);for(let j=0;j<remainder;j++)out[order[j%order.length].i]++;return out;}
export type LandedRow={item:Item;base:number;allocated:number;total:number;unit:number;count:number;revenue:number;profit:number};
type LandedAmounts={base:number;allocated:number};
type Valuation={
  items:Map<string,LandedAmounts>;
  issues:Map<string,string[]>;
  unallocated:Map<string,number>;
  costs:Map<string,number>;
  allocations:Map<string,Map<string,number>>;
};
const valuationCache=new WeakMap<State,Valuation>();

function landedValuation(state:State):Valuation {
  const cached=valuationCache.get(state);
  if(cached) return cached;
  const amounts=new Map<string,LandedAmounts>();
  const issues=new Map<string,string[]>();
  const unallocated=new Map<string,number>();
  const costs=new Map(state.costs.map(cost=>[cost.id,cents(cost.amount*cost.fx)]));
  const allocations=new Map<string,Map<string,number>>();
  const containers=new Map(state.containers.map(container=>[container.id,container]));
  const itemsByContainer=new Map<string,Item[]>();
  const recoveries=new Map<string,Item[]>();
  const purchaseAdjustments=new Map<string,number>();
  for(const change of state.valuationChanges??[]) {
    if(change.kind==='receipt') purchaseAdjustments.set(change.itemId,(purchaseAdjustments.get(change.itemId)??0)+change.purchaseAmount);
  }

  for(const item of state.items) {
    if(item.gradeOf) continue;
    const rows=itemsByContainer.get(item.containerId)??[];
    rows.push(item);
    itemsByContainer.set(item.containerId,rows);
    const adjustment=purchaseAdjustments.get(item.id)??0;
    amounts.set(item.id,{base:cents(item.quantity*item.purchase*item.fx)+adjustment,allocated:0});
    if(item.recoveryOf&&item.received&&isReceived(containers.get(item.containerId))) {
      const recovered=recoveries.get(item.recoveryOf)??[];
      recovered.push(item);
      recoveries.set(item.recoveryOf,recovered);
    }
  }
  // Transfer the existing purchase value before allocating shared family expenses.
  for(const [originalId,recovered] of recoveries) {
    const original=state.items.find(item=>item.id===originalId)!;
    if(!containerRoot(state,original.containerId).shareCosts) continue;
    const originalAmounts=amounts.get(originalId)!;
    const recoveredCount=recovered.reduce((sum,item)=>sum+item.received,0);
    const weights=[original.received||Math.max(0,original.quantity-recoveredCount),...recovered.map(item=>item.received)];
    const bases=split(originalAmounts.base,weights);
    originalAmounts.base=bases[0];
    recovered.forEach((item,index)=>amounts.get(item.id)!.base+=bases[index+1]);
  }
  for(const cost of state.costs) {
    if(!cost.sourceCostId) continue;
    if(containerRoot(state,cost.containerId).shareCosts) {
      costs.set(cost.id,0);
      continue;
    }
    if(cost.activateOnReceipt&&!isReceived(containers.get(cost.containerId))) {
      costs.set(cost.id,0);
      continue;
    }
    costs.set(cost.sourceCostId,(costs.get(cost.sourceCostId)??0)-(costs.get(cost.id)??0));
  }
  for(const cost of state.costs) {
    const amount=costs.get(cost.id)??0;
    if(!amount) continue;
    const root=containerRoot(state,cost.containerId);
    const shared=root.shareCosts&&costScope(cost)==='family';
    const targets=shared?[root,...containerAnnexes(state,root.id)]:[containers.get(cost.containerId)!];
    const quantityWeight=(item:Item)=>{
      const recovered=(recoveries.get(item.id)??[]).reduce((sum,row)=>sum+row.received,0);
      return item.recoveryOf&&isReceived(containers.get(item.containerId))?item.received
        :Math.max(item.quantity,item.received+item.damaged+recovered)-recovered;
    };
    const items=targets.flatMap(container=>itemsByContainer.get(container.id)??[]).filter(item=>
      !shared||((!item.recoveryOf||isReceived(containers.get(item.containerId)))&&quantityWeight(item)>0));
    const weights=items.map(item=>{
      if(cost.basis==='quantity') return shared?quantityWeight(item):item.quantity;
      if(cost.basis==='volume'||cost.basis==='weight') {
        const measure=cost.basis;
        if(!shared) return item[measure];
        if(item.recoveryOf) return item[measure]*item.received/item.quantity;
        const transferred=(recoveries.get(item.id)??[]).reduce((sum,row)=>sum+row[measure]*row.received/row.quantity,0);
        return Math.max(0,item[measure]-transferred);
      }
      if(cost.basis==='direct') return item.id===cost.target?1:0;
      return amounts.get(item.id)!.base;
    });
    const missingMeasure=(cost.basis==='volume'||cost.basis==='weight')&&weights.some(weight=>weight<=0);
    if(amount<0||missingMeasure||weights.reduce((sum,weight)=>sum+weight,0)<=0) {
      const message=missingMeasure
        ? 'أكمل '+(cost.basis==='volume'?'الحجم':'الوزن')+' لكل صنف لتوزيع «'+cost.name+'».'
        : 'راجع مبلغ وأساس توزيع «'+cost.name+'».';
      for(const target of targets) issues.set(target.id,[...(issues.get(target.id)??[]),message]);
      unallocated.set(cost.containerId,(unallocated.get(cost.containerId)??0)+amount);
      continue;
    }
    const byContainer=new Map<string,number>();
    split(amount,weights).forEach((share,index)=>{
      const item=items[index];
      amounts.get(item.id)!.allocated+=share;
      byContainer.set(item.containerId,(byContainer.get(item.containerId)??0)+share);
    });
    allocations.set(cost.id,byContainer);
  }
  for(const original of state.items) {
    const recovered=recoveries.get(original.id);
    const originalAmounts=amounts.get(original.id);
    if(!recovered||!originalAmounts) continue;
    if(containerRoot(state,original.containerId).shareCosts) continue;
    const recoveredCount=recovered.reduce((sum,item)=>sum+item.received,0);
    const originalWeight=original.received||Math.max(0,original.quantity-recoveredCount);
    const weights=[originalWeight,...recovered.map(item=>item.received)];
    const bases=split(originalAmounts.base,weights);
    const allocations=split(originalAmounts.allocated,weights);
    originalAmounts.base=bases[0];
    originalAmounts.allocated=allocations[0];
    recovered.forEach((item,index)=>{
      const destination=amounts.get(item.id)!;
      destination.base+=bases[index+1];
      destination.allocated+=allocations[index+1];
    });
  }
  const result={items:amounts,issues,unallocated,costs,allocations};
  valuationCache.set(state,result);
  return result;
}

export function costAllocatedToBatch(state:State,cost:Cost,containerId=cost.containerId) {
  const valuation=landedValuation(state);
  return valuation.allocations.get(cost.id)?.get(containerId)??0;
}

export function calculateContainer(state:State,id:string) {
  const container=getContainer(state,id);
  const valuation=landedValuation(state);
  const received=isReceived(container);
  const rows:LandedRow[]=batchItems(state,id).map(item=>{
    const {base,allocated}=valuation.items.get(item.id)!;
    const total=base+allocated;
    const count=received?item.received:item.quantity;
    const revenue=cents(count*item.price);
    return {item,base,allocated,total,count,unit:count>0?total/count:0,revenue,profit:revenue-total};
  });
  const base=rows.reduce((sum,row)=>sum+row.base,0);
  const extra=rows.reduce((sum,row)=>sum+row.allocated,valuation.unallocated.get(id)??0);
  const total=base+extra;
  const revenue=rows.reduce((sum,row)=>sum+row.revenue,0);
  const issues=valuation.issues.get(id)??[];
  const loss=received?rows.filter(row=>row.count===0).reduce((sum,row)=>sum+row.total,0):0;
  return {container,rows,base,extra,total,revenue,profit:revenue-total,
    quantity:rows.reduce((sum,row)=>sum+row.count,0),issues,valid:issues.length===0,
    provisional:provisionalCost(state,id),loss};
}

export function calculateContainerFamily(state:State,containerId:string) {
  const calculations=[getContainer(state,containerId),...containerAnnexes(state,containerId)]
    .map(container=>calculateContainer(state,container.id));
  return {
    calculations,
    rows:calculations.flatMap(calculation=>calculation.rows.map(row=>({...row,batchCode:calculation.container.code}))),
    quantity:calculations.reduce((sum,calculation)=>sum+calculation.quantity,0),
    total:calculations.reduce((sum,calculation)=>sum+calculation.total,0),
    revenue:calculations.reduce((sum,calculation)=>sum+calculation.revenue,0),
    profit:calculations.reduce((sum,calculation)=>sum+calculation.profit,0),
    valid:calculations.every(calculation=>calculation.valid),
  };
}

function baseItemCost(state:State,itemId:string) {
  let cache=unitCostCache.get(state);
  if(!cache) {
    cache=new Map<string,number>();
    for(const container of state.containers) {
      for(const row of calculateContainer(state,container.id).rows) cache.set(row.item.id,row.unit);
    }
    for(const movement of state.stockMovements??[]) {
      if(movement.kind==='grade'&&movement.outputItemId) {
        const originalCost=(cache.get(movement.itemId)??0)+movement.extraUnitCost;
        cache.set(movement.outputItemId,Math.min(originalCost,movement.netUnitValue??0));
      }
    }
    unitCostCache.set(state,cache);
  }
  return cache.get(itemId)??0;
}

type StockBalance={out:number;extra:number;lastCostDate:string};
const stockBalanceCache=new WeakMap<State,Map<string,StockBalance>>();

function stockBalances(state:State) {
  const cached=stockBalanceCache.get(state);
  if(cached) return cached;
  const balances=new Map<string,StockBalance>();
  const get=(id:string)=>{
    let balance=balances.get(id);
    if(!balance) {
      balance={out:0,extra:0,lastCostDate:''};
      balances.set(id,balance);
    }
    return balance;
  };
  for(const movement of state.stockMovements??[]) {
    const balance=get(movement.itemId);
    if(movement.kind==='cost') {
      balance.extra+=movement.amount??0;
      if(movement.date>balance.lastCostDate) balance.lastCostDate=movement.date;
    } else {
      balance.out+=movement.quantity;
      balance.extra-=movement.extraUnitCost*movement.quantity;
    }
  }
  for(const sale of state.sales) {
    if(sale.voided) continue;
    for(const line of sale.lines) for(const allocation of line.allocations) {
      if(allocation.extraUnitCost) get(allocation.itemId).extra-=allocation.extraUnitCost*allocation.quantity;
    }
  }
  stockBalanceCache.set(state,balances);
  return balances;
}

export function additionalStockValue(state:State,itemId:string) {
  return stockBalances(state).get(itemId)?.extra??0;
}

export function additionalUnitCost(state:State,itemId:string) {
  const item=state.items.find(entry=>entry.id===itemId);
  const available=item?itemAvailable(state,item):0;
  return available?Math.max(0,additionalStockValue(state,itemId))/available:0;
}

export function itemCost(state:State,itemId:string) {
  return baseItemCost(state,itemId)+additionalUnitCost(state,itemId);
}

export function movementLoss(state:State,movement:StockMovement) {
  if(movement.kind==='cost') return 0;
  const value=baseItemCost(state,movement.itemId)+movement.extraUnitCost;
  const remaining=movement.kind==='grade'?Math.min(value,movement.netUnitValue??0):0;
  return Math.round((value-remaining)*movement.quantity);
}

export function recoveryPricing(state:State,movement:StockMovement,base:number,quantity:number) {
  const perPiece=quantity>0?Math.round(movementLoss(state,movement)/quantity):0;
  return {base,quantity,perPiece,total:perPiece*quantity,price:base+perPiece};
}

export const stockMovementLabels:Record<StockMovement['kind'],string>={
  damage:'شطب تالف',missing:'فاقد مؤكد',grade:'فرز إلى درجة ثانية',cost:'مصروف وصول للسليم',
};

export type StockJournalRow={
  id:string;itemId:string;batch:string;date:string;createdAt:string;label:string;
  change:number;balance:number;amount:number;note:string;movement?:StockMovement;
};

export function stockJournal(state:State,key:string) {
  const result:StockJournalRow[]=[];
  for(const item of state.items.filter(entry=>itemGroupKey(entry)===key)) {
    const container=getContainer(state,item.containerId);
    if(!isReceived(container)) continue;
    const batch=container.code;
    const corrections=(state.valuationChanges??[]).filter((change):change is Extract<ValuationChange,{kind:'receipt'}>=>change.kind==='receipt'&&change.itemId===item.id);
    const initialReceived=item.received-corrections.reduce((sum,change)=>sum+change.after-change.before,0);
    const receipt:StockJournalRow={
      id:item.id,itemId:item.id,batch,date:itemReceiptDate(state,item),createdAt:container.createdAt,
      label:item.gradeOf?'إضافة إلى الدرجة الثانية':container.annexKind==='correction'?'تصحيح استلام':container.parentId?'استلام ملحق':'استلام',
      change:initialReceived,balance:initialReceived,amount:initialReceived*baseItemCost(state,item.id),note:container.name,
    };
    const entries:StockJournalRow[]=[];
    for(const change of corrections) {
      const quantity=change.after-change.before;
      entries.push({id:change.id,itemId:item.id,batch,date:change.date,createdAt:change.createdAt,
        label:'تصحيح كمية الاستلام',change:quantity,balance:0,amount:quantity*baseItemCost(state,item.id),note:change.reason});
    }
    for(const sale of state.sales) {
      if(sale.voided) continue;
      const allocations=sale.lines.flatMap(line=>line.allocations).filter(allocation=>allocation.itemId===item.id);
      if(!allocations.length) continue;
      const quantity=allocations.reduce((sum,allocation)=>sum+allocation.quantity,0);
      const amount=allocations.reduce((sum,allocation)=>
        sum+(baseItemCost(state,item.id)+(allocation.extraUnitCost??0))*allocation.quantity,0);
      entries.push({id:sale.id,itemId:item.id,batch,date:sale.date,createdAt:sale.createdAt,
        label:'بيع',change:-quantity,balance:0,amount,note:sale.number});
    }
    for(const movement of state.stockMovements??[]) {
      if(movement.itemId!==item.id) continue;
      entries.push({id:movement.id,itemId:item.id,batch,date:movement.date,createdAt:movement.createdAt,
        label:stockMovementLabels[movement.kind],change:movement.kind==='cost'?0:-movement.quantity,balance:0,
        amount:movement.kind==='cost'?movement.amount??0:movementLoss(state,movement),note:movement.reason,movement});
    }
    entries.sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt));
    let balance=initialReceived;
    for(const row of entries) {
      balance+=row.change;
      row.balance=balance;
    }
    result.push(receipt,...entries);
  }
  return result.sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
}

export function createdEntityId(before:State,after:State,type:string){
  const kind=type==='sale.create'?'sales'
    :type==='container.save'||type==='container.annex'?'containers'
    :type==='customer.save'?'customers'
    :type==='stock.record'?'stockMovements':undefined;
  if(type==='container.sharing'||type==='receipt.correct') return after.valuationChanges.at(-1)?.id;
  if(!kind)return undefined;
  const ids=new Set((before[kind]??[]).map(record=>record.id));
  return after[kind].find(record=>!ids.has(record.id))?.id;
}
export function soldOf(s:State,itemId:string){let cache=soldQuantityCache.get(s);if(!cache){cache=new Map<string,number>();for(const sale of s.sales)if(!sale.voided)for(const line of sale.lines)for(const a of line.allocations)cache.set(a.itemId,(cache.get(a.itemId)||0)+a.quantity);soldQuantityCache.set(s,cache);}return cache.get(itemId)||0;}
export function adjustedOut(state:State,itemId:string) {
  return stockBalances(state).get(itemId)?.out??0;
}

export function itemAvailable(state:State,item:Item) {
  const container=state.containers.find(entry=>entry.id===item.containerId);
  return isReceived(container)?Math.max(0,item.received-soldOf(state,item.id)-adjustedOut(state,item.id)):0;
}

export function inventory(state:State) {
  const groups=new Map<string,{key:string;item:Item;quantity:number;cost:number;price:number;
    provisional:boolean;batches:{item:Item;quantity:number;cost:number}[]}>();
  for(const item of state.items) {
    const container=state.containers.find(entry=>entry.id===item.containerId);
    if(!isReceived(container)) continue;
    const count=itemAvailable(state,item);
    const key=itemGroupKey(item);
    const cost=itemCost(state,item.id);
    let group=groups.get(key);
    if(!group) {
      group={key,item,quantity:0,cost,price:item.price,provisional:false,batches:[]};
      groups.set(key,group);
    }
    group.quantity+=count;
    group.provisional ||= provisionalCost(state,container!.id);
    group.batches.push({item,quantity:count,cost});
  }
  return [...groups.values()].sort((a,b)=>a.item.model.localeCompare(b.item.model,'ar'));
}

function allocationUnitCost(state:State,allocation:Allocation) {
  return baseItemCost(state,allocation.itemId)+(allocation.extraUnitCost??0);
}

export function saleLineCost(state:State,line:Pick<SaleLine,'allocations'>) {
  return line.allocations.reduce((sum,allocation)=>
    sum+allocationUnitCost(state,allocation)*allocation.quantity,0);
}

export function saleCost(state:State,sale:Sale) {
  return sale.lines.reduce((sum,line)=>sum+saleLineCost(state,line),0);
}
export function customerBalance(s:State,id:string){const customer=s.customers.find(c=>c.id===id);return (customer?.opening??0)+s.sales.filter(v=>v.customerId===id&&!v.voided).reduce((n,v)=>n+v.total-v.paid,0)-s.payments.filter(p=>p.customerId===id).reduce((n,p)=>n+p.amount,0);}
export function report(state:State,from='',to='') {
  const inRange=(date:string)=>(!from||date>=from)&&(!to||date<=to);
  const sales=state.sales.filter(sale=>!sale.voided&&inRange(sale.date));
  const revenue=sales.reduce((sum,sale)=>sum+sale.total,0);
  const cost=sales.reduce((sum,sale)=>sum+saleCost(state,sale),0);
  const delivery=sales.reduce((sum,sale)=>sum+sale.delivery,0);
  const expenses=state.operatingExpenses.filter(expense=>inRange(expense.date)).reduce((sum,expense)=>sum+expense.amount,0);
  const receiptLoss=state.containers.filter(container=>isReceived(container)&&inRange(container.receivedAt.slice(0,10)))
    .reduce((sum,container)=>sum+calculateContainer(state,container.id).loss,0);
  const losses=(state.stockMovements??[]).filter(movement=>movement.kind!=='cost'&&inRange(movement.date));
  const adjustmentLoss=losses.reduce((sum,movement)=>sum+movementLoss(state,movement),0);
  const loss=receiptLoss+adjustmentLoss;
  const isProvisional=(id:string)=>{
    const item=state.items.find(item=>item.id===id);
    return !item||provisionalCost(state,item.containerId);
  };
  const provisional=sales.some(sale=>sale.lines.some(line=>line.allocations.some(allocation=>isProvisional(allocation.itemId))))
    ||losses.some(movement=>isProvisional(movement.itemId));
  return {sales,revenue,cost,gross:revenue-cost,delivery,expenses,loss,receiptLoss,adjustmentLoss,
    net:revenue-cost-delivery-expenses-loss,provisional};
}
function getContainer(s:State,id:unknown){const c=s.containers.find(c=>c.id===id);if(!c)throw Error('الحاوية غير موجودة.');return c;}
function editable(c:Container){if(c.status==='final')throw Error('تكلفة الحاوية معتمدة ومقفلة. أسعار البيع والملاحظات تبقى قابلة للتحديث.');}
export function cleanItem(p:Record<string,any>,container:Container):Item{const cur=currency(p.currency||container.currency);const i:Item={id:uid(),containerId:container.id,model:text(p.model,100),name:text(p.name),color:text(p.color,80),size:text(p.size,60),barcode:text(p.barcode,100),quantity:integer(p.quantity,1),purchase:num(p.purchase),currency:cur,fx:rate(cur,p.fx??(cur===container.currency?container.fx:undefined)),volume:num(p.volume||0),weight:num(p.weight||0),price:num(p.price||0),notes:text(p.notes,3000),received:0,damaged:0};if(!i.model||!i.name)throw Error('رقم الموديل واسم الصنف مطلوبان.');return i;}
function getOrCreateCustomer(s:State,p:Record<string,any>){if(p.customerId){const c=s.customers.find(c=>c.id===p.customerId);if(!c)throw Error('اختر زبونًا صحيحًا.');return c;}const name=text(p.customerName),phone=text(p.customerPhone,50);if(!name)throw Error('أدخل اسم الزبون.');const existing=s.customers.find(c=>phone?c.phone===phone:c.name===name);if(existing)return existing;const c:Customer={id:uid(),name,phone,address:'',notes:'',opening:0};s.customers.push(c);return c;}

function getItem(state:State,id:unknown) {
  const item=state.items.find(entry=>entry.id===id);
  if(!item) throw Error('الصنف غير موجود.');
  return item;
}

export function itemReceiptDate(state:State,item:Item) {
  const container=getContainer(state,item.containerId);
  if(item.gradeOf) {
    return state.stockMovements.find(movement=>movement.id===item.gradeOf)?.date
      ??container.receivedAt.slice(0,10);
  }
  return container.receivedAt.slice(0,10);
}

function createAnnex(state:State,payload:Action['payload'],now:string) {
  const parent=getContainer(state,payload.parentId);
  if(parent.parentId) throw Error('أضف الملحق من ملف الحاوية الأصلية.');
  const kind=payload.annexKind;
  if(kind!=='addition'&&kind!=='correction') throw Error('اختر نوع الملحق.');
  const notes=text(payload.notes,5000);
  if(kind==='correction'&&(!isReceived(parent)||!notes)) {
    throw Error('اختر حاوية مستلمة واكتب سبب تصحيح الجرد.');
  }
  const name=text(payload.name);
  if(!name) throw Error('أدخل اسم الملحق.');
  const used=new Set(state.containers.map(container=>container.code));
  let number=1;
  while(used.has(parent.code+'-A'+String(number).padStart(2,'0'))) number++;
  state.containers.push({
    id:uid(),code:parent.code+'-A'+String(number).padStart(2,'0'),name,
    supplier:text(payload.supplier)||parent.supplier,currency:parent.currency,fx:parent.fx,
    eta:payload.eta?date(payload.eta):'',notes,status:'draft',createdAt:now,receivedAt:'',
    parentId:parent.id,annexKind:kind,documentDate:date(payload.documentDate||today()),
  });
}

function recoverReceiptItem(state:State,payload:Action['payload']) {
  const annex=getContainer(state,payload.containerId);
  const source=getItem(state,payload.itemId);
  if(annex.annexKind!=='correction'||isReceived(annex)||source.containerId!==annex.parentId||source.gradeOf) {
    throw Error('اختر صنفًا من الحاوية الأصلية لتصحيح جرد الملحق.');
  }
  const quantity=integer(payload.quantity,1);
  if(quantity>remainingShortage(state,source)) throw Error('الكمية تتجاوز فرق الجرد المتبقي للصنف.');
  if(batchItems(state,annex.id).some(item=>variant(item)===variant(source))) {
    throw Error('هذا الموديل موجود في سند الملحق.');
  }
  state.items.push({
    ...source,id:uid(),containerId:annex.id,skuKey:regularProductKey(source),
    recoveryOf:source.id,quantity,purchase:0,currency:'ILS',fx:1,
    volume:source.volume*quantity/source.quantity,weight:source.weight*quantity/source.quantity,
    received:0,damaged:0,notes:text(payload.notes,3000)||'كمية سبق احتساب شرائها ضمن الحاوية الأصلية.',
  });
}

function saveProductDetails(state:State,payload:Action['payload']) {
  const source=getItem(state,payload.id);
  const key=regularProductKey(source);
  const details={model:text(payload.model,100),name:text(payload.name),color:text(payload.color,80),
    size:text(payload.size,60),barcode:text(payload.barcode,100),notes:text(payload.notes,3000)};
  if(!details.model||!details.name) throw Error('رقم الموديل واسم الصنف مطلوبان.');
  const others=state.items.filter(item=>!item.gradeOf&&regularProductKey(item)!==key);
  if(others.some(item=>variant(item)===variant(details))) throw Error('الموديل واللون والمقاس مستخدمة لصنف آخر.');
  if(details.barcode&&others.some(item=>item.barcode===details.barcode)) throw Error('الباركود مستخدم لصنف آخر.');
  for(const item of state.items.filter(item=>regularProductKey(item)===key)) {
    Object.assign(item,details,{skuKey:key});
    if(item.gradeOf) {
      item.name=details.name+' — درجة ثانية';
      item.barcode='';
    }
  }
}

function allocateSharedCost(state:State,payload:Action['payload']) {
  if(containerRoot(state,text(payload.containerId)).shareCosts) {
    throw Error('مشاركة مصاريف الحاويات مفعلة. حدّد نطاق المصروف من إعدادات المشاركة.');
  }
  const annex=getContainer(state,payload.containerId);
  editable(annex);
  const parent=getContainer(state,annex.parentId);
  const source=state.costs.find(cost=>cost.id===payload.sourceCostId&&cost.containerId===parent.id);
  if(!source||source.sourceCostId||source.basis==='direct') throw Error('اختر مصروفًا مشتركًا من الحاوية الأصلية.');
  const defer=annex.annexKind==='correction';
  if(isReceived(annex)||(parent.status==='final'&&!defer)) {
    throw Error('تخصيص مصروف معتمد يحتاج ملحق تصحيح قبل استلامه.');
  }
  const amount=num(payload.amount,.000001);
  const share=cents(amount*source.fx);
  if(share<1||share>sharedCostRemaining(state,source)) throw Error('المبلغ يتجاوز الجزء المتاح من المصروف المشترك.');
  const reason=text(payload.notes,3000);
  if(defer&&!reason) throw Error('اكتب سبب تصحيح توزيع المصروف المعتمد.');
  state.costs.push({
    id:uid(),containerId:annex.id,name:source.name+' · حصة الملحق',
    amount,currency:source.currency,fx:source.fx,basis:'quantity',target:'',
    confirmed:source.confirmed,notes:reason,sourceCostId:source.id,activateOnReceipt:defer,
  });
}

function receiveDocument(state:State,previous:State,payload:Action['payload']) {
  const container=getContainer(state,payload.id);
  if(isReceived(container)) throw Error('الحاوية مستلمة بالفعل.');
  const items=batchItems(state,container.id);
  if(!items.length) throw Error('أضف الأصناف أولًا.');
  if(!Array.isArray(payload.counts)||payload.counts.length!==items.length) {
    throw Error('راجع جرد جميع أصناف الحاوية.');
  }
  const receivedDate=date(payload.date||today());
  if(container.parentId) {
    const parent=getContainer(state,container.parentId);
    if(!isReceived(parent)) throw Error('اعتمد استلام الحاوية الأصلية أولًا، ثم جرد الملحق.');
    if(receivedDate<parent.receivedAt.slice(0,10)) throw Error('تاريخ استلام الملحق يسبق استلام الحاوية.');
  }
  const notes=text(payload.notes,5000);
  for(const item of items) {
    const row=payload.counts.find((entry:{id:string})=>entry.id===item.id);
    if(!row) throw Error('هناك صنف لم يُعدّ.');
    item.received=integer(row.received);
    item.damaged=integer(row.damaged);
    if(item.recoveryOf&&item.received+item.damaged>item.quantity) {
      throw Error('الكمية المصححة أكبر من الكمية المدرجة في السند.');
    }
    if(item.received+item.damaged!==item.quantity&&!notes) {
      throw Error('هناك فروقات في العدد؛ أضف ملاحظة توضح نتيجة الجرد.');
    }
  }
  container.status='received';
  container.receivedAt=receivedDate+'T12:00:00.000Z';
  if(notes) container.notes+=(container.notes?'\n':'')+notes;
  if(container.annexKind==='correction') {
    const before=report(previous);
    const after=report(state);
    container.correctionEffect={
      salesCost:Math.round(after.cost-before.cost),
      stockLoss:after.loss-before.loss,
    };
  }
}

function latestCostDate(state:State,itemId:string) {
  return stockBalances(state).get(itemId)?.lastCostDate??'';
}

function saleBatchQuantity(state:State,item:Item,saleDate:string) {
  const quantity=itemAvailable(state,item);
  if(quantity<=0) return 0;
  const container=getContainer(state,item.containerId);
  if((container.parentId||item.gradeOf)&&saleDate<itemReceiptDate(state,item)) return 0;
  return saleDate>=latestCostDate(state,item.id)?quantity:0;
}

export function availableSaleStock(state:State,saleDate:string) {
  const day=saleDate||today();
  const available=new Map<string,number>();
  for(const item of state.items) {
    const quantity=saleBatchQuantity(state,item,day);
    if(quantity<=0) continue;
    const key=itemGroupKey(item);
    available.set(key,(available.get(key)??0)+quantity);
  }
  return available;
}

function allocateSaleStock(state:State,key:string,quantity:number,saleDate:string,used:Map<string,number>) {
  const source=state.items.filter(item=>itemGroupKey(item)===key&&saleBatchQuantity(state,item,saleDate)>0).sort((a,b)=>{
    const ca=getContainer(state,a.containerId),cb=getContainer(state,b.containerId);
    return itemReceiptDate(state,a).localeCompare(itemReceiptDate(state,b))
      ||ca.createdAt.localeCompare(cb.createdAt)||a.id.localeCompare(b.id);
  });
  let remaining=quantity;
  const allocations:Allocation[]=[];
  for(const item of source) {
    const count=Math.min(remaining,itemAvailable(state,item)-(used.get(item.id)??0));
    if(count<=0) continue;
    const allocation:Allocation={itemId:item.id,quantity:count};
    const extra=additionalUnitCost(state,item.id);
    if(extra) allocation.extraUnitCost=extra;
    allocations.push(allocation);
    used.set(item.id,(used.get(item.id)??0)+count);
    remaining-=count;
    if(!remaining) break;
  }
  if(remaining>0) throw Error('الكمية المطلوبة تتجاوز المخزون المتاح للصنف في تاريخ الفاتورة.');
  const item=source[0];
  return {item,allocations};
}

export function previewSaleLineCost(state:State,line:Pick<SaleLine,'key'|'quantity'>,saleDate:string,
  earlierLines:readonly Pick<SaleLine,'key'|'quantity'>[]=[]) {
  const quantity=integer(line.quantity,1);
  const key=text(line.key,1200),day=date(saleDate||today());
  const used=new Map<string,number>();
  for(const earlier of earlierLines) {
    if(text(earlier.key,1200)===key) allocateSaleStock(state,key,integer(earlier.quantity,1),day,used);
  }
  const {allocations}=allocateSaleStock(state,key,quantity,day,used);
  const batches=allocations.map(allocation=>{
    const item=getItem(state,allocation.itemId);
    const container=getContainer(state,item.containerId);
    const gradedFrom=item.gradeOf?state.stockMovements.find(movement=>movement.id===item.gradeOf)?.itemId:undefined;
    const original=gradedFrom?getItem(state,gradedFrom):item;
    const purchaseItem=original.recoveryOf?getItem(state,original.recoveryOf):original;
    const supplier=getContainer(state,purchaseItem.containerId).supplier;
    return {
      itemId:item.id,code:container.code,supplier,quantity:allocation.quantity,
      purchase:purchaseItem.purchase,currency:purchaseItem.currency,
      unitCost:allocationUnitCost(state,allocation),provisional:container.status!=='final',
    };
  });
  const total=saleLineCost(state,{allocations});
  return {batches,total,averageUnitCost:total/quantity};
}

function nextInvoiceNumber(sales:Sale[]) {
  let latest=BigInt(sales.length);
  for(const sale of sales) {
    const sequence=/^INV-(\d+)$/.exec(sale.number);
    if(!sequence) continue;
    const number=BigInt(sequence[1]);
    if(number>latest) latest=number;
  }
  return 'INV-'+String(latest+1n).padStart(5,'0');
}

function recordStockMovement(state:State,payload:Action['payload'],now:string) {
  const item=getItem(state,payload.itemId);
  if(!isReceived(getContainer(state,item.containerId))) throw Error('اختر دفعة مستلمة.');
  const kind=payload.kind;
  if(kind!=='damage'&&kind!=='missing'&&kind!=='grade'&&kind!=='cost') throw Error('اختر نوع الحركة.');
  const movementDate=date(payload.date||today());
  if(movementDate<itemReceiptDate(state,item)||movementDate>today()) {
    throw Error('اختر تاريخًا بين استلام الدفعة واليوم.');
  }
  if(movementDate<latestCostDate(state,item.id)) {
    throw Error('تاريخ الحركة يسبق آخر مصروف محمّل على الرصيد.');
  }
  const reason=text(payload.reason,3000);
  if(!reason) throw Error('اكتب سبب الحركة أو مرجع مستندها.');
  const available=itemAvailable(state,item);
  if(available<1) throw Error('رصيد الدفعة المتاح صفر.');
  const quantity=kind==='cost'?available:integer(payload.quantity,1);
  if(quantity>available) throw Error('الكمية تتجاوز رصيد الدفعة المتاح.');
  const movement:StockMovement={
    id:uid(),itemId:item.id,kind,quantity,date:movementDate,reason,createdAt:now,
    extraUnitCost:additionalUnitCost(state,item.id),
  };
  if(kind==='cost') {
    if(item.gradeOf) throw Error('اختر رصيدًا سليمًا لتحميل مصروف الوصول.');
    const laterSale=state.sales.some(sale=>!sale.voided&&sale.date>movementDate
      &&sale.lines.some(line=>line.allocations.some(allocation=>allocation.itemId===item.id)));
    const laterMove=state.stockMovements.some(entry=>entry.itemId===item.id&&entry.date>movementDate);
    if(laterSale||laterMove) throw Error('اختر تاريخ المصروف في أو بعد آخر حركة للدفعة ليخص الرصيد المتبقي.');
    movement.amount=integer(payload.amount,1);
  }
  if(kind==='grade') {
    if(item.gradeOf) throw Error('هذه الدفعة مصنفة درجة ثانية بالفعل.');
    const netUnitValue=integer(payload.netUnitValue,1);
    movement.netUnitValue=netUnitValue;
    movement.outputItemId=uid();
    state.items.push({
      ...item,id:movement.outputItemId,skuKey:regularProductKey(item),gradeOf:movement.id,
      recoveryOf:undefined,name:item.name+' — درجة ثانية',barcode:'',quantity,received:quantity,
      damaged:0,purchase:0,currency:'ILS',fx:1,price:num(payload.price??netUnitValue/100),
      notes:reason,
    });
  }
  state.stockMovements.push(movement);
}

function approveRecoveryPrice(state:State,payload:Action['payload'],now:string) {
  const movement=state.stockMovements.find(entry=>entry.id===payload.id);
  if(!movement||movementLoss(state,movement)<=0) throw Error('اختر حركة لها خسارة مخزون.');
  const source=getItem(state,movement.itemId);
  const key=regularProductKey(source);
  const batches=state.items.filter(item=>!item.gradeOf&&regularProductKey(item)===key&&isReceived(getContainer(state,item.containerId)));
  const available=batches.reduce((sum,item)=>sum+itemAvailable(state,item),0);
  const quantity=integer(payload.quantity,1);
  if(quantity>available) throw Error('كمية التغطية تتجاوز القطع السليمة المتاحة.');
  const pricing=recoveryPricing(state,movement,integer(payload.base,0),quantity);
  if(pricing.price<1||pricing.price>1e11) throw Error('راجع السعر المقترح.');
  for(const item of batches) item.price=pricing.price/100;
  movement.pricing={...pricing,approvedAt:now};
}

export function valuationEffect(before:State,after:State):ValuationEffect {
  const stockValue=(state:State)=>inventory(state).reduce((sum,group)=>
    sum+group.batches.reduce((value,batch)=>value+batch.quantity*batch.cost,0),0);
  const prior=report(before),next=report(after);
  return {stockValue:Math.round(stockValue(after)-stockValue(before)),
    salesCost:Math.round(next.cost-prior.cost),stockLoss:Math.round(next.loss-prior.loss)};
}

function changeDocument(state:State,containerId:string,payload:Action['payload'],now:string):ValuationDocument {
  const container=getContainer(state,containerId);
  const documentDate=date(payload.date||today());
  if(documentDate>today()||(isReceived(container)&&documentDate<container.receivedAt.slice(0,10))) {
    throw Error('اختر تاريخًا بين الاستلام واليوم.');
  }
  const reason=text(payload.reason,3000);
  if(!reason) throw Error('اكتب سبب التصحيح أو مرجع المستند.');
  return {id:uid(),containerId,date:documentDate,createdAt:now,reason,
    effect:{stockValue:0,salesCost:0,stockLoss:0}};
}

function changeCostSharing(state:State,payload:Action['payload'],now:string) {
  const root=getContainer(state,payload.id);
  if(root.parentId) throw Error('غيّر مشاركة المصاريف من الحاوية الأصلية.');
  if(typeof payload.enabled!=='boolean') throw Error('حدّد حالة مشاركة المصاريف.');
  const costs=familyCosts(state,root.id);
  if(!Array.isArray(payload.scopes)||payload.scopes.length!==costs.length) {
    throw Error('راجع نطاق جميع مصاريف المجموعة.');
  }
  const selected=new Map<string,Cost['scope']>();
  for(const row of payload.scopes) {
    if(!costs.some(cost=>cost.id===row.costId)||selected.has(row.costId)
      ||!['family','container'].includes(row.scope)) throw Error('نطاق مصروف غير صحيح أو مكرر.');
    selected.set(row.costId,row.scope);
  }
  const scopes=costs.map(cost=>({costId:cost.id,before:costScope(cost),
    after:cost.basis==='direct'?'container' as const:selected.get(cost.id)!}));
  const before=!!root.shareCosts;
  if(before===payload.enabled&&scopes.every(row=>row.before===row.after)) {
    throw Error('غيّر حالة المشاركة أو نطاق أحد المصاريف لمعاينة الأثر.');
  }
  const document=changeDocument(state,root.id,payload,now);
  root.shareCosts=payload.enabled;
  for(const cost of costs) cost.scope=scopes.find(row=>row.costId===cost.id)!.after;
  state.valuationChanges.push({...document,kind:'sharing',before,after:payload.enabled,scopes});
}

function correctReceipt(state:State,payload:Action['payload'],now:string) {
  const item=getItem(state,payload.itemId);
  if(item.gradeOf||!isReceived(getContainer(state,item.containerId))) {
    throw Error('اختر صنفًا أصليًا من دفعة مستلمة لتصحيح الكمية.');
  }
  const mode=payload.mode??'received';
  if(mode!=='received'&&mode!=='stock') throw Error('اختر إجمالي الاستلام أو الرصيد الفعلي.');
  const count=integer(payload.count);
  const before=item.received;
  const consumed=soldOf(state,item.id)+adjustedOut(state,item.id);
  const after=mode==='stock'?count+consumed:count;
  if(after===before) throw Error('الكمية مطابقة للرصيد المسجل.');
  if(after<consumed) throw Error('الكمية المصححة أقل من المبيعات والتسويات المسجلة على الدفعة.');
  if(after>1e7) throw Error('الكمية المصححة أكبر من المسموح.');
  const recovered=state.items.filter(row=>row.recoveryOf===item.id).reduce((sum,row)=>{
    const container=getContainer(state,row.containerId);
    return sum+(isReceived(container)?row.received+row.damaged:row.quantity);
  },0);
  if(recovered>Math.max(0,item.quantity-after-item.damaged)
    ||(item.recoveryOf&&after+item.damaged>item.quantity)) {
    throw Error('الكمية تتعارض مع كمية مصححة في ملحق الجرد. راجع سند الملحق أولًا.');
  }
  if(after===consumed&&additionalStockValue(state,item.id)>0.01) {
    throw Error('توجد مصاريف محملة على الرصيد المتبقي. راجع تسويتها قبل تصفير الرصيد.');
  }
  const purchaseAmount=Math.round(num(payload.purchaseAmount??0,0,1e12));
  if(purchaseAmount>0&&after<before) throw Error('قيمة الشراء الإضافية تتطلب زيادة في الكمية.');
  const document=changeDocument(state,item.containerId,payload,now);
  const latest=state.valuationChanges.filter(change=>change.kind==='receipt'&&change.itemId===item.id)
    .reduce((last,change)=>change.date>last?change.date:last,'');
  if(document.date<latest) throw Error('تاريخ التصحيح يسبق آخر تصحيح مسجل للصنف.');
  item.received=after;
  state.valuationChanges.push({...document,kind:'receipt',itemId:item.id,before,after,mode,count,purchaseAmount});
}

export function perform(previous:State,action:Action):State{
  const s:State=upgradeState(structuredClone(previous)),p=action.payload??{},now=new Date().toISOString();
  switch(action.type){
    case 'container.save': {
      const old=p.id?getContainer(s,p.id):null;
      if(old&&isReceived(old)) {
        old.name=text(p.name)||old.name;
        old.notes=text(p.notes,5000);
        old.supplier=text(p.supplier);
        old.eta=text(p.eta,10);
        break;
      }
      const cur=currency(p.currency||'ILS');
      const lastNumber=Math.max(0,...s.containers.filter(c=>!c.parentId)
        .map(c=>Number(/^CN-(\d+)$/.exec(c.code)?.[1])||0));
      const container:Container={
        id:old?.id||uid(),code:old?.code||'CN-'+String(lastNumber+1).padStart(3,'0'),
        name:text(p.name)||'حاوية جديدة',supplier:text(p.supplier),currency:cur,fx:rate(cur,p.fx),
        eta:p.eta?date(p.eta):'',notes:text(p.notes,5000),status:old?.status||'draft',
        createdAt:old?.createdAt||now,receivedAt:'',
      };
      if(old) Object.assign(old,container);
      else s.containers.push(container);
      break;
    }
    case 'container.annex':createAnnex(s,p,now);break;
    case 'container.sharing':changeCostSharing(s,p,now);break;
    case 'container.transit':{const c=getContainer(s,p.id);if(!['draft','transit'].includes(c.status))throw Error('الحاوية مستلمة بالفعل.');c.status='transit';break;}
    case 'container.delete': {
      const container=getContainer(s,p.id);
      if(isReceived(container)) throw Error('لا يمكن حذف حاوية مستلمة.');
      if(containerAnnexes(s,container.id).length) throw Error('احذف الملحقات المسودة قبل حذف ملف الحاوية.');
      s.containers=s.containers.filter(entry=>entry.id!==container.id);
      s.items=s.items.filter(item=>item.containerId!==container.id);
      s.costs=s.costs.filter(cost=>cost.containerId!==container.id);
      s.valuationChanges=s.valuationChanges.filter(change=>change.containerId!==container.id);
      break;
    }
    case 'items.add': {
      const container=getContainer(s,p.containerId);
      if(isReceived(container)) throw Error('إضافة الأصناف تكون قبل الاستلام. أضف سند ملحق للبضاعة اللاحقة.');
      if(!Array.isArray(p.items)||!p.items.length||p.items.length>1500) {
        throw Error('اختر من 1 إلى 1500 صنف في كل دفعة.');
      }
      const keys=new Set(batchItems(s,container.id).map(variant));
      for(const row of p.items) {
        const item=cleanItem(row,container);
        const key=variant(item);
        if(keys.has(key)) throw Error('صنف مكرر: '+item.model+' '+item.color+' '+item.size);
        keys.add(key);
        assignProductKey(s,item);
        s.items.push(item);
      }
      break;
    }
    case 'receipt.recover':recoverReceiptItem(s,p);break;
    case 'receipt.correct':correctReceipt(s,p,now);break;
    case 'item.save': {
      const old=getItem(s,p.id);
      const container=getContainer(s,old.containerId);
      if(isReceived(container)) throw Error('لتصحيح بيانات الصنف بعد الاستلام، افتح بطاقة الصنف.');
      if(old.recoveryOf) throw Error('أعد إدراج الكمية المصححة من سند الحاوية الأصلية.');
      const item=cleanItem(p,container);
      if(batchItems(s,container.id).some(entry=>entry.id!==old.id&&variant(entry)===variant(item))) {
        throw Error('الموديل واللون والمقاس موجودة مسبقًا.');
      }
      if(variant(old)===variant(item)) item.skuKey=old.skuKey;
      else assignProductKey(s,item,old.id);
      Object.assign(old,item,{id:old.id,skuKey:item.skuKey});
      break;
    }
    case 'item.details':saveProductDetails(s,p);break;
    case 'stock.record':recordStockMovement(s,p,now);break;
    case 'stock.recoveryPrice':approveRecoveryPrice(s,p,now);break;
    case 'item.delete':{const i=s.items.find(v=>v.id===p.id);if(!i)throw Error('الصنف غير موجود.');const c=getContainer(s,i.containerId);if(!['draft','transit'].includes(c.status))throw Error('لا يمكن حذف صنف بعد الاستلام.');if(s.costs.some(e=>e.target===i.id&&e.basis==='direct'))throw Error('احذف المصروف المخصص لهذا الصنف أولًا.');s.items=s.items.filter(v=>v.id!==i.id);break;}
    case 'prices.save':{if(!Array.isArray(p.items)||p.items.length>3000)throw Error('قائمة الأسعار غير صحيحة.');for(const row of p.items){const item=s.items.find(i=>i.id===row.id);if(!item)throw Error('صنف غير موجود.');item.price=num(row.price);}break;}
    case 'cost.save': {
      const container=getContainer(s,p.containerId);
      editable(container);
      const cur=currency(p.currency||'ILS');
      const old=p.id?s.costs.find(cost=>cost.id===p.id&&cost.containerId===container.id):undefined;
      if(p.id&&!old) throw Error('المصروف غير موجود.');
      if(old?.sourceCostId) throw Error('هذه حصة من مصروف الحاوية الأصلية. راجع سند تخصيص الحصة.');
      const basis=text(p.basis||'value') as Cost['basis'];
      if(!['value','quantity','volume','weight','direct'].includes(basis)) throw Error('اختر طريقة توزيع صحيحة.');
      const scope=p.scope??old?.scope??'family';
      if(!['family','container'].includes(scope)) throw Error('اختر نطاق توزيع المصروف.');
      if(basis==='direct'&&!batchItems(s,container.id).some(item=>item.id===p.target)) {
        throw Error('اختر الصنف الذي يتحمل المصروف.');
      }
      const cost:Cost={
        id:old?.id||uid(),containerId:container.id,name:text(p.name)||'مصروف وصول',
        amount:num(p.amount),currency:cur,fx:rate(cur,p.fx),basis,target:basis==='direct'?text(p.target):'',
        confirmed:p.confirmed===true,notes:text(p.notes,3000),
        scope:basis==='direct'?'container':scope,
      };
      const shares=s.costs.filter(entry=>entry.sourceCostId===cost.id);
      if(shares.length) {
        if(basis==='direct') throw Error('مصروف موزع على ملحقات يجب أن يبقى مصروفًا مشتركًا.');
        const total=shares.reduce((sum,share)=>sum+cents(share.amount*cost.fx),0);
        if(total>cents(cost.amount*cost.fx)) throw Error('مبلغ المصروف أقل من الحصص المحجوزة للملحقات.');
        for(const share of shares) {
          share.currency=cost.currency;
          share.fx=cost.fx;
          share.confirmed=cost.confirmed;
        }
      }
      if(old) Object.assign(old,cost);
      else s.costs.push(cost);
      break;
    }
    case 'cost.share':allocateSharedCost(s,p);break;
    case 'cost.delete': {
      const cost=s.costs.find(entry=>entry.id===p.id);
      if(!cost) throw Error('المصروف غير موجود.');
      const container=getContainer(s,cost.containerId);
      editable(container);
      if(s.costs.some(entry=>entry.sourceCostId===cost.id)) {
        throw Error('راجع الحصص المسجلة للملحقات قبل حذف المصروف المشترك.');
      }
      if(cost.sourceCostId&&isReceived(container)) {
        const source=s.costs.find(entry=>entry.id===cost.sourceCostId);
        if(source&&(cost.activateOnReceipt||getContainer(s,source.containerId).status==='final')) {
          throw Error('هذه الحصة أصبحت جزءًا من تصحيح تكلفة معتمد.');
        }
      }
      s.costs=s.costs.filter(entry=>entry.id!==cost.id);
      break;
    }
    case 'cost.templates':{const c=getContainer(s,p.containerId);editable(c);const defaults=[['مصاريف الصين والتجميع','value'],['الشحن البحري والتأمين','value'],['التخليص والرسوم والمناولة','value'],['النقل إلى المستودع','quantity']];for(const [name,basis] of defaults)if(!s.costs.some(e=>e.containerId===c.id&&e.name===name))s.costs.push({id:uid(),containerId:c.id,name,amount:0,currency:'ILS',fx:1,basis:basis as Cost['basis'],target:'',confirmed:false,notes:''});break;}
    case 'container.receive':receiveDocument(s,previous,p);break;
    case 'container.finalize': {
      const container=getContainer(s,p.id);
      if(container.status!=='received') throw Error('استلم الحاوية أولًا.');
      const costs=s.costs.filter(cost=>cost.containerId===container.id);
      if(costs.some(cost=>!cost.confirmed)) throw Error('حوّل جميع مصاريف الوصول إلى مبالغ مؤكدة قبل اعتماد التكلفة.');
      const hasCostLink=costs.some(cost=>cost.sourceCostId)||batchItems(s,container.id).some(item=>item.recoveryOf);
      if(container.parentId&&hasCostLink&&getContainer(s,container.parentId).status!=='final') {
        throw Error('اعتمد تكلفة الحاوية الأصلية أولًا لتثبيت حصة الملحق.');
      }
      const pendingShare=s.costs.some(share=>share.sourceCostId&&costs.some(cost=>cost.id===share.sourceCostId)
        &&!isReceived(getContainer(s,share.containerId)));
      if(pendingShare) throw Error('استلم الملحقات التي لها حصة من مصاريف الحاوية قبل اعتماد التكلفة.');
      const calculation=calculateContainer(s,container.id);
      if(!calculation.valid) throw Error(calculation.issues.join(' '));
      container.status='final';
      break;
    }
    case 'customer.save':{const old=p.id?s.customers.find(c=>c.id===p.id):undefined;if(p.id&&!old)throw Error('الزبون غير موجود.');const phone=text(p.phone,50),name=text(p.name);if(!name)throw Error('اسم الزبون مطلوب.');if(phone&&s.customers.some(c=>c.id!==old?.id&&c.phone===phone))throw Error('رقم الجوال مستخدم لزبون آخر.');const c:Customer={id:old?.id||uid(),name,phone,address:text(p.address,400),notes:text(p.notes,3000),opening:p.opening!==undefined?Math.round(num(p.opening,-1e9,1e9)):old?.opening||0};if(old)Object.assign(old,c);else s.customers.push(c);break;}
    case 'sale.create': {
      if(!Array.isArray(p.lines)||!p.lines.length||p.lines.length>150) throw Error('أضف أصناف الفاتورة، بحد 150 سطرًا.');
      const customer=getOrCreateCustomer(s,p);
      const saleDate=date(p.date||today());
      const lines:SaleLine[]=[];
      const used=new Map<string,number>();
      for(const raw of p.lines) {
        const quantity=integer(raw.quantity,1);
        const price=num(raw.price,.01);
        const key=text(raw.key,1200);
        const {item,allocations}=allocateSaleStock(s,key,quantity,saleDate,used);
        lines.push({key,model:item.model,name:item.name,color:item.color,size:item.size,
          quantity,price,gross:cents(quantity*price),net:0,allocations});
      }
      const gross=lines.reduce((sum,line)=>sum+line.gross,0);
      const discount=Math.round(num(p.discount||0,0,gross));
      const parts=split(discount,lines.map(line=>line.gross));
      lines.forEach((line,index)=>line.net=line.gross-parts[index]);
      const total=gross-discount;
      const paid=Math.round(num(p.paid??total,0,total));
      const method=text(p.method||'cash');
      if(!['cash','bank','card','credit'].includes(method)) throw Error('اختر طريقة الدفع.');
      if(method==='credit'&&paid!==0) throw Error('للبيع الآجل اجعل المدفوع صفرًا.');
      s.sales.push({
        id:uid(),number:nextInvoiceNumber(s.sales),date:saleDate,
        customerId:customer.id,lines,discount,total,paid,method:method as Sale['method'],
        delivery:Math.round(num(p.delivery||0)),notes:text(p.notes,4000),createdAt:now,voided:false,voidReason:'',
      });
      break;
    }
    case 'sale.void':{const sale=s.sales.find(v=>v.id===p.id);if(!sale||sale.voided)throw Error('الفاتورة غير موجودة أو ملغاة.');if(!text(p.reason))throw Error('اكتب سبب الإلغاء.');if(sale.paid>0&&p.refunded!==true)throw Error('أكد تسوية المبلغ المدفوع مع الزبون قبل الإلغاء.');sale.voided=true;sale.voidReason=text(p.reason,1000);break;}
    case 'payment.create':{if(!s.customers.some(c=>c.id===p.customerId))throw Error('اختر الزبون.');const method=text(p.method||'cash');if(!['cash','bank','card'].includes(method))throw Error('اختر وسيلة قبض فعلية.');s.payments.push({id:uid(),date:date(p.date||today()),customerId:text(p.customerId),amount:Math.round(num(p.amount,1)),method,notes:text(p.notes,3000)});break;}
    case 'expense.create':{s.operatingExpenses.push({id:uid(),date:date(p.date||today()),amount:Math.round(num(p.amount,1)),category:text(p.category)||'أخرى',notes:text(p.notes,3000)});break;}
    case 'settings.save':{s.settings={name:text(p.name)||'تاجر',phone:text(p.phone,60),address:text(p.address,400),margin:num(p.margin??30,0,95),invoiceFooter:text(p.invoiceFooter,500)};break;}
    default:throw Error('العملية غير معروفة.');
  }
  valuationCache.delete(s);
  unitCostCache.delete(s);
  soldQuantityCache.delete(s);
  stockBalanceCache.delete(s);
  if(action.type==='container.sharing'||action.type==='receipt.correct') {
    s.valuationChanges.at(-1)!.effect=valuationEffect(previous,s);
  }
  for(const container of s.containers.filter(isReceived)) {
    const calculation=calculateContainer(s,container.id);
    if(!calculation.valid) throw Error(calculation.issues.join(' '));
  }
  s.revision=previous.revision+1;
  return s;
}
