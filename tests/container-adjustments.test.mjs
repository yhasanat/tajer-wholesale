import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {
  emptyState,perform,calculateContainer,calculateContainerFamily,inventory,report,
  familyCosts,costScope,costAllocatedToBatch,itemGroupKey,stockJournal,customerBalance,
} from '../src/lib/domain.ts';
import {makeBackup,parseBackup} from '../src/lib/backup.ts';
import {createLocalStore,ConflictError} from '../src/lib/local-store.ts';

const receiptDate='2026-01-02';
const changeDate='2026-01-05';
const run=(state,type,payload)=>perform(state,{type,payload});
const roundTrip=state=>parseBackup(JSON.stringify(makeBackup(state))).state;
const stockValue=state=>inventory(state).reduce((sum,group)=>sum+group.batches.reduce((n,batch)=>n+batch.quantity*batch.cost,0),0);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<0.00001,`${actual} differs from ${expected}`);

function batch({quantity=200,purchase=20,currency='ILS',fx=1,received=quantity}={}){
  let state=run(emptyState(),'container.save',{name:'Original',currency,fx});
  const id=state.containers[0].id;
  state=run(state,'items.add',{containerId:id,items:[{model:'M1',name:'Shirt',quantity,purchase,price:40,volume:2,weight:10}]});
  const itemId=state.items[0].id;
  state=run(state,'container.receive',{id,date:receiptDate,counts:[{id:itemId,received,damaged:0}],notes:'Verified count'});
  state=run(state,'container.finalize',{id});
  return {state,id,itemId};
}
function family({annexReceived=true,basis='quantity'}={}){
  let state=run(emptyState(),'container.save',{name:'Original',currency:'ILS'});
  const id=state.containers[0].id;
  state=run(state,'items.add',{containerId:id,items:[{model:'M1',name:'Shirt',quantity:100,purchase:10,price:40,volume:2,weight:10}]});
  const itemId=state.items[0].id;
  state=run(state,'cost.save',{containerId:id,name:'Freight',amount:900,basis,confirmed:true});
  state=run(state,'container.annex',{parentId:id,name:'Annex',annexKind:'addition',documentDate:receiptDate});
  const annexId=state.containers[1].id;
  state=run(state,'items.add',{containerId:annexId,items:[{model:'M2',name:'Jacket',quantity:50,purchase:20,price:50,volume:1,weight:30}]});
  const annexItemId=state.items[1].id;
  state=run(state,'cost.save',{containerId:annexId,name:'Annex costs',amount:300,basis,confirmed:true});
  state=run(state,'container.receive',{id,date:receiptDate,counts:[{id:itemId,received:100,damaged:0}]});
  if(annexReceived)state=run(state,'container.receive',{id:annexId,date:receiptDate,counts:[{id:annexItemId,received:50,damaged:0}]});
  state=run(state,'container.finalize',{id});
  if(annexReceived)state=run(state,'container.finalize',{id:annexId});
  return {state,id,itemId,annexId,annexItemId};
}
function sharing(state,id,enabled=true,overrides={}){
  return run(state,'container.sharing',{id,enabled,date:changeDate,reason:'Shared shipment documents',
    scopes:familyCosts(state,id).map(cost=>({costId:cost.id,scope:overrides[cost.id]??costScope(cost)}))});
}
function correct(state,itemId,count,extra={}){
  return run(state,'receipt.correct',{itemId,count,date:changeDate,reason:'Receipt counting error',...extra});
}
function sell(state,itemId,quantity=50){
  const item=state.items.find(row=>row.id===itemId);
  return run(state,'sale.create',{customerName:'Buyer',date:'2026-01-03',lines:[{key:itemGroupKey(item),quantity,price:40}],method:'cash',paid:10000});
}

test('family quantity sharing includes parent and annex costs once and preserves purchase values',()=>{
  const {state,id,annexId}=family();
  const next=sharing(state,id);
  const original=calculateContainer(next,id),annex=calculateContainer(next,annexId);
  assert.equal(original.base,100000);assert.equal(annex.base,100000);
  assert.equal(original.extra,80000);assert.equal(annex.extra,40000);
  assert.equal(calculateContainerFamily(next,id).total,320000);
  assert.equal(costAllocatedToBatch(next,next.costs[0],id),60000);
  assert.equal(costAllocatedToBatch(next,next.costs[0],annexId),30000);
  assert.equal(roundTrip(next).containers[0].shareCosts,true);
});

test('private and direct costs stay on their document or target when sharing is enabled',()=>{
  let {state,id,annexId}=family();
  const privateCost=state.costs[1];
  const next=sharing(state,id,true,{[privateCost.id]:'container'});
  assert.equal(calculateContainer(next,id).extra,60000);
  assert.equal(calculateContainer(next,annexId).extra,60000);
  const direct=structuredClone(state.costs[0]);direct.id='direct';direct.amount=90;direct.basis='direct';direct.target=state.items[0].id;
  state={...state,costs:[...state.costs,direct]};
  const targeted=sharing(state,id);
  assert.equal(calculateContainer(targeted,id).extra,89000);
  assert.equal(calculateContainer(targeted,annexId).extra,40000);
  assert.equal(targeted.costs.at(-1).scope,'container');
});

test('family value, volume and weight bases use the union of the item measures',()=>{
  for(const [basis,parentShare] of [['value',60000],['volume',80000],['weight',30000]]){
    const {state,id,annexId}=family({basis});
    const next=sharing(state,id);
    assert.equal(calculateContainer(next,id).extra,parentShare);
    assert.equal(calculateContainer(next,annexId).extra,120000-parentShare);
  }
});

test('legacy manual shares are suspended without duplication and are restored when sharing is disabled',()=>{
  let {state,id,annexId}=family({annexReceived:false});
  // Use an unfinalized source to create the legacy manual share before receipt.
  state=structuredClone(state);state.containers[0].status='received';
  state=run(state,'cost.share',{containerId:annexId,sourceCostId:state.costs[0].id,amount:100,notes:'Manual share'});
  const originalTotal=calculateContainerFamily(state,id).total;
  const originalParent=calculateContainer(state,id).total;
  const next=sharing(state,id);
  assert.equal(calculateContainerFamily(next,id).total,originalTotal);
  assert.equal(costAllocatedToBatch(next,next.costs.at(-1)),0);
  assert.equal(next.costs.at(-1).amount,100);
  const disabled=sharing(next,id,false);
  assert.equal(calculateContainer(disabled,id).total,originalParent);
  assert.equal(calculateContainerFamily(disabled,id).total,originalTotal);
  assert.equal(roundTrip(disabled).valuationChanges.length,2);
});

test('sharing can be enabled after final receipt and previews the exact effect on sold and remaining stock',()=>{
  const {state,id,itemId}=family();
  const sold=sell(state,itemId,20);
  const next=sharing(sold,id);
  assert.deepEqual(next.sales,sold.sales);
  assert.equal(next.containers[0].status,'final');
  assert.equal(report(sold).cost,38000);assert.equal(report(next).cost,36000);
  const effect=next.valuationChanges[0].effect;
  assert.deepEqual(effect,{stockValue:2000,salesCost:-2000,stockLoss:0});
  assert.equal(next.valuationChanges[0].date,changeDate);
});

test('incoming annexes participate in estimates and cannot enter sellable stock before receipt',()=>{
  const {state,id,annexId}=family({annexReceived:false});
  const next=sharing(state,id);
  assert.equal(inventory(next).reduce((sum,row)=>sum+row.quantity,0),100);
  assert.equal(calculateContainer(next,id).extra,80000);
  assert.equal(calculateContainer(next,id).provisional,true);
  assert.equal(calculateContainer(next,annexId).provisional,true);
  assert.equal(roundTrip(next).containers.length,2);
});

test('missing family dimensions and invalid scope documents fail atomically',()=>{
  const {state,id}=family({basis:'volume'});
  const bad=structuredClone(state);bad.items[1].volume=0;
  assert.throws(()=>sharing(bad,id),/الحجم/);assert.equal(bad.valuationChanges.length,0);
  assert.throws(()=>run(state,'container.sharing',{id,enabled:true,date:changeDate,reason:'Test',scopes:[]}),/نطاق/);
  assert.throws(()=>run(state,'container.sharing',{id:state.containers[1].id,enabled:true,scopes:[]}),/الأصلية/);
});

test('200 to 201 fixes receipt quantity while retaining the existing invoiced purchase total',()=>{
  const {state,id,itemId}=batch();
  const next=correct(state,itemId,201);
  assert.equal(next.items[0].quantity,200);assert.equal(next.items[0].received,201);
  assert.equal(inventory(next)[0].quantity,201);
  assert.equal(calculateContainer(next,id).base,400000);
  near(calculateContainer(next,id).rows[0].unit,400000/201);
  const journal=stockJournal(next,itemGroupKey(next.items[0]));
  assert.equal(journal.find(row=>row.label==='استلام').change,200);
  assert.equal(journal.find(row=>row.label==='تصحيح كمية الاستلام').change,1);
  assert.equal(journal[0].balance,201);
  assert.equal(roundTrip(next).valuationChanges[0].before,200);
});

test('correction after sales conserves total cost and leaves invoice quantities, prices and payments intact',()=>{
  const {state,itemId}=batch();
  const sold=sell(state,itemId);
  const next=correct(sold,itemId,201);
  assert.equal(inventory(next)[0].quantity,151);
  assert.deepEqual(next.sales,sold.sales);
  assert.equal(customerBalance(next,next.sales[0].customerId),customerBalance(sold,sold.sales[0].customerId));
  near(stockValue(next)+report(next).cost,400000);
  near(report(next).cost,50*400000/201);
  assert.equal(next.valuationChanges[0].effect.salesCost,-498);
  assert.equal(next.valuationChanges[0].effect.stockValue,498);
  assert.equal(roundTrip(next).items[0].received,201);
});

test('physical stock counting compares against the balance after sales and losses',()=>{
  const {state,itemId}=batch();
  let next=sell(state,itemId);
  next=run(next,'stock.record',{itemId,kind:'missing',quantity:2,date:'2026-01-04',reason:'Confirmed missing'});
  next=correct(next,itemId,149,{mode:'stock'});
  assert.equal(next.items[0].received,201);
  assert.equal(inventory(next)[0].quantity,149);
  assert.equal(next.valuationChanges[0].count,149);
  assert.equal(roundTrip(next).items[0].received,201);
});

test('additional paid pieces increase purchase value using the explicit shekel amount',()=>{
  const {state,id,itemId}=batch({purchase:5,currency:'USD',fx:4});
  const next=correct(state,itemId,201,{purchaseAmount:2000});
  assert.equal(calculateContainer(next,id).base,402000);
  assert.equal(calculateContainer(next,id).rows[0].unit,2000);
  assert.equal(next.valuationChanges[0].effect.stockValue,2000);
  assert.equal(roundTrip(next).valuationChanges[0].purchaseAmount,2000);
});

test('decreases cannot remove already consumed stock and repeated corrections form one consistent history',()=>{
  const {state,itemId}=batch();
  const sold=sell(state,itemId,150);
  assert.throws(()=>correct(sold,itemId,149),/أقل من/);
  assert.equal(sold.items[0].received,200);
  assert.throws(()=>correct(state,itemId,200.5),/صحيح/);
  let next=correct(sold,itemId,201);
  next=correct(next,itemId,199);
  assert.equal(inventory(next)[0].quantity,49);
  assert.equal(roundTrip(next).valuationChanges.length,2);
  const bad=makeBackup(next);bad.state.valuationChanges[1].before=200;
  assert.throws(()=>parseBackup(bad),/تسلسل/);
});

test('receipt recovery and family sharing conserve previously recorded purchase and freight costs',()=>{
  let {state,id,itemId}=batch({quantity:100,purchase:15,received:90});
  state=run(state,'container.annex',{parentId:id,name:'Correction',annexKind:'correction',documentDate:changeDate,notes:'Box found'});
  const annexId=state.containers[1].id;
  state=run(state,'receipt.recover',{containerId:annexId,itemId,quantity:10});
  state=sharing(state,id);
  assert.equal(calculateContainerFamily(state,id).total,150000);
  const recoveredId=state.items[1].id;
  state=run(state,'container.receive',{id:annexId,date:changeDate,counts:[{id:recoveredId,received:10,damaged:0}]});
  assert.equal(calculateContainerFamily(state,id).total,150000);
  assert.equal(calculateContainer(state,id).base,135000);
  assert.equal(calculateContainer(state,annexId).base,15000);
  assert.throws(()=>correct(state,itemId,91),/ملحق/);
  assert.equal(roundTrip(state).items.length,2);
});

test('legacy version 3 backups gain an empty audit collection and version 4 requires it',()=>{
  const {state}=batch();
  const old=makeBackup(state);old.version=3;delete old.state.valuationChanges;
  assert.deepEqual(parseBackup(old).state.valuationChanges,[]);
  const current=makeBackup(state);delete current.state.valuationChanges;
  assert.throws(()=>parseBackup(current),/سجل تصحيح/);
});

test('receipt correction retries, conflicts, automatic snapshots and restore retain consistent stock',async()=>{
  const {state,itemId}=batch();
  const store=createLocalStore({factory:new IDBFactory(),name:'correction-atomic'});
  await store.restore(state,0,'seed');
  const action={type:'receipt.correct',payload:{itemId,count:201,date:changeDate,reason:'Count verification'}};
  const saved=await store.mutate(1,'correct',action);
  const retry=await store.mutate(1,'correct',action);
  assert.equal(retry.entityId,saved.entityId);
  assert.equal(retry.state.valuationChanges.length,1);
  await assert.rejects(()=>store.mutate(1,'stale',action),error=>error instanceof ConflictError);
  const snapshots=await store.snapshots();
  assert.equal(snapshots.length,1);assert.equal(snapshots[0].state.items[0].received,200);
  const restored=await store.restore(roundTrip(saved.state),2,'restore');
  assert.equal(restored.state.items[0].received,201);
  assert.equal(restored.state.valuationChanges.length,1);
  await store.close();
});
