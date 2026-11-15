'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type FormEvent, type InputHTMLAttributes } from 'react';
import { Container as ContainerIcon, ReceiptText, Boxes, ChartNoAxesCombined, Plus, ArrowLeft, ArrowRight, X, Search, Settings as SettingsIcon, Download, Upload, RefreshCw, ChevronLeft, ChevronDown, Pencil, Trash2, Check, CheckCheck, Ship, PackageCheck, Calculator, Tags, ClipboardCheck, FileSpreadsheet, Printer, CircleHelp, LogOut, Wallet, Users, HandCoins, NotebookPen, MoreHorizontal, CircleAlert, CheckCircle2, Package, Minus, LoaderCircle, ArrowUpRight, CalendarDays, ShieldCheck, Landmark, Eye, EyeOff, CopyPlus } from 'lucide-react';
import { Action, State, Container, Item, Cost, Customer, Sale, Currency, emptyState, today, money, cents, qty, uid, calculateContainer, inventory, saleCost, customerBalance, report, statusLabels, basisLabels, paymentLabels, currencies, perform, createdEntityId, batchItems, containerAnnexes, calculateContainerFamily, isReceived, itemGroupKey, costAllocatedToBatch, remainingShortage, sharedCostRemaining, saleLineCost, stockJournal, movementLoss, itemReceiptDate, recoveryPricing, regularProductKey, stockMovementLabels, previewSaleLineCost, availableSaleStock, type StockMovement } from '../lib/domain';
import { demoState } from '../lib/demo';
import {sampleWorkbookFile} from '../lib/sample-workbook';
import {makeBackup,parseBackup,backupSummary} from '../lib/backup';
import {getLocalStore,ConflictError,type Snapshot} from '../lib/local-store';
import { automaticMapping, importFields, ImportField, parseCSV, previewRows, readSpreadsheet, csvDownload, download } from '../lib/imports';

import { showInstallButton, subscribeInstall, installTajer, installationInstructions } from '../lib/install';

import { defaultProductSearch, normalizeSearch, productMatcher, productSearchColumns, type ProductSearchOptions } from '../lib/product-search';
import { invoiceDraftFromSale, draftQuantities, type InvoiceDraftLine } from '../lib/invoice-draft';

type WarehouseModal={kind:'annex';parent:Container}|{kind:'sharedCost';annex:Container}|{kind:'recoverReceipt';annex:Container}
  |{kind:'details';item:Item}|{kind:'adjust';key:string;movementKind?:'cost'}|{kind:'journal';key:string}|{kind:'recoveryPrice';movement:StockMovement};
type Page='containers'|'sales'|'inventory'|'reports';
type Modal={kind:'container';value?:Container}|{kind:'item';value?:Item}|{kind:'cost';value?:Cost}|{kind:'import'}|{kind:'customer';value?:Customer}|{kind:'payment';customerId?:string}|{kind:'expense'}|{kind:'settings'}|{kind:'statement';customer:Customer}|{kind:'sale';sale:Sale}|{kind:'invoiceTemplate'}|{kind:'receive'}|{kind:'finalize'}|{kind:'void';sale:Sale}|{kind:'delete';type:string;id:string;title:string}|{kind:'stockprice';key:string}|{kind:'backup'}|{kind:'install'}|WarehouseModal;
type PrintTarget={kind:'container';id:string}|{kind:'sale';id:string}|{kind:'statement';id:string};
const NAV=[{key:'containers' as Page,label:'الحاويات',sub:'من الشراء إلى الوصول',icon:ContainerIcon},{key:'sales' as Page,label:'بيع سريع',sub:'فواتير ودفعات',icon:ReceiptText},{key:'inventory' as Page,label:'المخزون',sub:'الأصناف المتاحة للبيع',icon:Boxes},{key:'reports' as Page,label:'الحسابات والتقارير',sub:'الربح والذمم',icon:ChartNoAxesCombined}];
const currencyNames:Record<Currency,string>={ILS:'شيكل ₪',USD:'دولار $',CNY:'يوان ¥',JOD:'دينار',EUR:'يورو €'};
const bySearch=(values:unknown[],search:string)=>normalizeSearch(values.join(' ')).includes(normalizeSearch(search));
function Field({label,children,wide=false,hint}:{label:string;children:ReactNode;wide?:boolean;hint?:string}){return <label className={'field'+(wide?' field-wide':'')}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
function Panel({title,icon,action,children,className=''}:{title?:ReactNode;icon?:ReactNode;action?:ReactNode;children:ReactNode;className?:string}){return <section className={'panel '+className}>{(title||action)&&<div className="panel-head"><h3>{icon}{title}</h3>{action}</div>}{children}</section>;}
function Stat({label,value,note,icon}:{label:string;value:ReactNode;note?:string;icon:ReactNode}){return <div className="stat"><div className="stat-top"><span>{label}</span>{icon}</div><strong>{value}</strong>{note&&<small>{note}</small>}</div>;}
function Badge({status,label}:{status?:string;label?:string}){return <span className={'badge badge-'+(status||'neutral')}><span className="status-dot"/>{label||statusLabels[status as keyof typeof statusLabels]||status}</span>;}
function Empty({icon,title,text,action}:{icon:ReactNode;title:string;text:string;action?:ReactNode}){return <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action&&<div className="actions">{action}</div>}</div>;}
function DataTable({headers,rows,empty='لا توجد بيانات لعرضها.',rowDetail}:{
  headers:string[];rows:ReactNode[][];empty?:string;rowDetail?:{index:number;content:ReactNode};
}){
  if(!rows.length)return <div className="empty-small">{empty}</div>;
  return <div className="table-wrap">
    <table className="data-table">
      <thead><tr>{headers.map((header,index)=><th key={index}>{header}</th>)}</tr></thead>
      <tbody>{rows.map((row,index)=><Fragment key={index}>
        <tr>{row.map((value,column)=><td key={column} data-label={headers[column]}>{value}</td>)}</tr>
        {rowDetail?.index===index&&<tr className="table-detail-row"><td colSpan={headers.length}>{rowDetail.content}</td></tr>}
      </Fragment>)}</tbody>
    </table>
  </div>;
}
function ItemName({item}:{item:Pick<Item,'model'|'name'|'color'|'size'>}){return <div className="item-name"><span className="model-code">{item.model}</span><strong>{item.name}</strong><small>{[item.color,item.size].filter(Boolean).join(' · ')||'بدون تفريعات'}</small></div>;}
function MoneyInput({value,onChange,id,min=0,required=false}:{value:string|number;onChange:(s:string)=>void;id?:string;min?:number;required?:boolean}){return <div className="money-input"><input id={id} type="number" inputMode="decimal" min={min} step="0.01" value={value} onChange={e=>onChange(e.target.value)} required={required}/><span>₪</span></div>;}
function CurrencySelect({value,onChange}:{value:Currency;onChange:(v:Currency)=>void}){return <select value={value} onChange={e=>onChange(e.target.value as Currency)}>{currencies.map(c=><option key={c} value={c}>{currencyNames[c]}</option>)}</select>;}
function ErrorNote({children}:{children:ReactNode}){return <div className="notice notice-error" role="alert"><CircleAlert size={18}/><span>{children}</span></div>;}
function Notice({children}:{children:ReactNode}){return <div className="notice"><CircleHelp size={18}/><span>{children}</span></div>;}

export default function TajerApp(){
  const [state,setState]=useState<State>(emptyState),[page,setPage]=useState<Page>('containers'),[selected,setSelected]=useState(''),[containerTab,setContainerTab]=useState('items'),[reportTab,setReportTab]=useState('profits'),[salesTab,setSalesTab]=useState('new');
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[connected,setConnected]=useState(false),[demo,setDemo]=useState(false),[error,setError]=useState(''),[toast,setToast]=useState(''),[modal,setModal]=useState<Modal|null>(null),[modalError,setModalError]=useState('');
  const [search,setSearch]=useState(''),[containerSearch,setContainerSearch]=useState(''),[stockSearch,setStockSearch]=useState(''),[historySearch,setHistorySearch]=useState(''),[customerSearch,setCustomerSearch]=useState('');
  const [stockSearchOptions,setStockSearchOptions]=useState(defaultProductSearch);
  const [salesSearchOptions,setSalesSearchOptions]=useState(defaultProductSearch);
  const [visibleSalesCount,setVisibleSalesCount]=useState(6);
  const [costLine,setCostLine]=useState<string|null>(null);
  const [cart,setCart]=useState<InvoiceDraftLine[]>([]),[customerId,setCustomerId]=useState(''),[newCustomerName,setNewCustomerName]=useState(''),[saleDate,setSaleDate]=useState(today),[method,setMethod]=useState('cash'),[partial,setPartial]=useState(false),[paidInput,setPaidInput]=useState(''),[discount,setDiscount]=useState(''),[delivery,setDelivery]=useState(''),[saleNotes,setSaleNotes]=useState('');
  const [sourceInvoice,setSourceInvoice]=useState('');
  const [from,setFrom]=useState(''),[to,setTo]=useState(''),[priceDraft,setPriceDraft]=useState<Record<string,string>>({}),[margin,setMargin]=useState('30'),[allowance,setAllowance]=useState('0'),[printTarget,setPrintTarget]=useState<PrintTarget|null>(null);
  const [canShowInstall,setCanShowInstall]=useState(showInstallButton);
  useEffect(()=>subscribeInstall(()=>setCanShowInstall(showInstallButton())),[]);
  const pending=useRef<{key:string;id:string}|null>(null),stateRef=useRef(state),demoRef=useRef(demo),busy=useRef(false);
  stateRef.current=state;demoRef.current=demo;
  const refresh=useCallback(async()=>{
    if(demoRef.current||busy.current)return;
    try{const state=await getLocalStore().load();if(demoRef.current)return;setState(state);setConnected(true);setError('');}
    catch(e){if(!demoRef.current){setConnected(false);setError(e instanceof Error?e.message:'تعذّر فتح تخزين البرنامج.');}}finally{setLoading(false);}
  },[]);
  useEffect(()=>{refresh();const onFocus=()=>refresh();window.addEventListener('focus',onFocus);const unsubscribe=getLocalStore().subscribe(onFocus);return()=>{window.removeEventListener('focus',onFocus);unsubscribe();};},[refresh]);
  useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(t);}},[toast]);
  useEffect(()=>{setPriceDraft({});},[selected]);
  const open=(m:Modal)=>{setModalError('');setModal(m);};
  const close=()=>{if(!saving){setModal(null);setModalError('');}};
  async function mutate(action:Action,message='تم الحفظ على هذا الجهاز'){
    if(busy.current)throw Error('انتظر اكتمال العملية الحالية.');
    setModalError('');setError('');setSaving(true);busy.current=true;
    try{
      let next:State,entityId:string|undefined;
      if(demoRef.current){next=perform(stateRef.current,action);entityId=createdEntityId(stateRef.current,next,action.type);}
      else{
        if(!connected)throw Error('تخزين المتصفح غير جاهز. أعد فتح البرنامج في نافذة عادية.');
        const key=JSON.stringify(action);if(pending.current?.key!==key)pending.current={key,id:uid()};
        const result=await getLocalStore().mutate(stateRef.current.revision,pending.current.id,action);
        next=result.state;entityId=result.entityId;
      }
      setState(next);pending.current=null;setToast(demoRef.current?'تم التحديث في المثال التجريبي':message);return Object.assign({},next,{savedEntityId:entityId});
    }catch(e){if(e instanceof ConflictError){setState(e.state);pending.current=null;}const message=e instanceof Error?e.message:'لم تُحفظ العملية.';setModalError(message);setError(message);throw e;}
    finally{setSaving(false);busy.current=false;}
  }
  function startDemo(){setDemo(true);setState(demoState());setConnected(true);setError('');setLoading(false);setSelected('');resetInvoiceDraft();setPage('containers');setModal(null);}
  function exitDemo(){demoRef.current=false;setDemo(false);setState(emptyState());setSelected('');resetInvoiceDraft();setModal(null);setLoading(true);refresh();}
  function changeSaleSearch(value:string){setSearch(value);setVisibleSalesCount(6);}
  function resetInvoiceDraft(){
    setCart([]);setSourceInvoice('');setCostLine(null);
    setCustomerId('');setNewCustomerName('');
    setDiscount('');setDelivery('');setSaleNotes('');setPartial(false);setPaidInput('');
    changeSaleSearch('');
  }
  function navigate(p:Page){setPage(p);changeSaleSearch('');setCostLine(null);}
  function openContainer(id:string,tab='items'){setSelected(id);setContainerTab(tab);setPage('containers');}
  const current=state.containers.find(c=>c.id===selected),calc=current?calculateContainer(state,current.id):null,stock=useMemo(()=>inventory(state),[state]),totals=useMemo(()=>report(state,from,to),[state,from,to]);
  const templateStock=useMemo(()=>sourceInvoice?availableSaleStock(state,saleDate):null,[sourceInvoice,state,saleDate]);
  const quantities=useMemo(()=>draftQuantities(cart),[cart]);
  const hasShortage=templateStock!==null&&[...quantities].some(([key,requested])=>requested>(templateStock.get(key)??0));
  const saleStock=useMemo(()=>stock.filter(group=>(templateStock?templateStock.get(group.key)??0:group.quantity)>0),[stock,templateStock]);
  const visibleStock=useMemo(()=>{
    const matches=productMatcher(stockSearch,stockSearchOptions);
    return stock.filter(group=>group.batches.some(batch=>matches(batch.item)));
  },[stock,stockSearch,stockSearchOptions]);
  const matchingSales=useMemo(()=>{
    const matches=productMatcher(search,salesSearchOptions);
    return saleStock.filter(group=>group.batches.some(batch=>batch.quantity>0&&matches(batch.item)));
  },[saleStock,search,salesSearchOptions]);
  const gross=cart.reduce((n,l)=>n+cents(l.quantity*l.price),0),discountCents=cents(Number(discount)||0),saleTotal=Math.max(0,gross-discountCents),paid=method==='credit'?0:partial?cents(Number(paidInput)||0):saleTotal;
  const disabled=saving||(!demo&&!connected)||loading;
  function addToCart(key:string){
    const group=stock.find(entry=>entry.key===key);
    if(disabled||!group)return;
    const available=templateStock?templateStock.get(key)??0:group.quantity;
    const id=uid();
    setCart(rows=>{
      if((draftQuantities(rows).get(key)??0)>=available)return rows;
      const existing=rows.find(line=>line.key===key);
      return existing
        ? rows.map(line=>line.id===existing.id?{...line,quantity:line.quantity+1}:line)
        : [...rows,{id,key,quantity:1,price:group.price}];
    });
  }
  function usePreviousInvoice(id:string){
    if(disabled||busy.current)return;
    const invoice=stateRef.current.sales.find(sale=>sale.id===id&&!sale.voided);
    if(!invoice){setModalError('اختر فاتورة سارية من سجل المبيعات.');return;}
    const draft=invoiceDraftFromSale(invoice);
    resetInvoiceDraft();
    setCart(draft.lines);
    setCustomerId(draft.customerId);
    setSaleDate(today());
    setMethod('cash');
    setSourceInvoice(invoice.number);
    setError('');
    setSalesTab('new');
    close();
  }
  function print(target:PrintTarget){setPrintTarget(target);setTimeout(()=>window.print(),120);}
  function backup(){download('tajer-backup-'+today()+'.json',new Blob([JSON.stringify(makeBackup(state,demo),null,2)],{type:'application/json'}));setToast('جُهزت النسخة الاحتياطية للتنزيل. احتفظ بها خارج المتصفح.');}
  async function restoreData(imported:State){
    if(busy.current)return;setSaving(true);busy.current=true;setModalError('');setError('');
    try{const result=demoRef.current?{state:{...structuredClone(imported),revision:stateRef.current.revision+1}}:await getLocalStore().restore(imported,stateRef.current.revision);setState(result.state);setSelected('');resetInvoiceDraft();setPage('containers');setModal(null);setToast(demoRef.current?'استُعيدت البيانات داخل المثال التجريبي فقط.':'تمت استعادة البيانات. احتُفظ بلقطة داخلية للبيانات السابقة.');}
    catch(e){if(e instanceof ConflictError)setState(e.state);const message=e instanceof Error?e.message:'تعذّرت الاستعادة؛ بقيت بياناتك السابقة محفوظة.';setModalError(message);}
    finally{setSaving(false);busy.current=false;}
  }
  async function saveInvoice(printAfter=false){
    try{
      if(hasShortage)throw Error('عدّل البنود التي تتجاوز المخزون المتاح قبل الحفظ.');
      if(discountCents>gross)throw Error('الخصم أكبر من قيمة الفاتورة.');
      const lines=cart.map(({key,quantity,price})=>({key,quantity,price}));
      const next=await mutate({type:'sale.create',payload:{customerId,customerName:newCustomerName,date:saleDate,lines,discount:discountCents,paid,method,delivery:cents(Number(delivery)||0),notes:saleNotes}},'حُفظت الفاتورة وحُدّث المخزون ورصيد الزبون.');
      const sale=next.sales.find(s=>s.id===next.savedEntityId)||next.sales[next.sales.length-1];resetInvoiceDraft();setSalesTab('history');
      if(printAfter)print({kind:'sale',id:sale.id});else open({kind:'sale',sale});
    }catch(e){if(e instanceof Error)setError(e.message);}
  }
  function exportContainer(){
    if(!current)return;
    const family=calculateContainerFamily(state,current.id);
    csvDownload(current.code+'-costing.csv',[['السند','رقم الموديل','اسم الصنف','اللون','المقاس','عدد القطع','شراء القطعة بالشيكل','تكلفة الشراء','مصاريف محملة','التكلفة الكلية','تكلفة القطعة واصلة','سعر البيع المقترح','المبيعات المتوقعة','الربح المتوقع','ملاحظات'],...family.rows.map(r=>[r.batchCode,r.item.model,r.item.name,r.item.color,r.item.size,r.count,r.item.purchase*r.item.fx,r.base/100,r.allocated/100,r.total/100,r.unit/100,r.item.price,r.revenue/100,r.profit/100,r.item.notes])]);
  }
  function exportReport(){csvDownload('tajer-sales-'+today()+'.csv',[['التاريخ','الفاتورة','الزبون','الموديل','الصنف','الكمية','سعر البيع','صافي السطر','تكلفة السطر','الربح الإجمالي','طريقة الدفع','ملاحظات'],...totals.sales.flatMap(sale=>sale.lines.map(l=>{const cost=saleLineCost(state,l);return [sale.date,sale.number,state.customers.find(c=>c.id===sale.customerId)?.name||'',l.model,l.name,l.quantity,l.price,l.net/100,cost/100,(l.net-cost)/100,paymentLabels[sale.method],sale.notes];}))]);}

  function containersPage(){
    if(current&&calc)return containerDetail();
    const roots=state.containers.filter(c=>!c.parentId);
    const incoming=state.containers.filter(c=>!isReceived(c)),calculations=incoming.map(c=>calculateContainer(state,c.id));
    const incomingFamilies=new Set(incoming.map(c=>c.parentId||c.id));
    return <><PageHeader eyebrow="إدارة الاستيراد" title="الحاويات" description="كشف البضاعة وتكلفتها وتسعيرها… في ملف واحد." action={<button className="button primary" disabled={disabled} onClick={()=>open({kind:'container'})}><Plus/>حاوية جديدة</button>}/>
      <div className="stats-grid"><Stat icon={<Ship/>} label="حاويات قادمة" value={qty(incomingFamilies.size)} note="قيد التجهيز أو في الطريق"/><Stat icon={<Package/>} label="قطع في الحاويات القادمة" value={qty(calculations.reduce((n,c)=>n+c.quantity,0))} note="منفصلة عن المخزون المتاح"/><Stat icon={<Calculator/>} label="تكلفة الوصول المتوقعة" value={calculations.some(c=>!c.valid)?'تحتاج مراجعة':money(calculations.reduce((n,c)=>n+c.total,0))} note="بالشيكل · قبل اعتماد التكلفة"/></div>
      {!state.containers.length?<div className="welcome-panel"><div className="welcome-copy"><span className="eyebrow">بداية مرتبة، وحسابات أوضح</span><h2>ابدأ من حاويتك القادمة.</h2><p>أضف كشف الموديلات، وزّع المصاريف، واعرف تكلفة القطعة وسعر بيعها قبل وصول البضاعة.</p><div className="welcome-steps"><span><b>1</b>كشف الأصناف</span><span><b>2</b>تكلفة الوصول</span><span><b>3</b>التسعير والبيع</span></div><div className="actions"><button className="button primary" disabled={disabled} onClick={()=>open({kind:'container'})}><Plus/>إضافة أول حاوية</button><button className="button" onClick={startDemo}>استعراض مثال تجريبي<ArrowLeft/></button></div></div><div className="welcome-art" aria-hidden="true"><div className="art-grid"/><div className="art-ship"><ContainerIcon/><span>من الصين إلى مخزنك</span></div><div className="art-label"><CheckCircle2/>تكلفة واضحة لكل قطعة</div></div></div>:<>
      <div className="section-toolbar"><h2>ملفات الحاويات <span className="count">{roots.length}</span></h2><SearchBox value={containerSearch} onChange={setContainerSearch} placeholder="ابحث باسم الحاوية أو المورد"/></div>
      <div className="container-grid">{roots.filter(c=>bySearch([c.name,c.code,c.supplier,...containerAnnexes(state,c.id).flatMap(a=>[a.name,a.code])],containerSearch)).slice().reverse().map(c=>{const v=calculateContainerFamily(state,c.id);return <button key={c.id} className="container-card" onClick={()=>openContainer(c.id)}><div className="container-card-top"><span className="container-icon"><ContainerIcon/></span><Badge status={c.status}/></div><span className="container-code">{c.code}</span><h3>{c.name}</h3><p>{c.supplier||'لم يحدد المورد'}</p><div className="container-card-values"><div><span>عدد القطع</span><strong>{qty(v.quantity)}</strong></div><div><span>إجمالي تكلفة الوصول</span><strong>{v.valid?money(v.total):'تحتاج مراجعة'}</strong></div></div><div className="container-card-bottom"><span>{v.rows.length} أصناف{v.calculations.length>1?' · '+(v.calculations.length-1)+' ملحق':''}{c.eta?' · وصول متوقع '+c.eta:''}</span><ArrowLeft size={18}/></div></button>;})}</div>
      </>}
    </>;
  }
  function containerDetail(){if(!current||!calc)return null;const c=current,v=calc,items=batchItems(state,c.id),costs=state.costs.filter(e=>e.containerId===c.id),editable=!isReceived(c);
    const parent=state.containers.find(entry=>entry.id===c.parentId);
    const annexes=containerAnnexes(state,c.id);
    const family=containerTab==='annexes'?calculateContainerFamily(state,c.id):null;
    const sourceCosts=state.costs.filter(cost=>cost.containerId===parent?.id&&!cost.sourceCostId&&cost.basis!=='direct'&&sharedCostRemaining(state,cost)>0);
    const canShare=!!parent&&editable&&sourceCosts.length>0&&(parent.status!=='final'||c.annexKind==='correction');
    return <><button className="back-link" onClick={()=>parent?openContainer(parent.id,'annexes'):setSelected('')}><ArrowRight size={16}/>{parent?'العودة إلى ملحقات '+parent.code:'جميع الحاويات'}</button><PageHeader eyebrow={c.code+' / '+(c.supplier||'ملف الحاوية')} title={c.name} description={parent?[c.annexKind==='correction'?'تصحيح جرد':'بضاعة ملحقة',c.documentDate,c.eta&&'وصول متوقع '+c.eta].filter(Boolean).join(' · '):c.eta?'الوصول المتوقع '+c.eta:'كشف الحاوية ومصاريفها وأسعارها'} action={<div className="actions"><button className="icon-button" aria-label="تعديل بيانات الحاوية" disabled={disabled} onClick={()=>open({kind:'container',value:c})}><Pencil/></button><button className="button" onClick={exportContainer}><Download/>تصدير</button><button className="icon-button" aria-label="طباعة كشف الحاوية" onClick={()=>print({kind:'container',id:c.id})}><Printer/></button>{parent&&editable&&<button className="icon-button danger-text" aria-label="حذف الملحق" disabled={disabled} onClick={()=>open({kind:'delete',type:'container.delete',id:c.id,title:'حذف الملحق '+c.name})}><Trash2 size={16}/></button>}</div>}/>
      <div className="container-banner"><div><ContainerIcon/><div><strong>{statusLabels[c.status]}</strong><span>{['draft','transit'].includes(c.status)?'الأصناف في الطريق؛ ستدخل المخزون بعد الاستلام.':c.status==='received'?'يمكن البيع من هذه الحاوية؛ ربحها تقديري حتى اعتماد التكلفة.':'تكلفة الوصول معتمدة ومحفوظة لكل دفعة.'}</span></div></div><div className="actions">{c.status==='draft'&&<button className="button light" disabled={disabled} onClick={()=>mutate({type:'container.transit',payload:{id:c.id}}).catch(()=>{})}><Ship/>تحديد «في الطريق»</button>}{c.status==='received'&&<button className="button light" disabled={disabled} onClick={()=>open({kind:'finalize'})}><ShieldCheck/>اعتماد التكلفة النهائية</button>}</div></div>
      <div className="stats-grid"><Stat icon={<Package/>} label={editable?'عدد القطع المتوقع':'القطع السليمة المستلمة'} value={qty(v.quantity)}/><Stat icon={<Calculator/>} label="إجمالي تكلفة الوصول" value={v.valid?money(v.total):'غير مكتملة'} note={'شراء '+money(v.base)+' + مصاريف '+money(v.extra)}/><Stat icon={<ChartNoAxesCombined/>} label="الربح الإجمالي المتوقع" value={v.valid?money(v.profit):'غير مكتمل'} note="عند بيع الكمية بالسعر المقترح"/></div>
      <div className="tabs container-tabs" role="tablist" aria-label="تفاصيل الحاوية">{[{id:'items',label:'الأصناف',icon:Boxes},{id:'costs',label:'التكاليف',icon:Calculator},{id:'pricing',label:'التسعير',icon:Tags},{id:'receive',label:'الاستلام',icon:ClipboardCheck},...(!parent?[{id:'annexes',label:'ملحقات الحاوية',icon:Package}]:[])].map(t=><button key={t.id} role="tab" aria-selected={containerTab===t.id} className={containerTab===t.id?'active':''} onClick={()=>setContainerTab(t.id)}><t.icon size={18}/>{t.label}{t.id==='items'&&<span className="tab-count">{items.length}</span>}</button>)}</div>
      {!v.valid&&<ErrorNote>{v.issues.join(' ')}</ErrorNote>}
      {c.correctionEffect&&<Notice>أثر تصحيح الجرد عند اعتماده · فرق تكلفة المبيعات {money(c.correctionEffect.salesCost)} · فرق خسارة الاستلام والمخزون {money(c.correctionEffect.stockLoss)}.</Notice>}
      {family&&!parent&&<><Panel title="ملحقات الحاوية" icon={<Package/>} action={<button className="button primary small" disabled={disabled} onClick={()=>open({kind:'annex',parent:c})}><Plus/>إضافة ملحق</button>}>
        <DataTable headers={['السند','النوع','التاريخ','الحالة','القطع','التكلفة','']} rows={annexes.map(annex=>{
          const detail=calculateContainer(state,annex.id);
          return [<div key="name"><strong>{annex.name}</strong><small className="muted block">{annex.code}</small></div>,annex.annexKind==='correction'?'تصحيح جرد':'بضاعة ملحقة',annex.documentDate||'—',<Badge key="status" status={annex.status}/>,qty(detail.quantity),detail.valid?money(detail.total):'تحتاج مراجعة',<button key="open" className="button small" onClick={()=>openContainer(annex.id)}>فتح الملحق<ArrowLeft size={16}/></button>];
        })} empty="أضف سندًا مستقلًا للبضاعة الملحقة أو لتصحيح صنف سقط من الجرد."/>
      </Panel>
      {annexes.length>0&&<Panel title="كشف الأصناف في الحاوية وملحقاتها" icon={<Boxes/>}>
        <DataTable headers={['السند','الموديل والصنف','الكمية','الحالة','تكلفة الصنف']} rows={family.rows.map(row=>{
          const batch=state.containers.find(container=>container.id===row.item.containerId);
          return [row.batchCode,<ItemName key={row.item.id} item={row.item}/>,qty(row.count),isReceived(batch)?'سليم مستلم':'متوقع',money(row.total)];
        })}/>
      </Panel>}</>}
      {containerTab==='items'&&<Panel title="كشف الأصناف" icon={<Boxes/>} action={editable&&<div className="actions"><button className="button small" disabled={disabled} onClick={()=>open({kind:'import'})}><Upload/>استيراد ملف</button><button className="button primary small" disabled={disabled} onClick={()=>open({kind:'item'})}><Plus/>إضافة صنف</button>{c.annexKind==='correction'&&<button className="button small" disabled={disabled} onClick={()=>open({kind:'recoverReceipt',annex:c})}>كمية من الجرد السابق</button>}</div>}>
        <DataTable headers={['الموديل والصنف','الكمية','شراء القطعة','إجمالي الشراء','تكلفة القطعة واصلة','']} rows={v.rows.map(r=>[<ItemName key={r.item.id} item={r.item}/>,qty(r.item.quantity),<div key="buy">{qty(r.item.purchase)} {currencyNames[r.item.currency]}{r.item.currency!=='ILS'&&<small className="muted block">صرف: {r.item.fx}</small>}</div>,money(r.base),v.valid?money(r.unit):'—',<div className="row-actions" key="actions">{r.item.notes&&<span className="note-marker" title={r.item.notes}><NotebookPen size={16}/></span>}{!r.item.recoveryOf||!editable?<button className="icon-button" aria-label={'تعديل '+r.item.model} disabled={disabled} onClick={()=>open(editable?{kind:'item',value:r.item}:{kind:'details',item:r.item})}><Pencil size={16}/></button>:null}{editable&&<><button className="icon-button danger-text" aria-label={'حذف '+r.item.model} disabled={disabled} onClick={()=>open({kind:'delete',type:'item.delete',id:r.item.id,title:'حذف الصنف '+r.item.model})}><Trash2 size={16}/></button></>}</div>])} empty="أضف الأصناف يدويًا أو استورد كشف Excel / CSV."/>
      </Panel>}
      {containerTab==='costs'&&<>
        <Panel title="مصاريف الوصول" icon={<Calculator/>} action={c.status!=='final'&&<div className="actions"><button className="button small" disabled={disabled} onClick={()=>mutate({type:'cost.templates',payload:{containerId:c.id}}).catch(()=>{})}>البنود الشائعة</button><button className="button primary small" disabled={disabled} onClick={()=>open({kind:'cost'})}><Plus/>مصروف</button>{canShare&&<button className="button small" disabled={disabled} onClick={()=>open({kind:'sharedCost',annex:c})}>حصة من مصروف الحاوية</button>}</div>}>
          <DataTable headers={['البند','المبلغ الأصلي','المحمّل على السند','التوزيع حسب','الحالة','']} rows={costs.map(e=>[<div key="name"><strong>{e.name}</strong>{e.notes&&<small className="muted block">{e.notes}</small>}</div>,qty(e.amount)+' '+currencyNames[e.currency],<div key="allocation">{money(costAllocatedToBatch(state,e))}{e.activateOnReceipt&&editable&&<small className="muted block">يُحمّل عند الاستلام</small>}</div>,basisLabels[e.basis]+(e.target?' · '+(items.find(i=>i.id===e.target)?.model||''):''),<Badge key="status" status={e.confirmed?'final':'draft'} label={e.confirmed?'مؤكد':'تقديري'}/>,c.status!=='final'?<div key="actions" className="row-actions">{!e.sourceCostId&&<button className="icon-button" aria-label={'تعديل '+e.name} disabled={disabled} onClick={()=>open({kind:'cost',value:e})}><Pencil size={16}/></button>}<button className="icon-button danger-text" aria-label={'حذف '+e.name} disabled={disabled} onClick={()=>open({kind:'delete',type:'cost.delete',id:e.id,title:'حذف المصروف '+e.name})}><Trash2 size={16}/></button></div>:<ShieldCheck key="locked" size={16} className="muted"/>])} empty="أضف مصاريف الصين والشحن والتخليص والنقل، أو ابدأ بالبنود الشائعة."/>
        </Panel><Panel title="توزيع المصاريف على الأصناف"><DataTable headers={['الموديل','قيمة الشراء','المصاريف المحملة','إجمالي التكلفة','تكلفة القطعة']} rows={v.rows.map(r=>[<ItemName key={r.item.id} item={r.item}/>,money(r.base),v.valid?money(r.allocated):'—',v.valid?money(r.total):'—',v.valid?money(r.unit):'—'])}/></Panel>
        <Notice>اختَر طريقة توزيع كل مصروف حسب بياناته. المصروف الخاص بصنف يُحمّل عليه مباشرة. مصاريف التوزيع للزبائن تُسجّل لاحقًا ضمن مصاريف البيع.</Notice>
      </>}
      {containerTab==='pricing'&&<>
        <Panel title="اقتراح أسعار الجملة" icon={<Tags/>}><div className="pricing-controls"><Field label="هامش مستهدف من سعر البيع %"><input type="number" min="0" max="95" value={margin} onChange={e=>setMargin(e.target.value)}/></Field><Field label="مصاريف بيع متوقعة للقطعة"><MoneyInput value={allowance} onChange={setAllowance}/></Field><button className="button" disabled={disabled||!v.valid||!items.length} onClick={()=>{const m=Number(margin),a=Number(allowance);if(m<0||m>=100||!Number.isFinite(m)||!Number.isFinite(a)||a<0){setError('راجع الهامش والمصاريف المتوقعة.');return;}const draft:Record<string,string>={};v.rows.forEach(r=>draft[r.item.id]=String(Math.ceil((r.unit/100+a)/(1-m/100)*2-1e-9)/2));setPriceDraft(draft);setToast('حُسبت الأسعار المقترحة. راجعها ثم اضغط حفظ الأسعار.');}}><Calculator/>حساب الأسعار</button><button className="button primary" disabled={disabled||!Object.keys(priceDraft).length} onClick={async()=>{try{await mutate({type:'prices.save',payload:{items:Object.entries(priceDraft).map(([id,price])=>({id,price:Number(price)}))}},'تم تحديث أسعار الجملة.');setPriceDraft({});}catch{}}}><Check/>حفظ الأسعار</button></div><p className="hint">السعر = (تكلفة الوصول + مصاريف البيع للقطعة) ÷ (1 − الهامش). التقريب لأعلى نصف شيكل.</p></Panel>
        <Panel title="التكلفة والمبيعات المتوقعة"><DataTable headers={['الموديل','القطع','تكلفة القطعة','سعر البيع المقترح','المبيعات المتوقعة','الربح الإجمالي المتوقع']} rows={v.rows.map(r=>{const price=Number(priceDraft[r.item.id]??r.item.price),revenue=cents(r.count*price);return [<ItemName key={r.item.id} item={r.item}/>,qty(r.count),v.valid?money(r.unit):'—',<div key="price" className="price-cell"><input type="number" min="0" step="0.5" aria-label={'سعر بيع '+r.item.model} value={priceDraft[r.item.id]??r.item.price} onChange={e=>setPriceDraft({...priceDraft,[r.item.id]:e.target.value})}/><span>₪</span></div>,money(revenue),v.valid?<span key="profit" className={revenue-r.total<0?'danger-text':'profit-text'}>{money(revenue-r.total)}</span>:'—'];})}/></Panel><Notice>توقع المبيعات يفترض بيع كامل الكمية بالسعر المقترح. الخصومات والمردودات ومصاريف البيع تؤثر في الربح الفعلي.</Notice>
      </>}
      {containerTab==='receive'&&<Panel title={editable?'الجرد عند الوصول':'تفاصيل الاستلام'} icon={<ClipboardCheck/>} action={editable&&<button className="button primary" disabled={disabled||!items.length} onClick={()=>open({kind:'receive'})}><PackageCheck/>استلام ومطابقة</button>}>
        {editable?<Empty icon={<PackageCheck/>} title="الكشف جاهز للمطابقة عند الوصول" text="راجع العدد الفعلي والقطع التالفة لكل موديل، ثم اعتمد الاستلام لإضافة البضاعة إلى المخزون." action={<button className="button" disabled={disabled||!items.length} onClick={()=>open({kind:'receive'})}>بدء مطابقة الجرد<ArrowLeft size={16}/></button>}/>:<DataTable headers={['الموديل','المتوقع','السليم المستلم','التالف','فرق العدد']} rows={items.map(i=>[<ItemName key={i.id} item={i}/>,qty(i.quantity),qty(i.received),qty(i.damaged),<span key="diff" className={i.received+i.damaged!==i.quantity?'danger-text':''}>{qty(i.received+i.damaged-i.quantity)}</span>])}/>}
      </Panel>}
      {c.notes&&<Panel title={parent?"ملاحظات الملحق":"ملاحظات الحاوية"} icon={<NotebookPen/>}><p className="preserve-lines">{c.notes}</p></Panel>}
    </>;
  }

  function inventoryPage(){const pieces=stock.reduce((n,g)=>n+g.quantity,0),value=stock.reduce((n,g)=>n+g.batches.reduce((x,b)=>x+b.quantity*b.cost,0),0);
    return <><PageHeader eyebrow="البضاعة المستلمة" title="المخزون" description="رصيد كل موديل ولون ومقاس، مرتبط بتكلفة دفعة وصوله." action={<button className="button" onClick={()=>csvDownload('tajer-stock-'+today()+'.csv',[['الموديل','الصنف','اللون','المقاس','المتاح','سعر البيع','تكلفة الرصيد'],...stock.map(g=>[g.item.model,g.item.name,g.item.color,g.item.size,g.quantity,g.price,g.batches.reduce((n,b)=>n+b.quantity*b.cost,0)/100])])}><Download/>تصدير المخزون</button>}/>
      <div className="stats-grid"><Stat icon={<Boxes/>} label="أصناف مستلمة" value={qty(stock.length)}/><Stat icon={<Package/>} label="قطع متاحة للبيع" value={qty(pieces)}/><Stat icon={<Wallet/>} label="قيمة المخزون بالتكلفة" value={money(value)} note={stock.some(g=>g.provisional)?'تتضمن دفعات بتكلفة تقديرية':'حسب تكاليف الوصول المعتمدة'}/></div>
      <Panel title="أرصدة الأصناف">
        <ProductSearch value={stockSearch} onChange={setStockSearch} options={stockSearchOptions} onOptionsChange={setStockSearchOptions} placeholder="ابحث في المخزون"/>
        <DataTable headers={['الموديل والصنف','المتاح','سعر البيع','الدفعات','التكلفة','']} rows={visibleStock.map(g=>[<ItemName key={g.key} item={g.item}/>,<strong key="qty" className={g.quantity<5?'danger-text':''}>{qty(g.quantity)} قطعة</strong>,money(cents(g.price)),<small key="batches">{g.batches.filter(b=>b.quantity>0).map(b=>state.containers.find(c=>c.id===b.item.containerId)?.code).join(' · ')||'—'}</small>,<Badge key="cost" status={g.provisional?'received':'final'} label={g.provisional?'تقديرية':'معتمدة'}/>,<div key="actions" className="row-actions stock-actions"><button className="button small" onClick={()=>open({kind:'journal',key:g.key})}><NotebookPen size={15}/>سجل الحركة</button><button className="button small" disabled={disabled||g.quantity<1} onClick={()=>open({kind:'adjust',key:g.key})}><ClipboardCheck size={15}/>تسجيل تالف أو فاقد</button><button className="icon-button" title="تعديل بيانات الصنف" disabled={disabled} aria-label={'تعديل بيانات '+g.item.model} onClick={()=>open({kind:'details',item:g.item})}><Pencil size={16}/></button><button className="icon-button" title="تعديل سعر البيع" disabled={disabled} aria-label={'سعر '+g.item.model} onClick={()=>open({kind:'stockprice',key:g.key})}><Tags size={16}/></button><button className="button small" disabled={disabled||g.quantity<1} onClick={()=>{addToCart(g.key);navigate('sales');setSalesTab('new');}}><Plus size={16}/>بيع</button></div>])} empty={stock.length?'لا توجد أصناف مطابقة للبحث.':'لا يوجد مخزون مستلم. استلم الحاوية أولًا أو جرّب المثال التجريبي.'}/>
      </Panel>
    </>;
  }
  function salesPage(){const costIndex=cart.findIndex(line=>line.id===costLine),costItem=cart[costIndex],history=state.sales.filter(s=>bySearch([s.number,s.date,state.customers.find(c=>c.id===s.customerId)?.name,...s.lines.map(l=>l.model)],historySearch)).slice().reverse();
    return <><PageHeader eyebrow="المبيعات اليومية" title="بيع سريع" description="اختَر الموديل والكمية؛ السعر والحسابات جاهزة أمامك." action={<div className="segmented"><button className={salesTab==='new'?'active':''} onClick={()=>{setCostLine(null);setSalesTab('new');}}><Plus size={16}/>فاتورة جديدة{cart.length>0&&<span className="count">{cart.length}</span>}</button><button className={salesTab==='history'?'active':''} onClick={()=>{setCostLine(null);setSalesTab('history');}}>سجل المبيعات</button></div>}/>
      {salesTab==='history'?<Panel title="الفواتير المسجلة" action={<SearchBox value={historySearch} onChange={setHistorySearch} placeholder="فاتورة، زبون، موديل أو تاريخ"/>}><DataTable headers={['الفاتورة / التاريخ','الزبون','صافي البيع','المدفوع','المتبقي','الدفع','']} rows={history.map(s=>[<button key="id" className="text-button" onClick={()=>open({kind:'sale',sale:s})}><strong>{s.number}</strong><small className="muted block">{s.date}</small></button>,state.customers.find(c=>c.id===s.customerId)?.name||'—',s.voided?<Badge key="void" label="ملغاة"/>:money(s.total),money(s.paid),s.voided?'—':money(s.total-s.paid),paymentLabels[s.method],<div key="buttons" className="row-actions"><button className="icon-button" aria-label={'عرض '+s.number} onClick={()=>open({kind:'sale',sale:s})}><ArrowUpRight size={17}/></button><button className="icon-button" aria-label={'طباعة '+s.number} onClick={()=>print({kind:'sale',id:s.id})}><Printer size={17}/></button></div>])} empty="ستظهر هنا كل عملية بيع تحفظها."/></Panel>:<div className="sales-layout"><div className="sales-main">
        <Panel title="بيانات الفاتورة" icon={<ReceiptText/>} className="invoice-details" action={
          <button type="button" className="button small invoice-template-button" disabled={disabled}
            onClick={()=>open({kind:'invoiceTemplate'})}><CopyPlus size={16}/>إنشاء من فاتورة سابقة</button>
        }>
          {sourceInvoice&&<div className="invoice-source"><CopyPlus size={15}/>
            <span>مبنية على الفاتورة <bdi>{sourceInvoice}</bdi></span>
          </div>}
          <div className="form-grid">
            <Field label="الزبون"><div className="input-action">
              <select value={customerId} onChange={e=>{setCustomerId(e.target.value);setNewCustomerName('');}}>
                <option value="">زبون جديد / اختيار زبون</option>
                {state.customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?' · '+c.phone:''}</option>)}
              </select>
              <button className="icon-button" aria-label="إضافة زبون" disabled={disabled} onClick={()=>open({kind:'customer'})}><Plus/></button>
            </div></Field>
            <Field label="تاريخ البيع"><input type="date" value={saleDate} onChange={e=>setSaleDate(e.target.value)}/></Field>
            {!customerId&&<Field label="اسم الزبون الجديد" wide>
              <input value={newCustomerName} onChange={e=>setNewCustomerName(e.target.value)} placeholder="اسم التاجر أو المحل — يُحفظ تلقائيًا"/>
            </Field>}
          </div>
        </Panel>
        <Panel title="اختيار الأصناف" icon={<Search/>}>
          <ProductSearch value={search} onChange={changeSaleSearch} options={salesSearchOptions} onOptionsChange={options=>{setSalesSearchOptions(options);setVisibleSalesCount(6);}}
            placeholder="امسح الباركود أو ابحث عن صنف"
            onEnter={()=>{
              if(normalizeSearch(search).trim()&&matchingSales.length===1&&!disabled){
                addToCart(matchingSales[0].key);
                changeSaleSearch('');
              }
            }}/>
          {matchingSales.length>0?<div className="product-picker">
            {matchingSales.slice(0,visibleSalesCount).map(group=>{
              const available=templateStock?.get(group.key)??group.quantity;
              return <button type="button" key={group.key} className="product-pick" onClick={()=>addToCart(group.key)}
                disabled={disabled||(quantities.get(group.key)??0)>=available}>
                <span className="pick-icon"><Package size={20}/></span>
                <div><strong><bdi>{group.item.model}</bdi></strong><span>{group.item.name} · {group.item.color} {group.item.size}</span><small>المتاح {qty(available)} قطعة</small></div>
                <div className="pick-price"><b>{money(cents(group.price))}</b><Plus size={17}/></div>
              </button>;
            })}
            {matchingSales.length>visibleSalesCount&&<button type="button" className="button small more-products" onClick={()=>setVisibleSalesCount(count=>count+24)}>عرض المزيد ({qty(matchingSales.length-visibleSalesCount)})</button>}
          </div>:<div className="empty-small">{saleStock.length?'لا يوجد صنف مطابق للبحث.':'استلم بضاعة في الحاويات لتبدأ البيع.'}</div>}
        </Panel>
        <Panel title={'بنود الفاتورة'+(cart.length?' · '+cart.length:'')}>
          <DataTable headers={['الموديل','الكمية','سعر القطعة','الإجمالي','']} rows={cart.map(line=>{
            const group=stock.find(entry=>entry.key===line.key);
            const item=group?.item??line.sourceItem;
            const model=item?.model??line.key;
            const available=templateStock?(templateStock.get(line.key)??0):(group?.quantity??0);
            const requested=quantities.get(line.key)??line.quantity;
            const maximum=Math.max(0,available-(requested-line.quantity));
            const shortage=templateStock!==null&&requested>available;
            const changeQuantity=(quantity:number)=>setCart(rows=>rows.map(row=>row.id===line.id?{...row,quantity}:row));
            return [
              <div key="item" className="invoice-line-item">
                {item?<ItemName item={item}/>:model}
                {shortage&&<small className="invoice-shortage">المتاح {qty(available)} من {qty(requested)}</small>}
              </div>,
              <div key="quantity" className="quantity-stepper">
                <button type="button" aria-label="إنقاص الكمية" onClick={()=>changeQuantity(Math.max(1,line.quantity-1))}><Minus size={14}/></button>
                <input aria-label={'كمية '+model} aria-invalid={shortage||undefined} type="number" min="1" max={maximum} step="1"
                  value={line.quantity} onChange={event=>changeQuantity(Number(event.target.value))}/>
                <button type="button" aria-label="زيادة الكمية" disabled={line.quantity+1>maximum}
                  onClick={()=>changeQuantity(Math.max(1,line.quantity+1))}><Plus size={14}/></button>
              </div>,
              <input key="price" className="table-input" aria-label={'سعر '+model} type="number" min=".01" step=".01"
                value={line.price} onChange={event=>setCart(rows=>rows.map(row=>row.id===line.id?{...row,price:Number(event.target.value)}:row))}/>,
              money(cents(line.quantity*line.price)),
              <div key="actions" className="row-actions">
                <button type="button" className="icon-button" aria-expanded={costLine===line.id} aria-controls={costLine===line.id?'sale-cost-preview':undefined}
                  aria-label={(costLine===line.id?'إخفاء تكلفة ':'إظهار تكلفة ')+model} title="تكلفة الصنف"
                  onClick={()=>setCostLine(value=>value===line.id?null:line.id)}>
                  {costLine===line.id?<EyeOff size={17}/>:<Eye size={17}/>}
                </button>
                <button type="button" className="icon-button danger-text" aria-label="إزالة من الفاتورة" onClick={()=>{
                  if(costLine===line.id)setCostLine(null);
                  setCart(rows=>rows.filter(row=>row.id!==line.id));
                }}><Trash2 size={16}/></button>
              </div>,
            ];
          })} empty="أضف الموديلات من القائمة أعلاه." rowDetail={costItem?{
            index:costIndex,
            content:<SaleCostPreview state={state} line={costItem} earlierLines={cart.slice(0,costIndex)} saleDate={saleDate}
              model={stock.find(group=>group.key===costItem.key)?.item.model??costItem.sourceItem?.model??costItem.key} onClose={()=>setCostLine(null)}/>,
          }:undefined}/>
        </Panel>
      </div><aside className="sales-summary"><Panel title="ملخص الفاتورة" className="invoice-summary">
        <div className="summary-line"><span>عدد القطع</span><strong>{qty(cart.reduce((n,l)=>n+l.quantity,0))}</strong></div>
        <div className="summary-line"><span>الإجمالي قبل الخصم</span><strong>{money(gross)}</strong></div>
        <Field label="خصم الفاتورة"><MoneyInput value={discount} onChange={setDiscount}/></Field>
        <div className="grand-total"><span>صافي الفاتورة</span><strong>{money(saleTotal)}</strong></div>
        <Field label="طريقة الدفع"><select value={method} onChange={e=>{setMethod(e.target.value);setPartial(false);}}>
          {Object.entries(paymentLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></Field>
        {method!=='credit'&&<label className="check-row">
          <input type="checkbox" checked={partial} onChange={e=>{setPartial(e.target.checked);setPaidInput('');}}/>دفع جزئي والباقي على الحساب
        </label>}
        {partial&&method!=='credit'&&<Field label="المبلغ المدفوع"><MoneyInput value={paidInput} onChange={setPaidInput}/></Field>}
        <div className="summary-line"><span>المدفوع</span><strong>{money(paid)}</strong></div>
        <div className="summary-line due-line"><span>المتبقي على الزبون</span><strong>{money(saleTotal-paid)}</strong></div>
        <details className="extra-fields"><summary>الملاحظات ومصاريف البيع<ChevronDown size={15}/></summary>
          <Field label="مصاريف توصيل لهذه العملية"><MoneyInput value={delivery} onChange={setDelivery}/></Field>
          <Field label="ملاحظات"><textarea rows={2} value={saleNotes} onChange={e=>setSaleNotes(e.target.value)}/></Field>
        </details>
        {hasShortage&&<ErrorNote>عدّل الكميات التي تتجاوز المتاح أو أزل البنود قبل الحفظ.</ErrorNote>}
        <button className="button primary full" disabled={disabled||!cart.length||hasShortage} onClick={()=>saveInvoice(false)}>
          {saving?<LoaderCircle className="spin"/>:<Check/>}حفظ الفاتورة
        </button>
        <button className="button full" disabled={disabled||!cart.length||hasShortage} onClick={()=>saveInvoice(true)}><Printer/>حفظ وطباعة</button>
        <p className="hint">تُخصم الكمية من الدفعات الأقدم المتاحة، وتحفظ الفاتورة ارتباطها بتكلفة كل دفعة.</p>
      </Panel></aside></div>}
    </>;
  }

  function reportsPage(){
    const modelRows=new Map<string,{line:Sale['lines'][number];quantity:number;net:number;cost:number}>();
    for(const sale of totals.sales)for(const l of sale.lines){const row=modelRows.get(l.key)||{line:l,quantity:0,net:0,cost:0};row.quantity+=l.quantity;row.net+=l.net;row.cost+=saleLineCost(state,l);modelRows.set(l.key,row);}
    const customers=state.customers.filter(c=>bySearch([c.name,c.phone,c.address],customerSearch)),inRange=(d:string)=>(!from||d>=from)&&(!to||d<=to);
    const receipts=[...state.sales.filter(s=>!s.voided&&s.paid>0&&inRange(s.date)).map(s=>({id:s.id,date:s.date,customerId:s.customerId,amount:s.paid,method:s.method,notes:s.number})),...state.payments.filter(p=>inRange(p.date))].sort((a,b)=>b.date.localeCompare(a.date));
    return <><PageHeader eyebrow="أرقام تساعدك على القرار" title="الحسابات والتقارير" description="من تكلفة الموديل إلى الربح المحقق ورصيد كل زبون." action={<button className="button" onClick={exportReport}><Download/>تصدير المبيعات</button>}/>
      <div className="report-controls"><div className="tabs" role="tablist" aria-label="التقارير">{[{id:'profits',label:'الأرباح',icon:ChartNoAxesCombined},{id:'customers',label:'الزبائن والذمم',icon:Users},{id:'payments',label:'الدفعات',icon:HandCoins},{id:'expenses',label:'المصاريف',icon:Wallet}].map(t=><button key={t.id} role="tab" aria-selected={reportTab===t.id} className={reportTab===t.id?'active':''} onClick={()=>setReportTab(t.id)}><t.icon size={17}/>{t.label}</button>)}</div>{reportTab!=='customers'&&<div className="date-range"><label>من<input aria-label="من تاريخ" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>إلى<input aria-label="إلى تاريخ" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button className="text-button" onClick={()=>{setFrom('');setTo('');}}>كل الفترات</button></div>}</div>
      {from&&to&&from>to&&<ErrorNote>تاريخ البداية أكبر من تاريخ النهاية.</ErrorNote>}
      {reportTab==='profits'&&<><div className="stats-grid"><Stat icon={<ReceiptText/>} label="صافي المبيعات" value={money(totals.revenue)} note={totals.sales.length+' فاتورة في الفترة'}/><Stat icon={<ChartNoAxesCombined/>} label="الربح الإجمالي" value={money(totals.gross)} note="صافي البيع − تكلفة البضاعة المباعة"/><Stat icon={<Wallet/>} label="الربح بعد المصاريف المسجلة" value={money(totals.net)} note={totals.provisional?'يتضمن دفعات بتكلفة تقديرية':'بعد مصاريف البيع والتشغيل وفروقات المخزون'}/></div>{totals.provisional&&<Notice>بعض المبيعات من حاويات لم تُعتمد تكلفتها النهائية بعد. تُحدّث أرباحها عند استكمال المصاريف واعتماد التكلفة.</Notice>}
      <Panel title="ربح كل موديل" icon={<ChartNoAxesCombined/>}><DataTable headers={['الموديل','الكمية المباعة','صافي البيع','تكلفة المبيعات','الربح الإجمالي']} rows={[...modelRows.values()].map(r=>[<ItemName key={r.line.key} item={stock.find(g=>g.key===r.line.key)?.item??r.line}/>,qty(r.quantity),money(r.net),money(r.cost),<strong key="profit" className={r.net-r.cost<0?'danger-text':'profit-text'}>{money(r.net-r.cost)}</strong>])} empty="احفظ عمليات البيع لتظهر أرباح الموديلات هنا."/></Panel>
      <Panel title="تفصيل المصاريف المخصومة"><div className="breakdown"><div><span>توصيل ومصاريف مرتبطة بالفواتير</span><strong>{money(totals.delivery)}</strong></div><div><span>مصاريف عامة وتشغيل</span><strong>{money(totals.expenses)}</strong></div><div><span>خسارة عند الاستلام</span><strong>{money(totals.receiptLoss)}</strong></div><div><span>تالف وفاقد بعد الاستلام</span><strong>{money(totals.adjustmentLoss)}</strong></div></div></Panel>
      <Panel title="خسائر المخزون بعد الاستلام" icon={<ClipboardCheck/>}>
        <DataTable headers={['التاريخ','الموديل والدفعة','الحركة','الكمية','الخسارة','السبب']} rows={state.stockMovements.filter(m=>m.kind!=='cost'&&inRange(m.date)).slice().sort((a,b)=>b.date.localeCompare(a.date)).map(m=>{
          const item=state.items.find(i=>i.id===m.itemId)!;
          return [m.date,item.model+' · '+(state.containers.find(c=>c.id===item.containerId)?.code||''),stockMovementLabels[m.kind],qty(m.quantity),money(movementLoss(state,m)),m.reason];
        })} empty="لا توجد خسائر مخزون مسجلة في هذه الفترة."/>
      </Panel></>}
      {reportTab==='customers'&&<><div className="stats-grid"><Stat icon={<Users/>} label="الزبائن" value={qty(state.customers.length)}/><Stat icon={<HandCoins/>} label="ذمم مستحقة على الزبائن" value={money(state.customers.reduce((n,c)=>n+Math.max(0,customerBalance(state,c.id)),0))} note="الأرصدة الحالية لجميع الفترات"/><Stat icon={<Wallet/>} label="أرصدة دائنة للزبائن" value={money(state.customers.reduce((n,c)=>n+Math.max(0,-customerBalance(state,c.id)),0))}/></div><Panel title="الزبائن وكشوف الحساب" action={<div className="actions"><SearchBox value={customerSearch} onChange={setCustomerSearch} placeholder="اسم الزبون أو الجوال"/><button className="button primary small" disabled={disabled} onClick={()=>open({kind:'customer'})}><Plus/>زبون</button></div>}><DataTable headers={['الزبون','الجوال','الرصيد الحالي','الملاحظات','']} rows={customers.map(c=>[<button key="name" className="text-button strong" onClick={()=>open({kind:'statement',customer:c})}>{c.name}<small className="muted block">{c.address}</small></button>,c.phone||'—',<strong key="balance" className={customerBalance(state,c.id)>0?'danger-text':'profit-text'}>{money(customerBalance(state,c.id))}</strong>,c.notes||'—',<div key="actions" className="row-actions"><button className="button small" disabled={disabled} onClick={()=>open({kind:'payment',customerId:c.id})}><HandCoins size={16}/>قبض</button><button className="icon-button" aria-label={'تعديل '+c.name} disabled={disabled} onClick={()=>open({kind:'customer',value:c})}><Pencil size={16}/></button><button className="icon-button" aria-label={'كشف حساب '+c.name} onClick={()=>open({kind:'statement',customer:c})}><ArrowUpRight size={17}/></button></div>])} empty="أضف زبونًا هنا أو احفظ اسمه أثناء البيع."/></Panel></>}
      {reportTab==='payments'&&<><div className="stats-grid"><Stat icon={<HandCoins/>} label="إجمالي التحصيل" value={money(receipts.reduce((n,p)=>n+p.amount,0))}/><Stat icon={<Wallet/>} label="مقبوضات نقدية" value={money(receipts.filter(p=>p.method==='cash').reduce((n,p)=>n+p.amount,0))}/><Stat icon={<Landmark/>} label="تحويلات وبطاقات" value={money(receipts.filter(p=>p.method!=='cash').reduce((n,p)=>n+p.amount,0))}/></div><Panel title="الدفعات والمبالغ المقبوضة" icon={<HandCoins/>} action={<button className="button primary small" disabled={disabled||!state.customers.length} onClick={()=>open({kind:'payment'})}><Plus/>سند قبض</button>}><DataTable headers={['التاريخ','الزبون','المبلغ','الطريقة','المرجع / الملاحظات']} rows={receipts.map(p=>[p.date,state.customers.find(c=>c.id===p.customerId)?.name||'—',money(p.amount),paymentLabels[p.method]||p.method,p.notes||'دفعة على الحساب'])} empty="تظهر هنا دفعات الفواتير والمبالغ المقبوضة على الحساب."/></Panel></>}
      {reportTab==='expenses'&&<><div className="stats-grid"><Stat icon={<Wallet/>} label="المصاريف العامة في الفترة" value={money(totals.expenses)}/><Stat icon={<ReceiptText/>} label="مصاريف توصيل الفواتير" value={money(totals.delivery)}/><Stat icon={<Calculator/>} label="إجمالي البيع والتشغيل" value={money(totals.expenses+totals.delivery)}/></div><Panel title="مصاريف البيع والتشغيل" action={<button className="button primary small" disabled={disabled} onClick={()=>open({kind:'expense'})}><Plus/>مصروف جديد</button>}><DataTable headers={['التاريخ','الفئة','المبلغ','الملاحظات']} rows={state.operatingExpenses.filter(e=>inRange(e.date)).slice().reverse().map(e=>[e.date,e.category,money(e.amount),e.notes||'—'])} empty="أضف المصاريف العامة، مثل التوزيع والإيجار والتغليف."/></Panel><Notice>مصاريف الصين والشحن والتخليص والنقل حتى المخزن مسجلة داخل تكلفة الوصول. لا تسجّلها هنا مرة ثانية.</Notice></>}
    </>;
  }
  async function saveEditor(action:Action){
    try{
      const next=await mutate(action);
      if(action.type==='container.annex'||(action.type==='container.save'&&!action.payload.id)){
        openContainer(next.savedEntityId||next.containers.at(-1)!.id);
      }
      if(action.type==='container.receive')setContainerTab('receive');
      if(action.type==='customer.save'&&!action.payload.id&&page==='sales'){
        setCustomerId(next.savedEntityId||next.customers.at(-1)!.id);
        setNewCustomerName('');
      }
      if(action.type==='container.delete'){
        if(current?.parentId)openContainer(current.parentId,'annexes');
        else setSelected('');
      }
      if(action.type==='stock.record'){
        const item=next.items.find(i=>i.id===action.payload.itemId)!;
        open({kind:'journal',key:itemGroupKey(item)});
      }else if(action.type==='stock.recoveryPrice'){
        const movement=next.stockMovements.find(entry=>entry.id===action.payload.id)!;
        const item=next.items.find(entry=>entry.id===movement.itemId)!;
        open({kind:'journal',key:itemGroupKey(item)});
      }else setModal(null);
    }catch{}
  }
  function modalBody(){
    if(!modal)return null;
    if(modal.kind==='backup')return <BackupManager state={state} demo={demo} saving={saving} onBackup={backup} onRestore={restoreData}/>;
    if(modal.kind==='invoiceTemplate'){
      const hasDraft=Boolean(cart.length||customerId||newCustomerName||saleDate!==today()||method!=='cash'
        ||discount||partial||paidInput||delivery||saleNotes);
      return <InvoiceTemplatePicker state={state} hasDraft={hasDraft} disabled={disabled} onUse={usePreviousInvoice} onCancel={close}/>;
    }
    if(modal.kind==='import')return current?<ImportEditor container={current} state={state} demo={demo} saving={saving} onSave={saveEditor} onCancel={close}/>:null;
    if(modal.kind==='statement')return <><CustomerStatement state={state} customer={modal.customer}/><div className="modal-actions"><button className="button" onClick={()=>print({kind:'statement',id:modal.customer.id})}><Printer/>طباعة الكشف</button><button className="button primary" disabled={disabled} onClick={()=>open({kind:'payment',customerId:modal.customer.id})}><HandCoins/>تسجيل دفعة</button></div></>;
    if(modal.kind==='sale'){const sale=state.sales.find(s=>s.id===modal.sale.id)||modal.sale;return <><SaleDetails state={state} sale={sale}/><div className="modal-actions"><button className="button primary" onClick={()=>print({kind:'sale',id:sale.id})}><Printer/>طباعة الفاتورة</button>{!sale.voided&&<button className="button danger-text" disabled={disabled} onClick={()=>open({kind:'void',sale})}>إلغاء فاتورة مسجلة بالخطأ</button>}</div></>;}
    if(modal.kind==='install')return <><p>{installationInstructions()}</p><div className="modal-actions"><button className="button primary" onClick={close}>تم</button></div></>;
    if(modal.kind==='journal')return <WarehouseJournal state={state} groupKey={modal.key} disabled={disabled} onOpen={open}/>;
    if(modal.kind==='annex'||modal.kind==='sharedCost'||modal.kind==='recoverReceipt'||modal.kind==='details'||modal.kind==='adjust'||modal.kind==='recoveryPrice'){
      return <WarehouseEditor key={modal.kind} modal={modal} state={state} saving={saving} onSave={saveEditor} onCancel={close}/>;
    }
    return <Editor key={modal.kind+('value'in modal?(modal.value?.id||'new'):'')} modal={modal} state={state} current={current} saving={saving} onSave={saveEditor} onCancel={close}/>;
  }
  const modalTitles:Record<Modal['kind'],string>={container:'ملف الحاوية',item:'بيانات الصنف',cost:'مصروف وصول',import:'استيراد كشف الأصناف',customer:'بيانات الزبون',payment:'سند قبض',expense:'مصروف بيع وتشغيل',settings:'إعدادات المنشأة',statement:'كشف حساب الزبون',sale:'تفاصيل الفاتورة',invoiceTemplate:'اختيار فاتورة سابقة',receive:'الجرد والاستلام',finalize:'اعتماد تكلفة الوصول',void:'إلغاء الفاتورة',delete:'تأكيد الحذف',stockprice:'تعديل سعر البيع',backup:'النسخ الاحتياطية ونقل البيانات',install:'تثبيت تاجر',annex:'إضافة ملحق الحاوية',sharedCost:'حصة من مصروف الحاوية',recoverReceipt:'إضافة كمية من الجرد السابق',details:'تعديل بيانات الصنف',adjust:'تسوية المخزون',journal:'سجل حركة الصنف',recoveryPrice:'تعويض الخسارة في التسعير'};

  return <><div className="app-shell">
    <aside className="sidebar"><a className="brand" href="./" onClick={e=>{e.preventDefault();navigate('containers');setSelected('');}}><span className="brand-mark"><ContainerIcon/></span><span><strong>تاجر<span className="brand-dot">.</span></strong><small>الحاويات وبيع الملابس بالجملة</small></span></a><div className="nav-caption">مساحة العمل</div><nav aria-label="القائمة الرئيسية">{NAV.map(n=><button key={n.key} className={'nav-item'+(page===n.key?' active':'')} onClick={()=>navigate(n.key)}><n.icon/><span><strong>{n.label}</strong><small>{n.sub}</small></span>{page===n.key&&<span className="nav-active-dot"/>}</button>)}</nav><div className="sidebar-note"><Ship/><strong>كل قطعة، وحسابها.</strong><p>من كشف الحاوية إلى آخر فاتورة بيع.</p></div><div className="sidebar-bottom"><button className="sidebar-utility" onClick={backup}><Download size={17}/>نسخة احتياطية</button><button className="sidebar-utility" onClick={()=>open({kind:'backup'})}><Upload size={17}/>استعادة ونقل البيانات</button><button className="sidebar-utility" disabled={disabled} onClick={()=>open({kind:'settings'})}><SettingsIcon size={17}/>إعدادات المنشأة</button><div className="account"><span className="avatar">{(state.settings.name||'تاجر').slice(0,1)}</span><span><strong>{state.settings.name}</strong><small>{demo?'مساحة تجريبية':'الحفظ على هذا الجهاز'}</small></span><ShieldCheck size={17}/></div></div></aside>
    <div className="workspace"><header className="topbar"><div className="topbar-brand"><ContainerIcon/><strong>تاجر</strong></div><div className="breadcrumb"><span>مساحة العمل</span><ChevronLeft size={15}/><strong>{NAV.find(n=>n.key===page)?.label}</strong></div><div className="topbar-actions">{canShowInstall&&<button className="button small install-button" onClick={async()=>{if(!await installTajer())open({kind:'install'});}}><Download size={16}/>تثبيت تاجر</button>}<span className="sync-status"><span className={'status-dot '+(!connected?'offline':'')}/>{saving?'جارٍ الحفظ':demo?'مثال تجريبي':loading?'جارٍ التحميل':connected?'محفوظ على هذا الجهاز':'تعذّر التخزين'}</span><button className="icon-button" aria-label="النسخ الاحتياطية ونقل البيانات" onClick={()=>open({kind:'backup'})}><Download size={18}/></button><button className="icon-button" aria-label="تحديث البيانات" disabled={loading||saving||demo} onClick={()=>{setLoading(true);refresh();}}><RefreshCw size={18} className={loading?'spin':''}/></button><button className="icon-button mobile-settings" aria-label="الإعدادات" onClick={()=>open({kind:'settings'})}><SettingsIcon size={18}/></button><span className="top-avatar">{(state.settings.name||'ت').slice(0,1)}</span></div></header>
    {demo&&<div className="demo-banner"><div><CircleHelp size={17}/><span><strong>مثال تجريبي</strong> — بيانات للتجربة، منفصلة عن بياناتك.</span></div><button onClick={exitDemo}>العودة إلى برنامجي<ArrowLeft size={16}/></button></div>}
    <main className="main-content">{!demo&&<div className="local-storage-note"><ShieldCheck size={16}/><span>بياناتك محفوظة في متصفح هذا الجهاز. احتفظ بنسخة احتياطية لنقلها أو استعادتها.</span><button onClick={()=>open({kind:'backup'})}>نسخ واستعادة</button></div>}{error&&!modal&&<div className="global-error"><ErrorNote>{error}</ErrorNote><button className="icon-button" aria-label="إغلاق التنبيه" onClick={()=>setError('')}><X size={16}/></button></div>}{loading&&!demo?<div className="loading-state"><LoaderCircle className="spin"/><span>جارٍ فتح مساحة العمل…</span></div>:page==='containers'?containersPage():page==='sales'?salesPage():page==='inventory'?inventoryPage():reportsPage()}<footer className="page-footer"><span>تاجر · حفظ محلي على هذا الجهاز</span><span>العملة الأساسية: الشيكل ₪</span></footer></main></div>
    <nav className="mobile-nav" aria-label="التنقل السريع">{NAV.map(n=><button key={n.key} className={page===n.key?'active':''} onClick={()=>navigate(n.key)}><n.icon size={21}/><span>{n.key==='reports'?'الحسابات':n.label}</span></button>)}</nav>
  </div>
  {toast&&<div className="toast" role="status"><CheckCircle2 size={19}/>{toast}</div>}
  {modal&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)close();}}><section className={'modal modal-'+modal.kind} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="eyebrow">{demo?'المثال التجريبي':state.settings.name}</span><h2 id="modal-title">{modalTitles[modal.kind]}</h2></div><button className="icon-button" aria-label="إغلاق" disabled={saving} onClick={close}><X/></button></div>{modalError&&<ErrorNote>{modalError}</ErrorNote>}<div className="modal-body">{modalBody()}</div></section></div>}
  <div className="print-only">{printTarget&&<Printable state={state} target={printTarget}/>}</div>
  </>;
}

function PageHeader({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}){return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;}
function SearchBox({value,onChange,placeholder,onEnter}:{value:string;onChange:(value:string)=>void;placeholder:string;onEnter?:()=>void}){
  return <div className="search-box">
    <Search size={18}/>
    <input type="search" enterKeyHint={onEnter?'go':'search'} aria-label={placeholder} placeholder={placeholder} value={value} onChange={event=>onChange(event.target.value)} onKeyDown={event=>{
      if(event.key==='Enter'&&!event.nativeEvent.isComposing&&!event.repeat&&onEnter){
        event.preventDefault();
        onEnter();
      }
    }}/>
    {value&&<button type="button" aria-label="مسح البحث" onClick={()=>onChange('')}><X size={14}/></button>}
  </div>;
}

function ProductSearch({value,onChange,options,onOptionsChange,placeholder,onEnter}:{
  value:string;onChange:(value:string)=>void;options:ProductSearchOptions;onOptionsChange:(options:ProductSearchOptions)=>void;
  placeholder:string;onEnter?:()=>void;
}){
  return <div className="product-search">
    <SearchBox value={value} onChange={onChange} placeholder={placeholder} onEnter={onEnter}/>
    <Field label="البحث في">
      <select value={options.column} onChange={event=>onOptionsChange({...options,column:event.target.value as ProductSearchOptions['column']})}>
        <option value="all">كل الأعمدة</option>
        {Object.entries(productSearchColumns).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select>
    </Field>
    <Field label="طريقة المطابقة">
      <select value={options.mode} onChange={event=>onOptionsChange({...options,mode:event.target.value as ProductSearchOptions['mode']})}>
        <option value="contains">جزء من الكتابة</option>
        <option value="exact">مطابق للكتابة</option>
      </select>
    </Field>
  </div>;
}

function InvoiceTemplatePicker({state,hasDraft,disabled,onUse,onCancel}:{
  state:State;hasDraft:boolean;disabled:boolean;onUse:(id:string)=>void;onCancel:()=>void;
}){
  const [search,setSearch]=useState(''),[selectedId,setSelectedId]=useState('');
  const [visibleCount,setVisibleCount]=useState(8),[confirmReplace,setConfirmReplace]=useState(false);
  const previewHeading=useRef<HTMLHeadingElement>(null);
  const customers=useMemo(()=>new Map(state.customers.map(customer=>[customer.id,customer.name])),[state.customers]);
  const sales=useMemo(()=>state.sales.filter(sale=>!sale.voided).reverse()
    .sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)),[state.sales]);
  const selected=sales.find(sale=>sale.id===selectedId);
  const matching=useMemo(()=>sales.filter(sale=>bySearch([sale.number,customers.get(sale.customerId)],search)),[sales,customers,search]);
  useEffect(()=>{if(selected)previewHeading.current?.focus();},[selected]);

  function importInvoice(){
    if(!selected||disabled)return;
    if(hasDraft&&!confirmReplace){setConfirmReplace(true);return;}
    onUse(selected.id);
  }

  return <div className="invoice-template-picker">
    {selected?<>
      <div className="invoice-template-heading">
        <div>
          <h3 ref={previewHeading} tabIndex={-1}>بنود الفاتورة <bdi>{selected.number}</bdi></h3>
          <p>{customers.get(selected.customerId)} · <bdi>{selected.date}</bdi></p>
        </div>
        <button type="button" className="button small" onClick={()=>{setSelectedId('');setConfirmReplace(false);}}>
          اختيار فاتورة أخرى
        </button>
      </div>
      <DataTable headers={['الموديل والصنف','الكمية','سعر القطعة']} rows={selected.lines.map(line=>[
        <ItemName key="item" item={line}/>,qty(line.quantity),money(cents(line.price)),
      ])}/>
    </>:<>
      <SearchBox value={search} placeholder="رقم الفاتورة أو اسم الزبون" onChange={value=>{
        setSearch(value);setVisibleCount(8);setSelectedId('');setConfirmReplace(false);
      }}/>
      <DataTable headers={['رقم الفاتورة','التاريخ','الزبون','البنود','الصافي','']} rows={matching.slice(0,visibleCount).map(sale=>[
        <strong key="number"><bdi>{sale.number}</bdi></strong>,
        <bdi key="date">{sale.date}</bdi>,customers.get(sale.customerId)??'—',qty(sale.lines.length),money(sale.total),
        <button type="button" key="preview" className="button small" aria-label={'معاينة الفاتورة '+sale.number}
          onClick={()=>{setSelectedId(sale.id);setConfirmReplace(false);}}>معاينة</button>,
      ])} empty={sales.length?'لا توجد فواتير تطابق البحث.':'ستظهر الفواتير المحفوظة هنا بعد أول عملية بيع.'}/>
      {matching.length>visibleCount&&<button type="button" className="button small" onClick={()=>setVisibleCount(count=>count+16)}>
        عرض المزيد ({qty(matching.length-visibleCount)})
      </button>}
    </>}
    {confirmReplace&&selected&&<Notice>ستحلّ بيانات الفاتورة المختارة محل البيانات المدخلة في المسودة الحالية.</Notice>}
    <div className="modal-actions">
      <button type="button" className="button primary" disabled={!selected||disabled} onClick={importInvoice}>
        <CopyPlus size={17}/>{confirmReplace&&selected?'استبدال المسودة الحالية':'استيراد إلى المسودة'}
      </button>
      {confirmReplace&&selected
        ? <button type="button" className="button" onClick={()=>setConfirmReplace(false)}>رجوع</button>
        : <button type="button" className="button" onClick={onCancel}>إلغاء</button>}
    </div>
  </div>;
}

function SaleCostPreview({state,line,earlierLines,saleDate,model,onClose}:{
  state:State;line:InvoiceDraftLine;earlierLines:InvoiceDraftLine[];saleDate:string;model:string;onClose:()=>void;
}){
  const preview=useMemo(()=>{
    try{
      return {value:previewSaleLineCost(state,line,saleDate,earlierLines),error:''};
    }catch(error){
      return {value:null,error:error instanceof Error?error.message:'تعذّر حساب تكلفة القطع.'};
    }
  },[state,line,saleDate,earlierLines]);
  return <div id="sale-cost-preview" className="sale-cost-preview" role="region" aria-label={'تكلفة '+model}>
    <div className="sale-cost-heading"><strong>تكلفة الصنف <bdi>{model}</bdi></strong><button type="button" className="icon-button" aria-label="إغلاق معاينة التكلفة" onClick={onClose}><X size={16}/></button></div>
    {preview.value?<>
      <div className="sale-cost-heading"><strong>متوسط تكلفة القطعة</strong><bdi>{money(preview.value.averageUnitCost)}</bdi></div>
      <div className="sale-cost-heading"><span>تكلفة الكمية في الفاتورة</span><bdi>{money(preview.value.total)}</bdi></div>
        <ul>
          {preview.value.batches.map(batch=><li key={batch.itemId}>
            <div className="sale-cost-heading">
              <strong><bdi>{batch.code}</bdi> · {qty(batch.quantity)} قطعة</strong>
              {batch.provisional&&<Badge status="received" label="تقديرية"/>}
            </div>
            {batch.supplier&&<small className="muted">{batch.supplier}</small>}
            <div><span>شراء القطعة</span><bdi>{qty(batch.purchase)} {currencyNames[batch.currency]}</bdi></div>
            <div><span>تكلفة القطعة الواصلة</span><bdi>{money(batch.unitCost)}</bdi></div>
          </li>)}
        </ul>
    </>:<small className="danger-text">{preview.error}</small>}
  </div>;
}

function Editor({modal,state,current,saving,onSave,onCancel}:{modal:Exclude<Modal,WarehouseModal|{kind:'import'|'statement'|'sale'|'invoiceTemplate'|'backup'|'install'}>;state:State;current?:Container;saving:boolean;onSave:(a:Action)=>Promise<void>;onCancel:()=>void}){
  function initial():Record<string,any>{
    if(modal.kind==='container')return modal.value?{...modal.value}:{name:'',supplier:'',currency:'ILS',fx:1,eta:'',notes:''};
    if(modal.kind==='item')return modal.value?{...modal.value}:{model:'',name:'',color:'',size:'',barcode:'',quantity:'',purchase:'',currency:current?.currency||'ILS',fx:current?.fx||1,volume:'',weight:'',price:'',notes:''};
    if(modal.kind==='cost')return modal.value?{...modal.value}:{name:'',amount:'',currency:'ILS',fx:1,basis:'value',target:'',confirmed:false,notes:''};
    if(modal.kind==='customer')return modal.value?{...modal.value,opening:modal.value.opening/100}:{name:'',phone:'',address:'',opening:0,notes:''};
    if(modal.kind==='payment')return {customerId:modal.customerId||'',date:today(),amount:'',method:'cash',notes:''};
    if(modal.kind==='expense')return {date:today(),amount:'',category:'توزيع وتوصيل',notes:''};
    if(modal.kind==='settings')return {...state.settings};
    if(modal.kind==='receive')return {counts:(current?batchItems(state,current.id):[]).map(i=>({id:i.id,received:i.quantity,damaged:0})),date:today(),notes:'',reviewed:false};
    if(modal.kind==='stockprice')return {price:inventory(state).find(g=>g.key===modal.key)?.price||0};
    return {reviewed:false,reason:'',refunded:false};
  }
  const [form,setForm]=useState<Record<string,any>>(initial),[localError,setLocalError]=useState('');
  const set=(key:string,value:any)=>setForm(f=>({...f,[key]:value}));
  const field=(label:string,key:string,type='text',required=false,attrs:Record<string,any>={})=><Field label={label}><input type={type} value={form[key]??''} onChange={e=>set(key,e.target.value)} required={required} {...attrs}/></Field>;
  const currencyField=<><Field label="العملة"><CurrencySelect value={form.currency||'ILS'} onChange={v=>{set('currency',v);set('fx',v==='ILS'?1:'');}}/></Field>{form.currency!=='ILS'&&field('شيكل لكل وحدة من العملة','fx','number',true,{min:'.000001',step:'.000001'})}</>;
  const receiptAction:Action={type:'container.receive',payload:{...form,id:current?.id}};
  let correctionPreview:Container['correctionEffect'];
  let previewError='';
  if(modal.kind==='receive'&&current?.annexKind==='correction'&&form.reviewed){
    try{
      correctionPreview=perform(state,receiptAction).containers.find(container=>container.id===current.id)?.correctionEffect;
    }catch(error){previewError=error instanceof Error?error.message:'تعذّرت معاينة التصحيح.';}
  }
  async function submit(e:FormEvent){e.preventDefault();setLocalError('');try{let action:Action;
    if(modal.kind==='container')action={type:'container.save',payload:form};
    else if(modal.kind==='item')action={type:modal.value?'item.save':'items.add',payload:modal.value?{...form,id:modal.value.id}:{containerId:current?.id,items:[form]}};
    else if(modal.kind==='cost')action={type:'cost.save',payload:{...form,containerId:current?.id}};
    else if(modal.kind==='customer')action={type:'customer.save',payload:{...form,opening:cents(Number(form.opening)||0)}};
    else if(modal.kind==='payment')action={type:'payment.create',payload:{...form,amount:cents(Number(form.amount))}};
    else if(modal.kind==='expense')action={type:'expense.create',payload:{...form,amount:cents(Number(form.amount))}};
    else if(modal.kind==='settings')action={type:'settings.save',payload:form};
    else if(modal.kind==='receive'){if(!form.reviewed)throw Error('أكد مراجعة العدد الفعلي للأصناف أولًا.');if(previewError)throw Error(previewError);action=receiptAction;}
    else if(modal.kind==='finalize'){if(!form.reviewed)throw Error('أكد اكتمال جميع تكاليف الحاوية.');action={type:'container.finalize',payload:{id:current?.id}};}
    else if(modal.kind==='void')action={type:'sale.void',payload:{id:modal.sale.id,...form}};
    else if(modal.kind==='delete')action={type:modal.type,payload:{id:modal.id}};
    else if(modal.kind==='stockprice')action={type:'prices.save',payload:{items:state.items.filter(i=>itemGroupKey(i)===modal.key&&isReceived(state.containers.find(c=>c.id===i.containerId))).map(i=>({id:i.id,price:Number(form.price)}))}};
    else return;await onSave(action);
  }catch(e){setLocalError(e instanceof Error?e.message:'تعذّر الحفظ.');}}
  return <form onSubmit={submit}>
    {modal.kind==='container'&&<div className="form-grid">{field('اسم الحاوية / الشحنة','name','text',true,{placeholder:'مثال: حاوية الشتاء القادمة'})}{field('المورد / الجهة','supplier')}{currencyField}{field('الوصول المتوقع','eta','date')}<Field label="ملاحظات الحاوية" wide><textarea rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)}/></Field></div>}
    {modal.kind==='item'&&<><div className="form-grid">{field('رقم الموديل','model','text',true,{placeholder:'مثال: BL102'})}{field('اسم الصنف','name','text',true)}{field('عدد القطع','quantity','number',true,{min:1,step:1})}{field('سعر شراء القطعة بعملتها','purchase','number',true,{min:0,step:'.01'})}{currencyField}{field('اللون','color')}{field('المقاس','size')}{field('سعر الجملة المقترح للبيع','price','number',false,{min:0,step:'.01'})}{field('الباركود','barcode')}</div><details className="extra-fields"><summary>الحجم والوزن والملاحظات<ChevronDown size={15}/></summary><div className="form-grid">{field('الحجم الإجمالي لهذا الصنف CBM','volume','number',false,{min:0,step:'.001'})}{field('الوزن الإجمالي لهذا الصنف كغم','weight','number',false,{min:0,step:'.001'})}<Field label="ملاحظات الصنف" wide><textarea rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/></Field></div></details><p className="hint">أدخل الحجم أو الوزن عند اختيار أحدهما لتوزيع المصاريف. جميع الكميات بالقطع.</p></>}
    {modal.kind==='cost'&&<><div className="form-grid">{field('اسم المصروف','name','text',true,{placeholder:'مثال: الشحن البحري'})}{field('المبلغ بعملته الأصلية','amount','number',true,{min:0,step:'.01'})}{currencyField}<Field label="توزيع المصروف حسب"><select value={form.basis} onChange={e=>set('basis',e.target.value)}>{Object.entries(basisLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>{form.basis==='direct'&&<Field label="الصنف الذي يتحمل المصروف"><select value={form.target} onChange={e=>set('target',e.target.value)} required><option value="">اختر الصنف</option>{(current?batchItems(state,current.id):[]).map(i=><option key={i.id} value={i.id}>{i.model+' · '+i.color+' · '+i.size}</option>)}</select></Field>}<Field label="ملاحظات / مرجع المستند" wide><textarea rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/></Field></div><label className="check-row emphasized"><input type="checkbox" checked={form.confirmed} onChange={e=>set('confirmed',e.target.checked)}/><span>المبلغ مؤكد بمستند / دفعة فعلية<small>اتركه غير محدد إذا كان المبلغ تقديريًا قبل الوصول.</small></span></label></>}
    {modal.kind==='customer'&&<div className="form-grid">{field('اسم المحل / الزبون','name','text',true)}{field('رقم الجوال','phone','tel')}{field('العنوان','address')}{field('الرصيد الافتتاحي بالشيكل','opening','number',false,{step:'.01'})}<Field label="ملاحظات التعامل" wide><textarea rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/></Field></div>}
    {modal.kind==='payment'&&<><div className="form-grid"><Field label="الزبون"><select value={form.customerId} onChange={e=>set('customerId',e.target.value)} required><option value="">اختر الزبون</option>{state.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>{field('تاريخ الدفعة','date','date',true)}{field('المبلغ بالشيكل','amount','number',true,{min:'.01',step:'.01'})}<Field label="وسيلة القبض"><select value={form.method} onChange={e=>set('method',e.target.value)}>{['cash','bank','card'].map(m=><option key={m} value={m}>{paymentLabels[m]}</option>)}</select></Field><Field label="ملاحظات / مرجع التحويل" wide><textarea rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/></Field></div>{form.customerId&&<div className="payment-preview"><span>الرصيد الحالي <strong>{money(customerBalance(state,form.customerId))}</strong></span><ArrowLeft size={17}/><span>بعد الدفعة <strong>{money(customerBalance(state,form.customerId)-cents(Number(form.amount)||0))}</strong></span></div>}</>}
    {modal.kind==='expense'&&<div className="form-grid">{field('التاريخ','date','date',true)}{field('الفئة','category','text',true)}{field('المبلغ بالشيكل','amount','number',true,{min:'.01',step:'.01'})}<Field label="ملاحظات" wide><textarea rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)}/></Field><p className="hint field-wide">هذه مصاريف بيع وتشغيل لاحقة. مصاريف وصول البضاعة تُضاف إلى ملف الحاوية.</p></div>}
    {modal.kind==='settings'&&<div className="form-grid">{field('اسم المنشأة على الفواتير','name','text',true)}{field('رقم الجوال','phone','tel')}{field('العنوان','address')}{field('الهامش الافتراضي المقترح %','margin','number',true,{min:0,max:95})}<Field label="تذييل الفاتورة" wide><textarea rows={2} value={form.invoiceFooter} onChange={e=>set('invoiceFooter',e.target.value)}/></Field><div className="notice field-wide"><ShieldCheck size={18}/><span>تُحفظ البيانات في متصفح هذا الجهاز دون حساب أو خادم. لنقلها إلى جهاز آخر صدّر نسخة احتياطية ثم استعدها هناك. العملة الأساسية للتقارير هي الشيكل.</span></div></div>}
    {modal.kind==='receive'&&<><Notice>راجع العدّ الفعلي قبل الاعتماد. الكمية التي ستدخل المخزون هي القطع السليمة فقط.</Notice><DataTable headers={['الموديل','المتوقع','سليم مستلم','تالف','الفرق']} rows={(current?batchItems(state,current.id):[]).map((item,index)=>{const row=form.counts[index];return [<ItemName key={item.id} item={item}/>,qty(item.quantity),<input key="good" className="table-input" aria-label={'عدد سليم '+item.model} type="number" min="0" step="1" required value={row.received} onChange={e=>set('counts',form.counts.map((v:any,n:number)=>n===index?{...v,received:e.target.value}:v))}/>,<input key="damaged" className="table-input" aria-label={'عدد تالف '+item.model} type="number" min="0" step="1" required value={row.damaged} onChange={e=>set('counts',form.counts.map((v:any,n:number)=>n===index?{...v,damaged:e.target.value}:v))}/>,<span key="diff" className={Number(row.received)+Number(row.damaged)!==item.quantity?'danger-text':''}>{qty(Number(row.received)+Number(row.damaged)-item.quantity)}</span>];})}/><div className="form-grid">{field('تاريخ الاستلام','date','date',true)}<Field label="ملاحظات وفروقات الجرد" wide><textarea rows={3} placeholder="اذكر النقص أو الزيادة والتالف وأي تسوية مع المورد" value={form.notes} onChange={e=>set('notes',e.target.value)}/></Field></div><p className="hint">عند وجود فروقات، تُحمّل تكلفة الصنف على القطع السليمة المستلمة. الصنف دون قطع سليمة يظهر كخسارة مخزون في التقرير.</p><label className="check-row emphasized"><input type="checkbox" checked={form.reviewed} onChange={e=>set('reviewed',e.target.checked)}/>راجعت العدّ الفعلي لجميع الأصناف ونتيجة المطابقة.</label></>}
    {correctionPreview&&<Notice>أثر التصحيح قبل الاعتماد · فرق تكلفة المبيعات المسجلة {money(correctionPreview.salesCost)} · فرق خسارة الاستلام والمخزون {money(correctionPreview.stockLoss)}.</Notice>}
    {previewError&&<ErrorNote>{previewError}</ErrorNote>}
    {modal.kind==='finalize'&&<><p>سيتم تثبيت تكلفة وصول أصناف <strong>{current?.name}</strong> وحماية بيانات تكلفتها من التعديل. يمكنك تحديث أسعار البيع لاحقًا.</p><div className="finalize-checks">{state.costs.filter(c=>c.containerId===current?.id).map(c=><div key={c.id}>{c.confirmed?<CheckCircle2 className="profit-text"/>:<CircleAlert className="danger-text"/>}<span>{c.name}</span><strong>{c.confirmed?'مؤكد':'تقديري'}</strong></div>)}</div><label className="check-row emphasized"><input type="checkbox" checked={form.reviewed} onChange={e=>set('reviewed',e.target.checked)}/>اكتملت جميع مصاريف الحاوية وفُحصت فروقات الجرد.</label></>}
    {modal.kind==='delete'&&<p>هل تريد <strong>{modal.title}</strong>؟ سيُعاد حساب إجمالي الحاوية بعد الحذف.</p>}
    {modal.kind==='void'&&<><Notice>استخدم الإلغاء لتصحيح فاتورة مسجلة بالخطأ. تُعاد كمياتها إلى المخزون وتُعكس قيمتها من حساب الزبون.</Notice><Field label="سبب الإلغاء"><textarea rows={3} required value={form.reason} onChange={e=>set('reason',e.target.value)}/></Field>{modal.sale.paid>0&&<label className="check-row emphasized"><input type="checkbox" checked={form.refunded} onChange={e=>set('refunded',e.target.checked)}/>تم رد أو تسوية المبلغ المدفوع {money(modal.sale.paid)} مع الزبون.</label>}</>}
    {modal.kind==='stockprice'&&<><p className="hint">يُطبق السعر على الدفعات المستلمة من الموديل واللون والمقاس نفسها.</p>{field('سعر الجملة للقطعة بالشيكل','price','number',true,{min:0,step:'.01'})}</>}
    {localError&&<ErrorNote>{localError}</ErrorNote>}
    <div className="modal-actions"><button type="button" className="button" onClick={onCancel} disabled={saving}>إلغاء</button><button className={'button '+(modal.kind==='delete'||modal.kind==='void'?'danger':'primary')} type="submit" disabled={saving||!!previewError}>{saving?<LoaderCircle className="spin"/>:<Check/>}{modal.kind==='receive'?'اعتماد الاستلام':modal.kind==='finalize'?'اعتماد التكلفة':modal.kind==='delete'?'حذف':modal.kind==='void'?'إلغاء الفاتورة':'حفظ'}</button></div>
  </form>;
}

function WarehouseJournal({state,groupKey,disabled,onOpen}:{state:State;groupKey:string;disabled:boolean;onOpen:(modal:WarehouseModal)=>void}){
  const group=inventory(state).find(g=>g.key===groupKey);
  if(!group)return null;
  const regular=inventory(state).find(g=>g.key===regularProductKey(group.item));
  return <>
    <div className="journal-summary">
      <ItemName item={group.item}/>
      <strong>{qty(group.quantity)} قطعة متاحة</strong>
      {!group.item.gradeOf&&<button className="button small" disabled={disabled||!group.quantity} onClick={()=>onOpen({kind:'adjust',key:groupKey,movementKind:'cost'})}><Plus size={16}/>تحميل مصروف وصول</button>}
    </div>
    <DataTable headers={['التاريخ والدفعة','الحركة','تغيّر الكمية','رصيد الدفعة','القيمة','البيان']} rows={stockJournal(state,groupKey).map(row=>{
      const movement=row.movement;
      const canRecover=movement&&movement.kind!=='cost'&&movementLoss(state,movement)>0&&!!regular?.quantity;
      return [
        <div key="date">{row.date}<small className="muted block">{row.batch}</small></div>,
        row.label,
        (row.change>0?'+':'')+qty(row.change),
        qty(row.balance),
        money(row.amount),
        <div key="note" className="journal-note">
          <span>{row.note||'—'}</span>
          {movement?.pricing&&<small className="muted block">السعر المعتمد {money(movement.pricing.price)} · تغطية متوقعة {money(movement.pricing.total)}</small>}
          {canRecover&&<button className="button small" disabled={disabled} onClick={()=>onOpen({kind:'recoveryPrice',movement})}><Tags size={15}/>تعويض الخسارة في التسعير</button>}
        </div>,
      ];
    })}/>
  </>;
}

function WarehouseEditor({modal,state,saving,onSave,onCancel}:{
  modal:Exclude<WarehouseModal,{kind:'journal'}>;state:State;saving:boolean;
  onSave:(action:Action)=>Promise<void>;onCancel:()=>void;
}){
  const groups=inventory(state);
  const stockGroup=modal.kind==='adjust'?groups.find(group=>group.key===modal.key):undefined;
  const recoverySource=modal.kind==='recoveryPrice'?state.items.find(item=>item.id===modal.movement.itemId):undefined;
  const recoveryGroup=recoverySource?groups.find(group=>group.key===regularProductKey(recoverySource)):undefined;
  const annex=modal.kind==='sharedCost'||modal.kind==='recoverReceipt'?modal.annex:undefined;
  const parent=annex?state.containers.find(container=>container.id===annex.parentId):undefined;
  const sources=modal.kind==='sharedCost'?state.costs.filter(cost=>cost.containerId===parent?.id&&!cost.sourceCostId&&cost.basis!=='direct'&&sharedCostRemaining(state,cost)>0):[];
  const priorItems=modal.kind==='recoverReceipt'&&parent?batchItems(state,parent.id).filter(item=>remainingShortage(state,item)>0&&!batchItems(state,modal.annex.id).some(entry=>itemGroupKey(entry)===itemGroupKey(item))):[];
  const batches=stockGroup?.batches.filter(batch=>batch.quantity>0)??[];
  const details=modal.kind==='details'?(groups.find(group=>group.key===regularProductKey(modal.item))?.item??modal.item):undefined;
  const [form,setForm]=useState<Record<string,string>>(()=>({
    date:today(),
    itemId:batches[0]?.item.id||priorItems[0]?.id||'',
    sourceCostId:sources[0]?.id||'',
    movementKind:modal.kind==='adjust'?(modal.movementKind||'damage'):'',
    annexKind:'addition',
    quantity:modal.kind==='recoveryPrice'?String(recoveryGroup?.quantity??''):'1',
    price:modal.kind==='recoveryPrice'?String((modal.movement.pricing?.base??cents(recoveryGroup?.price??0))/100):'',
    ...(details?{model:details.model,name:details.name,color:details.color,size:details.size,barcode:details.barcode,notes:details.notes}:{}),
  }));
  const set=(key:string,value:string)=>setForm(previous=>({...previous,[key]:value}));
  const field=(label:string,key:string,attributes:InputHTMLAttributes<HTMLInputElement>={})=>
    <Field label={label}><input {...attributes} value={form[key]??''} onChange={e=>set(key,e.target.value)}/></Field>;
  const notes=(label:string,required=false)=><Field label={label} wide><textarea required={required} rows={3} value={form.notes??''} onChange={e=>set('notes',e.target.value)}/></Field>;
  const moneyField=(label:string,key:string,min=0)=><Field label={label}><MoneyInput required min={min} value={form[key]??''} onChange={value=>set(key,value)}/></Field>;
  const amount=(key:string)=>cents(Number(form[key]||0));

  let content:ReactNode;
  let action:Action;
  let unavailable=false;
  let label='حفظ';

  switch(modal.kind){
    case 'annex':
      action={type:'container.annex',payload:{...form,parentId:modal.parent.id,documentDate:form.date}};
      content=<>
        <div className="form-grid">
          {field('اسم الملحق','name',{required:true})}
          <Field label="نوع السند"><select value={form.annexKind} onChange={e=>set('annexKind',e.target.value)}>
            <option value="addition">بضاعة ملحقة</option>
            {isReceived(modal.parent)&&<option value="correction">تصحيح جرد سابق</option>}
          </select></Field>
          {field('تاريخ السند','date',{type:'date',required:true})}
          {field('الوصول المتوقع','eta',{type:'date'})}
          {notes(form.annexKind==='correction'?'سبب التصحيح ومرجع الجرد':'ملاحظات الملحق',form.annexKind==='correction')}
        </div>
        <Notice>{form.annexKind==='correction'?'استخدم «كمية من الجرد السابق» للأصناف التي سبق تسجيل شرائها. يظهر فرق التكلفة عند معاينة الاستلام.':'أضف أصناف الملحق ومصاريفه، ثم سجّل استلامه ليدخل المخزون.'}</Notice>
      </>;
      label='إنشاء الملحق';
      break;
    case 'sharedCost': {
      const source=sources.find(cost=>cost.id===form.sourceCostId);
      unavailable=!source;
      action={type:'cost.share',payload:{...form,containerId:modal.annex.id}};
      content=<>
        <div className="form-grid">
          <Field label="المصروف المسجل في الحاوية الأصلية" wide><select required value={form.sourceCostId} onChange={e=>set('sourceCostId',e.target.value)}>
            {sources.map(cost=><option key={cost.id} value={cost.id}>{cost.name} · {money(sharedCostRemaining(state,cost))} متاح</option>)}
          </select></Field>
          {field('حصة الملحق '+(source?currencyNames[source.currency]:''),'amount',{type:'number',min:'.000001',step:'any',required:true})}
          {notes('سبب التخصيص / مرجع المستند',parent?.status==='final'||modal.annex.annexKind==='correction')}
        </div>
        <Notice>تُخصم حصة الملحق من المصروف المسجل في الحاوية الأصلية. إجمالي المصروف يبقى كما هو.</Notice>
      </>;
      break;
    }
    case 'recoverReceipt': {
      const original=priorItems.find(item=>item.id===form.itemId);
      unavailable=!original;
      action={type:'receipt.recover',payload:{...form,containerId:modal.annex.id}};
      content=original?<div className="form-grid">
        <Field label="الصنف من الجرد الأصلي" wide><select value={form.itemId} onChange={e=>set('itemId',e.target.value)}>
          {priorItems.map(item=><option key={item.id} value={item.id}>{item.model} · {item.name} · {item.color} {item.size} · فرق {qty(remainingShortage(state,item))} قطعة</option>)}
        </select></Field>
        {field('الكمية الموجودة فعليًا','quantity',{type:'number',min:1,max:remainingShortage(state,original),step:1,required:true})}
        {notes('ملاحظات المطابقة')}
        <p className="hint field-wide">يُعاد توزيع قيمة الشراء المسجلة على القطع السليمة المؤكدة في السندين عند الاستلام.</p>
      </div>:<Notice>لا توجد كمية من جرد الحاوية الأصلية متاحة للإضافة إلى هذا السند.</Notice>;
      break;
    }
    case 'details':
      action={type:'item.details',payload:{...form,id:modal.item.id}};
      content=<>
        <div className="form-grid">{field('اسم الصنف','name',{required:true})}{field('رقم الموديل','model',{required:true})}
          {field('اللون','color')}{field('المقاس','size')}{field('الباركود','barcode')}{notes('ملاحظات الصنف')}
        </div>
        <Notice>يُصحح هذا التعديل بيانات الصنف في جميع دفعاته. تحتفظ الفواتير المسجلة ببيانات الصنف وقت البيع.</Notice>
      </>;
      break;
    case 'adjust': {
      const batch=batches.find(entry=>entry.item.id===form.itemId);
      const kind=form.movementKind as StockMovement['kind'];
      const count=Number(form.quantity);
      const loss=kind==='grade'?Math.max(0,(batch?.cost??0)-amount('netUnitValue'))*count:(batch?.cost??0)*count;
      unavailable=!batch;
      action={type:'stock.record',payload:{itemId:form.itemId,kind,date:form.date,reason:form.notes,quantity:count,
        amount:amount('amount'),netUnitValue:amount('netUnitValue'),price:form.price?Number(form.price):undefined}};
      content=batch?<>
        <div className="form-grid">
          <Field label="الدفعة" wide><select value={form.itemId} onChange={e=>set('itemId',e.target.value)}>
            {batches.map(entry=><option key={entry.item.id} value={entry.item.id}>{state.containers.find(container=>container.id===entry.item.containerId)?.code} · {qty(entry.quantity)} قطعة · {money(entry.cost)} للقطعة</option>)}
          </select></Field>
          <Field label="نوع التسوية"><select value={kind} onChange={e=>set('movementKind',e.target.value)}>
            {Object.entries(stockMovementLabels).filter(([key])=>!batch.item.gradeOf||(key!=='grade'&&key!=='cost')).map(([key,name])=><option key={key} value={key}>{name}</option>)}
          </select></Field>
          {field('تاريخ الحركة','date',{type:'date',min:itemReceiptDate(state,batch.item),max:today(),required:true})}
          {kind==='cost'?moneyField('المصروف الفعلي بالشيكل','amount',0.01):field('الكمية','quantity',{type:'number',min:1,max:batch.quantity,step:1,required:true})}
          {kind==='grade'&&<>{moneyField('صافي القيمة الممكن تحصيلها للقطعة','netUnitValue',0.01)}
            {field('سعر بيع الدرجة الثانية بالشيكل','price',{type:'number',min:0.01,step:0.01})}</>}
          {notes('السبب / مرجع المستند',true)}
        </div>
        {kind==='cost'?<Notice>استخدمها لمصروف وصول جديد يخص القطع السليمة المتبقية. {qty(batch.quantity)} قطعة بتكلفة {money(batch.cost+amount('amount')/batch.quantity)} للقطعة بعد التحميل.</Notice>:
          <Notice>خسارة المخزون المتوقعة {money(Math.round(loss))}. {kind==='grade'?'تنتقل القطع إلى رصيد الدرجة الثانية بسعر بيع مستقل.':'تُخصم الكمية من الرصيد المتاح للدفعة.'}</Notice>}
      </>:<Notice>لا توجد قطع متاحة للتسوية في هذا الصنف.</Notice>;
      label='حفظ الحركة';
      break;
    }
    case 'recoveryPrice': {
      const price=recoveryPricing(state,modal.movement,amount('price'),Number(form.quantity));
      unavailable=!recoveryGroup?.quantity;
      action={type:'stock.recoveryPrice',payload:{id:modal.movement.id,base:price.base,quantity:price.quantity}};
      content=<>
        <div className="form-grid">
          {moneyField('سعر البيع قبل التعويض','price')}
          {field('كمية التغطية','quantity',{type:'number',min:1,max:recoveryGroup?.quantity||0,step:1,required:true})}
        </div>
        <div className="breakdown">
          <div><span>الخسارة المسجلة</span><strong>{money(movementLoss(state,modal.movement))}</strong></div>
          <div><span>إضافة لكل قطعة</span><strong>{money(price.perPiece)}</strong></div>
          <div><span>إجمالي التغطية بعد التقريب</span><strong>{money(price.total)}</strong></div>
          <div><span>سعر البيع المقترح للقطعة</span><strong>{money(price.price)}</strong></div>
        </div>
        <p className="hint">يُعتمد السعر الجديد للقطع السليمة من الصنف في عمليات البيع القادمة.</p>
      </>;
      label='اعتماد السعر';
      break;
    }
  }

  return <form onSubmit={event=>{event.preventDefault();void onSave(action);}}>
    {content}
    <div className="modal-actions">
      <button type="button" className="button" onClick={onCancel} disabled={saving}>إلغاء</button>
      <button type="submit" className="button primary" disabled={saving||unavailable}>{saving?<LoaderCircle className="spin"/>:<Check/>}{label}</button>
    </div>
  </form>;
}

function ImportEditor({container,state,demo,saving,onSave,onCancel}:{container:Container;state:State;demo:boolean;saving:boolean;onSave:(a:Action)=>Promise<void>;onCancel:()=>void}){
  const [rows,setRows]=useState<string[][]>([]),[mapping,setMapping]=useState<Partial<Record<ImportField,number>>>({}),[filename,setFilename]=useState(''),[error,setError]=useState(''),[reading,setReading]=useState(false),[paste,setPaste]=useState('');
  const preview=useMemo(()=>{if(rows.length<2)return {entries:[],error:''};try{return {entries:previewRows(rows,mapping,container,state.items),error:''};}catch(e){return {entries:[],error:e instanceof Error?e.message:'تعذرت قراءة الكشف.'};}},[rows,mapping,container,state.items]);
  const good=preview.entries.filter(r=>!r.errors.length);
  function load(data:string[][],name:string){if(data.length<2)throw Error('يجب أن يحتوي الملف صف عناوين وصف بيانات واحدًا على الأقل.');if(data.length>1501)throw Error('استورد 1500 صنف كحد أقصى في كل دفعة.');setRows(data);setMapping(automaticMapping(data[0]));setFilename(name);setError('');}
  async function choose(file?:File){if(!file)return;setReading(true);setError('');try{if(!/\.(xlsx|csv|tsv)$/i.test(file.name))throw Error('اختر ملف Excel بصيغة .xlsx أو CSV / TSV.');load(await readSpreadsheet(file),file.name);}catch(e){setError(e instanceof Error?e.message:'تعذرت قراءة الملف.');}finally{setReading(false);}}
  function template(){csvDownload('tajer-items-template.csv',[['model','name','color','size','quantity','purchase','currency','fx','volume','weight','price','barcode','notes'],['MOD-001','اسم الصنف','أسود','M',100,10,container.currency,container.fx,1,20,20,'','استبدل هذه القيم ببياناتك']]);}
  const mappingFields=(list:typeof importFields)=><div className="form-grid">{list.map(f=><Field key={f.key} label={f.label+(f.required?' *':'')}><select value={mapping[f.key]??''} onChange={e=>setMapping(m=>({...m,[f.key]:e.target.value===''?undefined:Number(e.target.value)}))}><option value="">{f.required?'اختر العمود':'غير مستخدم'}</option>{rows[0]?.map((h,index)=><option key={index} value={index}>{h||'عمود '+(index+1)}</option>)}</select></Field>)}</div>;
  return <><div className="import-steps"><span className="active">1. اختيار الكشف</span><ChevronLeft size={15}/><span className={rows.length?'active':''}>2. مطابقة ومراجعة</span><ChevronLeft size={15}/><span>3. استيراد</span></div>
    <label className="file-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();choose(e.dataTransfer.files[0]);}}><input type="file" accept=".xlsx,.csv,.tsv" onChange={e=>choose(e.target.files?.[0])}/>{reading?<LoaderCircle className="spin"/>:<FileSpreadsheet/>}<strong>{filename||'اختر كشف الأصناف أو اسحبه هنا'}</strong><span>Excel .xlsx أو CSV / TSV · حتى 5 ميغابايت</span></label>
    <div className="actions"><button className="button small" onClick={template}><Download size={16}/>تحميل قالب الأعمدة</button>{demo&&<button className="button small" onClick={()=>choose(sampleWorkbookFile())} disabled={reading}><FileSpreadsheet size={16}/>تجربة كشف Excel</button>}<small className="muted">المورد والعملة وسعر الصرف تؤخذ من الحاوية عند عدم وجودها في الملف.</small></div>
    <details className="extra-fields"><summary>لصق جدول من Excel أو نص CSV<ChevronDown size={16}/></summary><Field label="الصق الجدول مع صف العناوين"><textarea dir="auto" rows={5} value={paste} onChange={e=>setPaste(e.target.value)} placeholder="model,name,quantity,purchase"/></Field><button className="button small" onClick={()=>{try{load(parseCSV(paste),'جدول ملصق');}catch(e){setError(e instanceof Error?e.message:'راجع صيغة الجدول.');}}}>قراءة الجدول</button></details>
    {error&&<ErrorNote>{error}</ErrorNote>}
    {rows.length>0&&<><h3 className="editor-section-title">مطابقة الأعمدة الأساسية</h3>{mappingFields(importFields.filter(f=>f.required))}<details className="extra-fields"><summary>الأعمدة الاختيارية: اللون والمقاس والعملات والملاحظات<ChevronDown size={16}/></summary>{mappingFields(importFields.filter(f=>!f.required))}</details>{preview.error&&<ErrorNote>{preview.error}</ErrorNote>}{!!preview.entries.length&&<><div className="import-counts"><span><CheckCircle2 size={16}/>{good.length} صف صالح وجديد</span><span className={preview.entries.length-good.length?'danger-text':''}><CircleAlert size={16}/>{preview.entries.length-good.length} صف يحتاج مراجعة</span></div><DataTable headers={['السطر','الموديل','الكمية','الحالة']} rows={preview.entries.slice(0,50).map(r=>[String(r.line),String(r.raw.model||'—'),String(r.raw.quantity||'—'),r.errors.length?<span key="error" className="danger-text">{r.errors.join(' · ')}</span>:<span key="ok" className="profit-text">صالح للاستيراد</span>])}/>{preview.entries.length>50&&<p className="hint">تُعرض أول 50 نتيجة، ويشمل الاستيراد جميع الصفوف السليمة.</p>}</>}</>}
    <div className="modal-actions"><button className="button" onClick={onCancel} disabled={saving}>إلغاء</button><button className="button primary" disabled={saving||reading||!good.length} onClick={()=>onSave({type:'items.add',payload:{containerId:container.id,items:good.map(r=>r.raw)}})}>{saving?<LoaderCircle className="spin"/>:<Upload/>}استيراد {good.length?good.length+' صنفًا سليمًا':'الأصناف'}</button></div>
  </>;
}

function SaleDetails({state,sale}:{state:State;sale:Sale}){
  const customer=state.customers.find(c=>c.id===sale.customerId),cost=saleCost(state,sale),provisional=sale.lines.some(l=>l.allocations.some(a=>state.containers.find(c=>c.id===state.items.find(i=>i.id===a.itemId)?.containerId)?.status!=='final'));
  return <><div className="document-heading"><div><strong>{sale.number}</strong><span>{sale.date}</span></div><Badge status={sale.voided?'neutral':sale.total>sale.paid?'received':'final'} label={sale.voided?'ملغاة':sale.total>sale.paid?'متبقي على الحساب':'مدفوعة'}/></div><div className="document-customer"><Users size={18}/><strong>{customer?.name||'—'}</strong><span>{paymentLabels[sale.method]}</span></div>
    <DataTable headers={['الموديل','الكمية','سعر القطعة','صافي السطر']} rows={sale.lines.map(l=>[<ItemName key={l.key} item={l}/>,qty(l.quantity),money(cents(l.price)),money(l.net)])}/>
    <div className="document-totals"><div><span>خصم الفاتورة</span><strong>{money(sale.discount)}</strong></div><div><span>صافي الفاتورة</span><strong>{money(sale.total)}</strong></div><div><span>المدفوع</span><strong>{money(sale.paid)}</strong></div><div><span>المتبقي</span><strong>{money(sale.total-sale.paid)}</strong></div><div className="profit-row"><span>الربح الإجمالي {provisional?'التقديري':''}</span><strong>{money(sale.total-cost)}</strong></div></div>
    {sale.delivery>0&&<p className="hint">مصاريف توصيل مسجلة: {money(sale.delivery)}</p>}{sale.notes&&<Panel title="ملاحظات"><p className="preserve-lines">{sale.notes}</p></Panel>}{sale.voided&&<ErrorNote>أُلغيت هذه الفاتورة: {sale.voidReason}</ErrorNote>}
  </>;
}

function BackupManager({state,demo,saving,onBackup,onRestore}:{state:State;demo:boolean;saving:boolean;onBackup:()=>void;onRestore:(s:State)=>Promise<void>}){
  const [paste,setPaste]=useState(''),[candidate,setCandidate]=useState<ReturnType<typeof parseBackup>|null>(null),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false),[snapshots,setSnapshots]=useState<Snapshot[]>([]),[reading,setReading]=useState(false);
  const summary=backupSummary(state);
  useEffect(()=>{let alive=true;if(!demo)getLocalStore().snapshots().then(rows=>{if(alive)setSnapshots(rows);}).catch(()=>{});return()=>{alive=false;};},[demo]);
  function inspect(text:string){setCandidate(null);setReviewed(false);setError('');try{setCandidate(parseBackup(text));}catch(e){setError(e instanceof Error?e.message:'تعذّرت قراءة النسخة.');}}
  async function fileChanged(file?:File){if(!file)return;if(file.size>25*1024*1024){setError('حجم النسخة أكبر من 25 ميغابايت.');return;}setReading(true);try{inspect(await file.text());}catch{setError('تعذرت قراءة الملف.');}finally{setReading(false);}}
  return <div className="backup-manager">
    <div className="backup-section"><h3><Download size={18}/>تصدير نسخة كاملة</h3><p>ملف واحد يضم الحاويات والأصناف والتكاليف والزبائن والمبيعات والدفعات. يمكنك الاحتفاظ به خارج المتصفح أو نقله إلى هاتفك أو حاسوبك.</p><div className="backup-counts"><span>{summary.containers} حاويات</span><span>{summary.annexes} ملحقات</span><span>{summary.movements} حركات مخزون</span><span>{summary.items} أصناف</span><span>{summary.sales} فواتير</span><span>{summary.customers} زبائن</span></div><button className="button primary" onClick={onBackup}><Download/>تنزيل النسخة الاحتياطية</button>{demo&&<p className="hint">أنت داخل المثال التجريبي. الملف الذي ستنزله يحتوي بيانات المثال فقط.</p>}</div>
    <div className="backup-section"><h3><Upload size={18}/>استعادة أو نقل البيانات</h3><p>اختر ملف JSON من هذه النسخة أو من البرنامج السابق. ستظهر محتوياته للمراجعة قبل الاستعادة.</p><Field label="اختيار نسخة احتياطية JSON"><input type="file" accept=".json,application/json" disabled={saving||reading} onChange={e=>fileChanged(e.target.files?.[0])}/></Field><details className="extra-fields"><summary>لصق نص النسخة الاحتياطية<ChevronDown size={16}/></summary><Field label="نص النسخة الاحتياطية JSON"><textarea rows={6} dir="ltr" spellCheck={false} value={paste} onChange={e=>setPaste(e.target.value)}/></Field><button className="button small" onClick={()=>inspect(paste)} disabled={saving||reading}>فحص النسخة</button></details>{reading&&<p className="hint">جارٍ قراءة النسخة…</p>}{error&&<ErrorNote>{error}</ErrorNote>}
      {candidate&&<><div className="backup-preview"><div><strong>نسخة سليمة وجاهزة للمراجعة</strong><small>{candidate.exportedAt?'تاريخ التصدير: '+new Date(candidate.exportedAt).toLocaleString('ar-PS'):''}</small></div><div className="backup-counts"><span>{candidate.summary.containers} حاويات</span><span>{candidate.summary.annexes} ملحقات</span><span>{candidate.summary.movements} حركات مخزون</span><span>{candidate.summary.items} أصناف</span><span>{candidate.summary.sales} فواتير</span><span>{candidate.summary.customers} زبائن</span><span>{candidate.summary.payments} دفعات</span></div>{candidate.demo&&<Notice>هذه نسخة من بيانات المثال التجريبي.</Notice>}</div><Notice>{demo?'ستُستبدل بيانات المثال التجريبي فقط، ولن تتغير بيانات جهازك الفعلية.':'ستستبدل هذه النسخة بيانات البرنامج في متصفح هذا الجهاز. ستُحفظ لقطة داخلية للبيانات الحالية قبل التغيير، ولا تتغير البيانات في الأجهزة الأخرى.'}</Notice><label className="check-row emphasized"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} disabled={saving}/>راجعت محتويات النسخة وأريد استعادتها على هذا الجهاز.</label><div className="actions"><button className="button primary" disabled={!reviewed||saving||reading} onClick={()=>onRestore(candidate.state)}>{saving?<LoaderCircle className="spin"/>:<Check/>}استعادة البيانات</button></div></>}
    </div>
    {!demo&&snapshots.length>0&&<div className="backup-section"><h3><RefreshCw size={18}/>لقطات داخلية سابقة</h3><p>تُحفظ تلقائيًا قبل الاستعادة وبعض العمليات المهمة. هذه اللقطات داخل المتصفح؛ احتفظ أيضًا بنسخة خارجية قابلة للتنزيل.</p><div className="snapshot-list">{snapshots.map(snapshot=><div key={snapshot.id}><div><strong>{snapshot.reason}</strong><small>{new Date(snapshot.createdAt).toLocaleString('ar-PS')} · {snapshot.summary.items} أصناف · {snapshot.summary.sales} فواتير</small></div><button className="button small" disabled={saving} onClick={()=>{try{setCandidate(parseBackup(makeBackup(snapshot.state)));setReviewed(false);setError('');}catch(e){setError(e instanceof Error?e.message:'تعذرت مراجعة اللقطة.');}}}>معاينة</button></div>)}</div></div>}
  </div>;
}
function CustomerStatement({state,customer}:{state:State;customer:Customer}){
  const entries:{date:string;label:string;debit:number;credit:number;order:number}[]=[];
  for(const s of state.sales.filter(s=>s.customerId===customer.id&&!s.voided)){entries.push({date:s.date,label:s.number,debit:s.total,credit:0,order:0});if(s.paid)entries.push({date:s.date,label:'دفعة '+s.number,credit:s.paid,debit:0,order:1});}
  for(const p of state.payments.filter(p=>p.customerId===customer.id))entries.push({date:p.date,label:p.notes||'دفعة على الحساب',debit:0,credit:p.amount,order:2});
  entries.sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order);let balance=customer.opening;
  return <><div className="document-customer"><Users size={18}/><div><strong>{customer.name}</strong><small className="muted block">{[customer.phone,customer.address].filter(Boolean).join(' · ')}</small></div></div><div className="statement-balance"><span>الرصيد الحالي {customerBalance(state,customer.id)<0?'الدائن':'المستحق'}</span><strong>{money(Math.abs(customerBalance(state,customer.id)))}</strong></div>
    <DataTable headers={['التاريخ','البيان','عليه','له / مدفوع','الرصيد']} rows={[[<span key="opening">—</span>,'رصيد افتتاحي',customer.opening>=0?money(customer.opening):'—',customer.opening<0?money(-customer.opening):'—',money(customer.opening)],...entries.map(e=>{balance+=e.debit-e.credit;return [e.date,e.label,e.debit?money(e.debit):'—',e.credit?money(e.credit):'—',money(balance)];})]}/>
    {customer.notes&&<p className="hint">ملاحظات: {customer.notes}</p>}
  </>;
}
function Printable({state,target}:{state:State;target:PrintTarget}){
  const company=<header className="print-heading"><div><h1>{state.settings.name}</h1><p>{state.settings.address}</p><p>{state.settings.phone}</p></div><ContainerIcon size={42}/></header>;
  if(target.kind==='sale'){
    const s=state.sales.find(v=>v.id===target.id);if(!s)return null;const customer=state.customers.find(c=>c.id===s.customerId);
    return <article className="print-document">{company}<div className="print-title"><h2>فاتورة بيع {s.voided?'— ملغاة':''}</h2><span>{s.number} · {s.date}</span></div><p>الزبون: <strong>{customer?.name}</strong>{customer?.phone?' · '+customer.phone:''}</p><DataTable headers={['الموديل / الصنف','الكمية','سعر القطعة','الإجمالي']} rows={s.lines.map(l=>[<ItemName key={l.key} item={l}/>,qty(l.quantity),money(cents(l.price)),money(l.gross)])}/><div className="document-totals"><div><span>الإجمالي قبل الخصم</span><strong>{money(s.total+s.discount)}</strong></div><div><span>الخصم</span><strong>{money(s.discount)}</strong></div><div><span>الصافي</span><strong>{money(s.total)}</strong></div><div><span>المدفوع · {paymentLabels[s.method]}</span><strong>{money(s.paid)}</strong></div><div><span>المتبقي</span><strong>{money(s.total-s.paid)}</strong></div></div><p className="print-footer">{state.settings.invoiceFooter}</p></article>;
  }
  if(target.kind==='container'){const c=state.containers.find(c=>c.id===target.id);if(!c)return null;const v=calculateContainerFamily(state,c.id);return <article className="print-document">{company}<div className="print-title"><h2>كشف جرد وتكلفة الحاوية</h2><span>{c.code} · {c.name} · {statusLabels[c.status]}</span></div><DataTable headers={['السند','الموديل والصنف','القطع','شراء الصنف','مصاريف محملة','تكلفة القطعة واصلة','سعر البيع','الربح المتوقع']} rows={v.rows.map(r=>[r.batchCode,<ItemName key={r.item.id} item={r.item}/>,qty(r.count),money(r.base),v.valid?money(r.allocated):'—',v.valid?money(r.unit):'—',money(cents(r.item.price)),v.valid?money(r.profit):'—'])}/><div className="document-totals"><div><span>إجمالي تكلفة الوصول</span><strong>{v.valid?money(v.total):'غير مكتملة'}</strong></div><div><span>المبيعات المتوقعة</span><strong>{money(v.revenue)}</strong></div><div><span>الربح الإجمالي المتوقع</span><strong>{v.valid?money(v.profit):'غير مكتمل'}</strong></div></div><p className="preserve-lines">{c.notes}</p></article>;}
  const customer=state.customers.find(c=>c.id===target.id);return customer?<article className="print-document">{company}<div className="print-title"><h2>كشف حساب</h2><span>تاريخ الإصدار: {today()}</span></div><CustomerStatement state={state} customer={customer}/></article>:null;
}
