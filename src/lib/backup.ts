import type {State} from './domain.ts';
import {emptyState, currencies, variant, calculateContainer, cents} from './domain.ts';

export type BackupFile={format:'tajer-backup';version:2;app:'tajer-github-pages';exportedAt:string;demo:boolean;state:State};
export type BackupSummary={containers:number;items:number;sales:number;customers:number;payments:number};
const collections=['containers','items','costs','customers','sales','payments','operatingExpenses'] as const;
function ensure(ok:unknown,message:string):asserts ok{if(!ok)throw Error('النسخة الاحتياطية غير صالحة: '+message);}
function obj(v:unknown,label:string):Record<string,any>{ensure(v&&typeof v==='object'&&!Array.isArray(v),label+' مفقود');return v as Record<string,any>;}
function str(v:unknown,label:string,required=false){ensure(typeof v==='string'&&v.length<=15000&&(!required||v.trim().length>0),label+' غير صحيح');}
function numeric(v:unknown,label:string,min=0,whole=false){ensure(typeof v==='number'&&Number.isFinite(v)&&v>=min&&Math.abs(v)<=Number.MAX_SAFE_INTEGER&&(!whole||Number.isSafeInteger(v)),label+' غير صحيح');}
function isoDate(v:unknown,label:string){str(v,label,true);const text=v as string,t=Date.parse(text+'T12:00:00Z');ensure(/^\d{4}-\d{2}-\d{2}$/.test(text)&&Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===text,label+' غير صحيح');}
function currency(v:Record<string,any>,label:string){ensure(currencies.includes(v.currency),label+' يحتوي عملة غير معروفة');numeric(v.fx,label+' / سعر التحويل',.000001);ensure(v.currency!=='ILS'||v.fx===1,'تحويل الشيكل إلى نفسه يجب أن يساوي 1');}
export function backupSummary(state:State):BackupSummary{return{containers:state.containers.length,items:state.items.length,sales:state.sales.length,customers:state.customers.length,payments:state.payments.length};}
export function makeBackup(state:State,demo=false):BackupFile{return {format:'tajer-backup',version:2,app:'tajer-github-pages',exportedAt:new Date().toISOString(),demo,state:structuredClone(state)};}
export function parseBackup(input:string|unknown){let raw:unknown=input;if(typeof input==='string'){ensure(input.length<=25*1024*1024,'حجم الملف أكبر من المسموح');try{raw=JSON.parse(input);}catch{throw Error('الملف ليس نسخة JSON صالحة. اختر نسخة احتياطية صادرة من برنامج تاجر.');}}
  const root=obj(raw,'الملف');ensure(root.format==='tajer-backup'&&(root.version===1||root.version===2),'اختر نسخة احتياطية صادرة من برنامج تاجر');const state=validateState(root.state);return {state,exportedAt:typeof root.exportedAt==='string'?root.exportedAt:'',demo:root.demo===true,summary:backupSummary(state)};
}
export function validateState(value:unknown):State{
  const raw=obj(value,'البيانات'),state=emptyState();
  for(const key of collections){ensure(Array.isArray(raw[key])&&raw[key].length<=150000,'قائمة '+key+' غير صحيحة');(state[key] as any[])=structuredClone(raw[key]);}
  numeric(raw.revision,'رقم المراجعة',0,true);state.revision=raw.revision;
  const settings=obj(raw.settings,'إعدادات المنشأة');
  for(const key of ['name','phone','address','invoiceFooter'])str(settings[key],'إعداد '+key);
  numeric(settings.margin,'هامش الربح');ensure(settings.margin<=95,'هامش الربح أكبر من 95%');
  state.settings={name:settings.name,phone:settings.phone,address:settings.address,margin:settings.margin,invoiceFooter:settings.invoiceFooter};
  for(const key of collections){const ids=new Set<string>();for(const record of state[key]){obj(record,key);str(record.id,'معرّف السجل',true);ensure(!ids.has(record.id),'معرّف مكرر في '+key);ids.add(record.id);}}
  const containers=new Map(state.containers.map(c=>[c.id,c])),items=new Map(state.items.map(i=>[i.id,i])),customers=new Set(state.customers.map(c=>c.id)),variants=new Set<string>(),sold=new Map<string,number>();
  for(const c of state.containers){for(const key of ['code','name','supplier','eta','notes','createdAt','receivedAt'] as const)str(c[key],'الحاوية / '+key,key==='code'||key==='name');currency(c,'الحاوية');ensure(['draft','transit','received','final'].includes(c.status),'حالة الحاوية غير معروفة');if(c.eta)isoDate(c.eta,'الوصول المتوقع');if(['received','final'].includes(c.status))isoDate(c.receivedAt.slice(0,10),'تاريخ الاستلام');}
  for(const i of state.items){
    const c=containers.get(i.containerId);ensure(c,'الصنف مرتبط بحاوية مفقودة');
    for(const key of ['model','name','color','size','barcode','notes'] as const)str(i[key],'الصنف / '+key,key==='model'||key==='name');
    numeric(i.quantity,'عدد القطع',1,true);numeric(i.received,'عدد القطع السليمة',0,true);numeric(i.damaged,'عدد القطع التالفة',0,true);
    for(const key of ['purchase','volume','weight','price'] as const)numeric(i[key],'الصنف / '+key);currency(i,'الصنف');
    ensure(Number.isSafeInteger(cents(i.quantity*i.purchase*i.fx)),'قيمة شراء الصنف أكبر من المسموح');
    const key=i.containerId+'::'+variant(i);ensure(!variants.has(key),'موديل ولون ومقاس مكررة في الحاوية');variants.add(key);
    if(['draft','transit'].includes(c.status))ensure(i.received===0&&i.damaged===0,'أصناف قادمة تحتوي كميات مستلمة');
  }
  for(const e of state.costs){ensure(containers.has(e.containerId),'مصروف مرتبط بحاوية مفقودة');str(e.name,'اسم المصروف',true);str(e.notes,'ملاحظات المصروف');str(e.target,'هدف المصروف');numeric(e.amount,'مبلغ المصروف');currency(e,'المصروف');ensure(Number.isSafeInteger(cents(e.amount*e.fx)),'قيمة مصروف أكبر من المسموح');ensure(['value','quantity','volume','weight','direct'].includes(e.basis),'طريقة توزيع غير معروفة');ensure(typeof e.confirmed==='boolean','حالة المصروف غير صحيحة');if(e.basis==='direct')ensure(items.get(e.target)?.containerId===e.containerId,'مصروف مباشر مرتبط بصنف مفقود');}
  for(const c of state.customers){for(const key of ['name','phone','address','notes'] as const)str(c[key],'الزبون / '+key,key==='name');numeric(c.opening,'الرصيد الافتتاحي',-Number.MAX_SAFE_INTEGER,true);}
  for(const sale of state.sales){
    ensure(customers.has(sale.customerId),'فاتورة مرتبطة بزبون مفقود');str(sale.number,'رقم الفاتورة',true);isoDate(sale.date,'تاريخ الفاتورة');str(sale.createdAt,'وقت الفاتورة',true);str(sale.notes,'ملاحظات الفاتورة');str(sale.voidReason,'سبب الإلغاء');ensure(typeof sale.voided==='boolean','حالة الفاتورة غير صحيحة');
    ensure(['cash','bank','card','credit'].includes(sale.method),'طريقة دفع غير معروفة');for(const key of ['discount','total','paid','delivery'] as const)numeric(sale[key],'الفاتورة / '+key,0,true);ensure(sale.paid<=sale.total,'المدفوع يتجاوز قيمة الفاتورة');ensure(sale.method!=='credit'||sale.paid===0,'فاتورة آجلة تحتوي مبلغًا مدفوعًا');
    ensure(Array.isArray(sale.lines)&&sale.lines.length>0&&sale.lines.length<=150,'بنود الفاتورة غير صحيحة');let net=0,gross=0;
    for(const line of sale.lines){obj(line,'بند الفاتورة');for(const key of ['key','model','name','color','size'] as const)str(line[key],'بند الفاتورة / '+key,key==='key'||key==='model'||key==='name');numeric(line.quantity,'كمية البيع',1,true);numeric(line.price,'سعر البيع',.000001);numeric(line.net,'صافي السطر',0,true);numeric(line.gross,'إجمالي السطر',0,true);ensure(line.gross===cents(line.quantity*line.price)&&line.net<=line.gross,'حساب بند الفاتورة غير متطابق');ensure(Array.isArray(line.allocations)&&line.allocations.length>0,'مصادر البضاعة المباعة مفقودة');let allocated=0;
      for(const a of line.allocations){obj(a,'دفعة البيع');const item=items.get(a.itemId);ensure(item,'فاتورة مرتبطة بصنف مفقود');ensure(variant(item)===line.key,'موديل الفاتورة لا يطابق دفعة البضاعة');ensure(['received','final'].includes(containers.get(item.containerId)!.status),'تم بيع بضاعة غير مستلمة');numeric(a.quantity,'كمية دفعة البيع',1,true);allocated+=a.quantity;if(!sale.voided)sold.set(a.itemId,(sold.get(a.itemId)||0)+a.quantity);}
      ensure(allocated===line.quantity,'مصادر الكمية لا تطابق عدد القطع المباعة');net+=line.net;gross+=line.gross;
    }
    ensure(net===sale.total&&gross-sale.discount===sale.total,'إجمالي الفاتورة لا يطابق بنودها');
  }
  for(const [id,quantity] of sold)ensure(quantity<=items.get(id)!.received,'مبيعات تتجاوز المخزون المستلم');
  for(const p of state.payments){ensure(customers.has(p.customerId),'دفعة مرتبطة بزبون مفقود');isoDate(p.date,'تاريخ الدفعة');numeric(p.amount,'مبلغ الدفعة',1,true);ensure(['cash','bank','card'].includes(p.method),'وسيلة قبض غير معروفة');str(p.notes,'ملاحظات الدفعة');}
  for(const e of state.operatingExpenses){isoDate(e.date,'تاريخ المصروف');numeric(e.amount,'مبلغ المصروف',1,true);str(e.category,'فئة المصروف',true);str(e.notes,'ملاحظات المصروف');}
  for(const c of state.containers)if(['received','final'].includes(c.status)){const calc=calculateContainer(state,c.id);ensure(calc.valid,calc.issues.join(' '));if(c.status==='final')ensure(!state.costs.some(e=>e.containerId===c.id&&!e.confirmed),'حاوية معتمدة تحتوي مصروفًا غير مؤكد');}
  return state;
}
