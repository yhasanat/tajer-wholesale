import type {State} from './domain.ts';
import {emptyState, currencies, variant, calculateContainer, cents, adjustedOut,
  itemGroupKey, regularProductKey, isReceived, itemReceiptDate, additionalStockValue,
  sharedCostRemaining} from './domain.ts';

export type BackupFile={format:'tajer-backup';version:4;app:'tajer-github-pages';exportedAt:string;demo:boolean;state:State};
export type BackupSummary={containers:number;items:number;sales:number;customers:number;payments:number;annexes:number;movements:number};
const collections=['containers','items','costs','customers','sales','payments','operatingExpenses','stockMovements','valuationChanges'] as const;
function ensure(ok:unknown,message:string):asserts ok{if(!ok)throw Error('النسخة الاحتياطية غير صالحة: '+message);}
function obj(v:unknown,label:string):Record<string,any>{ensure(v&&typeof v==='object'&&!Array.isArray(v),label+' مفقود');return v as Record<string,any>;}
function str(v:unknown,label:string,required=false){ensure(typeof v==='string'&&v.length<=15000&&(!required||v.trim().length>0),label+' غير صحيح');}
function numeric(v:unknown,label:string,min=0,whole=false){ensure(typeof v==='number'&&Number.isFinite(v)&&v>=min&&Math.abs(v)<=Number.MAX_SAFE_INTEGER&&(!whole||Number.isSafeInteger(v)),label+' غير صحيح');}
function isoDate(v:unknown,label:string){str(v,label,true);const text=v as string,t=Date.parse(text+'T12:00:00Z');ensure(/^\d{4}-\d{2}-\d{2}$/.test(text)&&Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===text,label+' غير صحيح');}
function currency(v:Record<string,any>,label:string){ensure(currencies.includes(v.currency),label+' يحتوي عملة غير معروفة');numeric(v.fx,label+' / سعر التحويل',.000001);ensure(v.currency!=='ILS'||v.fx===1,'تحويل الشيكل إلى نفسه يجب أن يساوي 1');}
export function backupSummary(state:State):BackupSummary {
  return {containers:state.containers.filter(container=>!container.parentId).length,
    items:state.items.length,sales:state.sales.length,customers:state.customers.length,
    payments:state.payments.length,annexes:state.containers.filter(container=>container.parentId).length,
    movements:(state.stockMovements?.length??0)+(state.valuationChanges?.length??0)};
}
export function makeBackup(state:State,demo=false):BackupFile{return {format:'tajer-backup',version:4,app:'tajer-github-pages',exportedAt:new Date().toISOString(),demo,state:structuredClone(state)};}
export function parseBackup(input:string|unknown){let raw:unknown=input;if(typeof input==='string'){ensure(input.length<=25*1024*1024,'حجم الملف أكبر من المسموح');try{raw=JSON.parse(input);}catch{throw Error('الملف ليس نسخة JSON صالحة. اختر نسخة احتياطية صادرة من برنامج تاجر.');}}
  const root=obj(raw,'الملف');
  ensure(root.format==='tajer-backup'&&[1,2,3,4].includes(root.version),'اختر نسخة احتياطية صادرة من برنامج تاجر');
  if(root.version>=3) ensure(Array.isArray(obj(root.state,'البيانات').stockMovements),'سجل حركات المخزون مفقود');
  if(root.version===4) ensure(Array.isArray(obj(root.state,'البيانات').valuationChanges),'سجل تصحيح الكميات ومشاركة المصاريف مفقود');
  const state=validateState(root.state);
  return {state,exportedAt:typeof root.exportedAt==='string'?root.exportedAt:'',demo:root.demo===true,summary:backupSummary(state)};
}
export function validateState(value:unknown):State{
  const raw=obj(value,'البيانات'),state=emptyState();
  for(const key of collections){
    if((key==='stockMovements'||key==='valuationChanges')&&raw[key]===undefined) continue;
    ensure(Array.isArray(raw[key])&&raw[key].length<=150000,'قائمة '+key+' غير صحيحة');
    (state[key] as any[])=structuredClone(raw[key]);
  }
  numeric(raw.revision,'رقم المراجعة',0,true);state.revision=raw.revision;
  const settings=obj(raw.settings,'إعدادات المنشأة');
  for(const key of ['name','phone','address','invoiceFooter'])str(settings[key],'إعداد '+key);
  numeric(settings.margin,'هامش الربح');ensure(settings.margin<=95,'هامش الربح أكبر من 95%');
  state.settings={name:settings.name,phone:settings.phone,address:settings.address,margin:settings.margin,invoiceFooter:settings.invoiceFooter};
  for(const key of collections){const ids=new Set<string>();for(const record of state[key]){obj(record,key);str(record.id,'معرّف السجل',true);ensure(!ids.has(record.id),'معرّف مكرر في '+key);ids.add(record.id);}}
  const containers=new Map(state.containers.map(c=>[c.id,c])),items=new Map(state.items.map(i=>[i.id,i])),customers=new Set(state.customers.map(c=>c.id)),variants=new Set<string>(),sold=new Map<string,number>();
  for(const c of state.containers){for(const key of ['code','name','supplier','eta','notes','createdAt','receivedAt'] as const)str(c[key],'الحاوية / '+key,key==='code'||key==='name');currency(c,'الحاوية');ensure(['draft','transit','received','final'].includes(c.status),'حالة الحاوية غير معروفة');if(c.eta)isoDate(c.eta,'الوصول المتوقع');if(['received','final'].includes(c.status))isoDate(c.receivedAt.slice(0,10),'تاريخ الاستلام');}
  for(const container of state.containers) {
    if(container.shareCosts!==undefined) ensure(!container.parentId&&typeof container.shareCosts==='boolean','إعداد مشاركة المصاريف غير صحيح');
    if(container.parentId!==undefined) {
      str(container.parentId,'مرجع الحاوية الأصلية',true);
      const parent=containers.get(container.parentId);
      ensure(parent&&!parent.parentId&&parent.id!==container.id,'ملحق مرتبط بحاوية أصلية غير صحيحة');
      ensure(container.annexKind==='addition'||container.annexKind==='correction','نوع ملحق غير معروف');
      isoDate(container.documentDate,'تاريخ سند الملحق');
      if(isReceived(container)) {
        ensure(isReceived(parent)&&container.receivedAt>=parent.receivedAt,'تاريخ استلام ملحق غير صحيح');
      }
      if(container.annexKind==='correction') ensure(isReceived(parent),'تصحيح مرتبط بحاوية قادمة');
    } else ensure(container.annexKind===undefined,'نوع ملحق بدون حاوية أصلية');
    if(container.correctionEffect!==undefined) {
      ensure(container.annexKind==='correction'&&isReceived(container),'أثر تصحيح غير مرتبط بسند مستلم');
      const effect=obj(container.correctionEffect,'أثر التصحيح');
      numeric(effect.salesCost,'فرق تكلفة المبيعات',-Number.MAX_SAFE_INTEGER,true);
      numeric(effect.stockLoss,'فرق خسارة المخزون',-Number.MAX_SAFE_INTEGER,true);
    }
  }
  const productKeys=new Map<string,string>();
  const productVariants=new Map<string,string>();
  const recovered=new Map<string,number>();
  for(const i of state.items){
    const c=containers.get(i.containerId);ensure(c,'الصنف مرتبط بحاوية مفقودة');
    for(const key of ['model','name','color','size','barcode','notes'] as const)str(i[key],'الصنف / '+key,key==='model'||key==='name');
    numeric(i.quantity,'عدد القطع',1,true);numeric(i.received,'عدد القطع السليمة',0,true);numeric(i.damaged,'عدد القطع التالفة',0,true);
    for(const key of ['purchase','volume','weight','price'] as const)numeric(i[key],'الصنف / '+key);currency(i,'الصنف');
    ensure(Number.isSafeInteger(cents(i.quantity*i.purchase*i.fx)),'قيمة شراء الصنف أكبر من المسموح');
    if(i.skuKey!==undefined) str(i.skuKey,'معرّف الصنف',true);
    if(i.gradeOf!==undefined) str(i.gradeOf,'مرجع حركة الدرجة الثانية',true);
    if(!i.gradeOf) {
      const key=i.containerId+'::'+variant(i);
      ensure(!variants.has(key),'موديل ولون ومقاس مكررة في الحاوية');
      variants.add(key);
      const identity=regularProductKey(i);
      const attributes=variant(i);
      ensure(!productKeys.has(identity)||productKeys.get(identity)===attributes,'معرّف صنف له مواصفات مختلفة');
      ensure(!productVariants.has(attributes)||productVariants.get(attributes)===identity,'صنف مكرر بمعرّفين مختلفين');
      productKeys.set(identity,attributes);
      productVariants.set(attributes,identity);
    }
    if(i.recoveryOf!==undefined) {
      str(i.recoveryOf,'مرجع صنف التصحيح',true);
      const source=items.get(i.recoveryOf);
      ensure(c.annexKind==='correction'&&source&&source.containerId===c.parentId&&!source.gradeOf
        &&!i.gradeOf&&i.purchase===0&&regularProductKey(i)===regularProductKey(source),'صنف تصحيح غير مرتبط بالدفعة الأصلية');
      ensure(i.received+i.damaged<=i.quantity,'كمية استرداد أكبر من السند');
      const count=isReceived(c)?i.received+i.damaged:i.quantity;
      recovered.set(source.id,(recovered.get(source.id)??0)+count);
    }
    if(['draft','transit'].includes(c.status))ensure(i.received===0&&i.damaged===0,'أصناف قادمة تحتوي كميات مستلمة');
  }
  for(const [id,count] of recovered) {
    const item=items.get(id)!;
    ensure(count<=Math.max(0,item.quantity-item.received-item.damaged),'كمية مستردة أكبر من فرق الجرد');
  }
  for(const e of state.costs){ensure(containers.has(e.containerId),'مصروف مرتبط بحاوية مفقودة');str(e.name,'اسم المصروف',true);str(e.notes,'ملاحظات المصروف');str(e.target,'هدف المصروف');numeric(e.amount,'مبلغ المصروف');currency(e,'المصروف');ensure(Number.isSafeInteger(cents(e.amount*e.fx)),'قيمة مصروف أكبر من المسموح');ensure(['value','quantity','volume','weight','direct'].includes(e.basis),'طريقة توزيع غير معروفة');ensure(typeof e.confirmed==='boolean','حالة المصروف غير صحيحة');if(e.basis==='direct')ensure(items.get(e.target)?.containerId===e.containerId,'مصروف مباشر مرتبط بصنف مفقود');}
  const costs=new Map(state.costs.map(cost=>[cost.id,cost]));
  for(const cost of state.costs) {
    if(cost.scope!==undefined) ensure(cost.scope==='family'||cost.scope==='container','نطاق مصروف غير معروف');
    if(cost.basis==='direct'&&cost.scope!==undefined) ensure(cost.scope==='container','مصروف مباشر بنطاق مشترك');
  }
  const receipts=new Map<string,number>();
  const receiptDates=new Map<string,string>();
  const sharing=new Map<string,boolean>();
  const purchaseAdjustments=new Map<string,number>();
  for(const change of state.valuationChanges) {
    const container=containers.get(change.containerId);
    ensure(container,'سند تصحيح مرتبط بحاوية مفقودة');
    isoDate(change.date,'تاريخ سند التصحيح');
    str(change.createdAt,'وقت سند التصحيح',true);
    str(change.reason,'سبب سند التصحيح',true);
    const effect=obj(change.effect,'أثر سند التصحيح');
    for(const key of ['stockValue','salesCost','stockLoss']) numeric(effect[key],'أثر التصحيح / '+key,-Number.MAX_SAFE_INTEGER,true);
    if(change.kind==='sharing') {
      ensure(!container.parentId&&typeof change.before==='boolean'&&typeof change.after==='boolean','سند مشاركة مصاريف غير صحيح');
      ensure(!sharing.has(container.id)||sharing.get(container.id)===change.before,'تسلسل مشاركة المصاريف غير متسق');
      sharing.set(container.id,change.after);
      ensure(Array.isArray(change.scopes),'نطاقات مصاريف السند مفقودة');
      const scopeIds=new Set<string>();
      for(const row of change.scopes) {
        obj(row,'نطاق مصروف');str(row.costId,'مرجع نطاق المصروف',true);
        ensure(!scopeIds.has(row.costId)&&['family','container'].includes(row.before)&&['family','container'].includes(row.after),'نطاق مصروف مكرر أو غير صحيح');
        scopeIds.add(row.costId);
      }
    } else {
      ensure(change.kind==='receipt','نوع سند تصحيح غير معروف');
      const item=items.get(change.itemId);
      ensure(item&&!item.gradeOf&&item.containerId===container.id&&isReceived(container),'تصحيح كمية مرتبط بصنف غير صحيح');
      ensure(change.date>=container.receivedAt.slice(0,10),'تصحيح كمية مؤرخ قبل الاستلام');
      for(const key of ['before','after','count','purchaseAmount'] as const) numeric(change[key],'تصحيح الكمية / '+key,0,true);
      ensure(change.before!==change.after&&change.before<=1e7&&change.after<=1e7,'كميات تصحيح غير صحيحة');
      ensure(change.mode==='received'||change.mode==='stock','نوع جرد غير صحيح');
      ensure(change.mode==='received'?change.count===change.after:change.after>=change.count&&change.before-change.after+change.count>=0,'الرصيد الفعلي لا يطابق التصحيح');
      ensure(change.purchaseAmount===0||change.after>change.before,'قيمة شراء إضافية بدون زيادة كمية');
      ensure(!receipts.has(item.id)||receipts.get(item.id)===change.before,'تسلسل تصحيح الكمية غير متسق');
      ensure(change.date>=(receiptDates.get(item.id)??''),'تاريخ تصحيح كمية غير متسلسل');
      receipts.set(item.id,change.after);receiptDates.set(item.id,change.date);
      purchaseAdjustments.set(item.id,(purchaseAdjustments.get(item.id)??0)+change.purchaseAmount);
    }
  }
  for(const [id,count] of receipts) ensure(items.get(id)!.received===count,'رصيد الاستلام لا يطابق آخر تصحيح');
  for(const [id,enabled] of sharing) ensure(!!containers.get(id)!.shareCosts===enabled,'حالة المشاركة لا تطابق آخر سند');
  for(const [id,amount] of purchaseAdjustments) {
    const item=items.get(id)!;
    ensure(Number.isSafeInteger(cents(item.quantity*item.purchase*item.fx)+amount),'قيمة شراء مصححة أكبر من المسموح');
  }
  const sharedSources=new Set<string>();
  for(const share of state.costs) {
    if(share.sourceCostId===undefined) continue;
    str(share.sourceCostId,'مرجع المصروف المشترك',true);
    const source=costs.get(share.sourceCostId);
    const annex=containers.get(share.containerId)!;
    ensure(source&&!source.sourceCostId&&source.basis!=='direct'&&annex.parentId===source.containerId,'حصة ملحق بمصدر تكلفة غير صحيح');
    ensure(share.basis==='quantity'&&share.currency===source.currency&&share.fx===source.fx
      &&share.confirmed===source.confirmed&&cents(share.amount*share.fx)>0,'حصة ملحق لا تطابق مصروفها المشترك');
    ensure(typeof share.activateOnReceipt==='boolean','حالة تفعيل حصة الملحق غير صحيحة');
    if(share.activateOnReceipt) ensure(annex.annexKind==='correction','حصة مؤجلة بدون سند تصحيح');
    sharedSources.add(source.id);
  }
  for(const id of sharedSources) ensure(sharedCostRemaining(state,costs.get(id)!)>=0,'حصص الملحقات تتجاوز المصروف المشترك');
  const gradeMovements=new Map<string,string>();
  const priorExtra=new Map<string,number>();
  for(const movement of state.stockMovements) {
    const item=items.get(movement.itemId);
    ensure(item&&isReceived(containers.get(item.containerId)),'حركة مخزون مرتبطة بدفعة غير مستلمة');
    ensure(['damage','missing','grade','cost'].includes(movement.kind),'نوع حركة مخزون غير معروف');
    numeric(movement.quantity,'كمية الحركة',1,true);
    ensure(movement.quantity<=item.received,'كمية حركة أكبر من الكمية المستلمة');
    str(movement.createdAt,'وقت تسجيل الحركة',true);
    str(movement.reason,'سبب حركة المخزون',true);
    isoDate(movement.date,'تاريخ حركة المخزون');
    ensure(movement.date>=itemReceiptDate(state,item),'حركة مؤرخة قبل استلام الدفعة');
    numeric(movement.extraUnitCost,'تكلفة الحركة الإضافية');
    const before=priorExtra.get(item.id)??0;
    ensure(movement.extraUnitCost<=before+1e-6,'تكلفة حركة المخزون غير متسقة');
    if(movement.kind==='cost') {
      ensure(!item.gradeOf,'مصروف وصول محمل على دفعة درجة ثانية');
      numeric(movement.amount,'مبلغ مصروف الرصيد',1,true);
      priorExtra.set(item.id,before+movement.amount!/movement.quantity);
    }
    if(movement.kind==='grade') {
      str(movement.outputItemId,'مرجع دفعة الدرجة الثانية',true);
      numeric(movement.netUnitValue,'صافي قيمة القطعة التالفة',1,true);
      const output=items.get(movement.outputItemId!);
      ensure(!item.gradeOf&&output&&output.gradeOf===movement.id&&output.containerId===item.containerId
        &&output.received===movement.quantity&&output.quantity===movement.quantity&&output.purchase===0
        &&regularProductKey(output)===regularProductKey(item),'دفعة درجة ثانية لا تطابق حركة الفرز');
      gradeMovements.set(output.id,movement.id);
    }
    if(movement.pricing!==undefined) {
      const pricing=obj(movement.pricing,'تعويض الخسارة');
      ensure(movement.kind!=='cost','تعويض خسارة على سند مصروف');
      for(const key of ['base','perPiece','quantity','total','price']) numeric(pricing[key],'تعويض الخسارة / '+key,key==='quantity'?1:0,true);
      ensure(pricing.total===pricing.perPiece*pricing.quantity&&pricing.price===pricing.base+pricing.perPiece,'حساب التعويض غير صحيح');
      str(pricing.approvedAt,'تاريخ اعتماد سعر التعويض',true);
    }
  }
  for(const item of state.items) {
    if(item.gradeOf) ensure(gradeMovements.get(item.id)===item.gradeOf,'دفعة درجة ثانية بدون حركة فرز');
  }
  for(const c of state.customers){for(const key of ['name','phone','address','notes'] as const)str(c[key],'الزبون / '+key,key==='name');numeric(c.opening,'الرصيد الافتتاحي',-Number.MAX_SAFE_INTEGER,true);}
  for(const sale of state.sales){
    ensure(customers.has(sale.customerId),'فاتورة مرتبطة بزبون مفقود');str(sale.number,'رقم الفاتورة',true);isoDate(sale.date,'تاريخ الفاتورة');str(sale.createdAt,'وقت الفاتورة',true);str(sale.notes,'ملاحظات الفاتورة');str(sale.voidReason,'سبب الإلغاء');ensure(typeof sale.voided==='boolean','حالة الفاتورة غير صحيحة');
    ensure(['cash','bank','card','credit'].includes(sale.method),'طريقة دفع غير معروفة');for(const key of ['discount','total','paid','delivery'] as const)numeric(sale[key],'الفاتورة / '+key,0,true);ensure(sale.paid<=sale.total,'المدفوع يتجاوز قيمة الفاتورة');ensure(sale.method!=='credit'||sale.paid===0,'فاتورة آجلة تحتوي مبلغًا مدفوعًا');
    ensure(Array.isArray(sale.lines)&&sale.lines.length>0&&sale.lines.length<=150,'بنود الفاتورة غير صحيحة');let net=0,gross=0;
    for(const line of sale.lines){obj(line,'بند الفاتورة');for(const key of ['key','model','name','color','size'] as const)str(line[key],'بند الفاتورة / '+key,key==='key'||key==='model'||key==='name');numeric(line.quantity,'كمية البيع',1,true);numeric(line.price,'سعر البيع',.000001);numeric(line.net,'صافي السطر',0,true);numeric(line.gross,'إجمالي السطر',0,true);ensure(line.gross===cents(line.quantity*line.price)&&line.net<=line.gross,'حساب بند الفاتورة غير متطابق');ensure(Array.isArray(line.allocations)&&line.allocations.length>0,'مصادر البضاعة المباعة مفقودة');let allocated=0;
      for(const a of line.allocations){
        obj(a,'دفعة البيع');
        const item=items.get(a.itemId);
        ensure(item,'فاتورة مرتبطة بصنف مفقود');
        ensure(itemGroupKey(item)===line.key,'موديل الفاتورة لا يطابق دفعة البضاعة');
        const container=containers.get(item.containerId)!;
        ensure(isReceived(container),'تم بيع بضاعة غير مستلمة');
        if(container.parentId||item.gradeOf) ensure(sale.date>=itemReceiptDate(state,item),'تاريخ البيع يسبق استلام الدفعة');
        numeric(a.quantity,'كمية دفعة البيع',1,true);
        if(a.extraUnitCost!==undefined) {
          numeric(a.extraUnitCost,'مصروف الرصيد للقطعة المبيعة');
          ensure(a.extraUnitCost<=(priorExtra.get(item.id)??0)+1e-6,'مصروف الفاتورة أكبر من تكاليف الدفعة');
        }
        allocated+=a.quantity;
        if(!sale.voided) sold.set(a.itemId,(sold.get(a.itemId)??0)+a.quantity);
      }
      ensure(allocated===line.quantity,'مصادر الكمية لا تطابق عدد القطع المباعة');net+=line.net;gross+=line.gross;
    }
    ensure(net===sale.total&&gross-sale.discount===sale.total,'إجمالي الفاتورة لا يطابق بنودها');
  }
  for(const item of state.items) {
    const remaining=item.received-(sold.get(item.id)??0)-adjustedOut(state,item.id);
    ensure(remaining>=0,'مبيعات أو تسويات تتجاوز المخزون المستلم');
    const extra=additionalStockValue(state,item.id);
    ensure(extra>=-0.01&&(remaining>0||extra<0.01),'رصيد مصاريف الدفعة غير متسق');
  }
  for(const p of state.payments){ensure(customers.has(p.customerId),'دفعة مرتبطة بزبون مفقود');isoDate(p.date,'تاريخ الدفعة');numeric(p.amount,'مبلغ الدفعة',1,true);ensure(['cash','bank','card'].includes(p.method),'وسيلة قبض غير معروفة');str(p.notes,'ملاحظات الدفعة');}
  for(const e of state.operatingExpenses){isoDate(e.date,'تاريخ المصروف');numeric(e.amount,'مبلغ المصروف',1,true);str(e.category,'فئة المصروف',true);str(e.notes,'ملاحظات المصروف');}
  for(const c of state.containers)if(['received','final'].includes(c.status)){const calc=calculateContainer(state,c.id);ensure(calc.valid,calc.issues.join(' '));if(c.status==='final')ensure(!state.costs.some(e=>e.containerId===c.id&&!e.confirmed),'حاوية معتمدة تحتوي مصروفًا غير مؤكد');}
  return state;
}
