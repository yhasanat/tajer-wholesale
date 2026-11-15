import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, perform, calculateContainer, calculateContainerFamily, inventory, report, saleCost,
  itemGroupKey, movementLoss, recoveryPricing, stockJournal,
} from '../src/lib/domain.ts';
import {makeBackup,parseBackup} from '../src/lib/backup.ts';

const run=(state,type,payload)=>perform(state,{type,payload});
const receiptDate='2026-01-02';
const saleDate='2026-01-03';
const lossDate='2026-01-04';
const costDate='2026-01-05';
const nextSaleDate='2026-01-06';
const model={model:'00102',name:'قميص',color:'أسود',size:'M',quantity:100,purchase:15,price:35};
const roundTrip=state=>parseBackup(JSON.stringify(makeBackup(state))).state;
const value=state=>Math.round(inventory(state).reduce((sum,group)=>sum+group.batches.reduce((n,batch)=>n+batch.quantity*batch.cost,0),0));

function receive(state,containerId,date,counts,notes=''){
  return run(state,'container.receive',{id:containerId,date,notes,counts});
}
function shipment({received=100,final=true}={}){
  let state=run(emptyState(),'container.save',{name:'حاوية',currency:'ILS',fx:1});
  const id=state.containers[0].id;
  state=run(state,'items.add',{containerId:id,items:[model]});
  const itemId=state.items[0].id;
  state=run(state,'cost.save',{containerId:id,name:'شحن',amount:500,basis:'quantity',confirmed:true});
  state=receive(state,id,receiptDate,[{id:itemId,received,damaged:0}],received<100?'فرق عند الجرد':'');
  if(final)state=run(state,'container.finalize',{id});
  return {state,id,itemId,key:itemGroupKey(state.items[0])};
}
function sell(state,key,quantity,date=saleDate,price=35){
  return run(state,'sale.create',{customerName:'متجر ملابس',date,method:'credit',paid:0,lines:[{key,quantity,price}]});
}
function record(state,itemId,kind,quantity,date=lossDate,details={}){
  return run(state,'stock.record',{itemId,kind,quantity,date,reason:'مستند جرد تجريبي',...details});
}

test('loss after receipt reduces stock and the period result without rewriting the receipt or sale',()=>{
  const {state,id,itemId,key}=shipment();
  const sold=sell(state,key,30);
  const adjusted=record(sold,itemId,'missing',4);
  assert.equal(adjusted.items[0].received,100);
  assert.equal(calculateContainer(adjusted,id).total,200000);
  assert.equal(inventory(adjusted)[0].quantity,66);
  assert.equal(value(adjusted),132000);
  assert.equal(saleCost(adjusted,adjusted.sales[0]),60000);
  assert.equal(report(adjusted,saleDate,saleDate).loss,0);
  assert.equal(report(adjusted,lossDate,lossDate).net,-8000);
  assert.deepEqual(stockJournal(adjusted,key).map(row=>row.balance),[66,70,100]);
  assert.throws(()=>record(adjusted,itemId,'damage',67),/تتجاوز/);
  assert.throws(()=>sell(adjusted,key,67),/تتجاوز/);
  assert.equal(value(roundTrip(adjusted)),132000);
});

test('second grade retains its recoverable value and records only the loss in value',()=>{
  const {state,itemId,key}=shipment();
  const graded=record(sell(state,key,30),itemId,'grade',4,lossDate,{netUnitValue:800,price:12});
  const normal=inventory(graded).find(group=>group.key===key);
  const grade=inventory(graded).find(group=>group.item.gradeOf);
  assert.equal(normal.quantity,66);
  assert.equal(grade.quantity,4);
  assert.equal(grade.cost,800);
  assert.equal(grade.price,12);
  assert.equal(report(graded).loss,4800);
  assert.equal(value(graded),135200);
  assert.throws(()=>sell(graded,grade.key,1,saleDate,12),/تتجاوز/);
  const sold=sell(graded,grade.key,2,nextSaleDate,12);
  assert.equal(saleCost(sold,sold.sales[1]),1600);
  assert.equal(value(roundTrip(sold)),133600);
});

test('new eligible costs apply only to the sound balance and survive sale cancellation',()=>{
  const {state,itemId,key}=shipment();
  const adjusted=record(sell(state,key,30),itemId,'damage',4);
  const withCost=record(adjusted,itemId,'cost',0,costDate,{amount:6600});
  assert.equal(withCost.stockMovements.at(-1).quantity,66);
  assert.equal(inventory(withCost)[0].cost,2100);
  assert.equal(value(withCost),138600);
  assert.equal(report(withCost).cost,60000);
  assert.equal(report(withCost).loss,8000);
  assert.throws(()=>record(withCost,itemId,'damage',1,lossDate),/يسبق/);
  const sold=sell(withCost,key,6,nextSaleDate);
  assert.equal(saleCost(sold,sold.sales[1]),12600);
  assert.equal(value(sold),126000);
  const undone=run(sold,'sale.void',{id:sold.sales[0].id,reason:'قيد مكرر'});
  assert.equal(inventory(undone)[0].quantity,90);
  assert.equal(value(undone),186000);
  assert.equal(report(roundTrip(undone)).cost,12600);
});

test('recovery pricing shows the rounding and preserves the recorded invoice and stock value',()=>{
  const {state,itemId,key}=shipment();
  const adjusted=record(sell(state,key,30),itemId,'damage',4);
  const movement=adjusted.stockMovements[0];
  assert.deepEqual(recoveryPricing(adjusted,movement,3500,66),{base:3500,quantity:66,perPiece:121,total:7986,price:3621});
  const updated=run(adjusted,'stock.recoveryPrice',{id:movement.id,base:3500,quantity:66});
  assert.equal(inventory(updated)[0].price,36.21);
  assert.equal(updated.sales[0].lines[0].price,35);
  assert.equal(value(updated),value(adjusted));
  assert.equal(report(updated).net,report(adjusted).net);
  assert.equal(roundTrip(updated).stockMovements[0].pricing.total,7986);
});

test('new goods on an annex arrive separately and do not change the parent invoice cost',()=>{
  const {state,id,key}=shipment();
  let next=sell(state,key,30);
  next=run(next,'container.annex',{parentId:id,name:'ملحق',annexKind:'addition',documentDate:lossDate});
  const annexId=next.containers.at(-1).id;
  next=run(next,'items.add',{containerId:annexId,items:[{...model,quantity:10,purchase:20}]});
  const extra=next.items.at(-1);
  next=run(next,'cost.save',{containerId:annexId,name:'نقل الملحق',amount:30,basis:'quantity',confirmed:true});
  assert.equal(inventory(next)[0].quantity,70);
  assert.equal(calculateContainerFamily(next,id).total,223000);
  next=receive(next,annexId,lossDate,[{id:extra.id,received:10,damaged:0}]);
  assert.equal(inventory(next)[0].quantity,80);
  assert.equal(inventory(next)[0].batches[1].cost,2300);
  assert.equal(value(next),163000);
  assert.equal(report(next).cost,60000);
  assert.equal(roundTrip(next).containers[1].parentId,id);
});

test('a shared freight allocation reserves the same expense before separate receipts',()=>{
  let state=run(emptyState(),'container.save',{name:'حاوية',currency:'ILS'});
  const id=state.containers[0].id;
  state=run(state,'items.add',{containerId:id,items:[model]});
  state=run(state,'cost.save',{containerId:id,name:'شحن',amount:500,basis:'quantity',confirmed:true});
  const freight=state.costs[0];
  state=run(state,'container.annex',{parentId:id,name:'ملحق',annexKind:'addition',documentDate:receiptDate});
  const annexId=state.containers[1].id;
  state=run(state,'items.add',{containerId:annexId,items:[{...model,quantity:10}]});
  state=run(state,'cost.share',{containerId:annexId,sourceCostId:freight.id,amount:50});
  assert.equal(calculateContainer(state,id).extra,45000);
  assert.equal(calculateContainer(state,annexId).extra,5000);
  assert.equal(calculateContainerFamily(state,id).total,215000);
  assert.throws(()=>run(state,'cost.share',{containerId:annexId,sourceCostId:freight.id,amount:451}),/يتجاوز/);
  state=receive(state,id,receiptDate,[{id:state.items[0].id,received:100,damaged:0}]);
  assert.throws(()=>run(state,'container.finalize',{id}),/الملحقات/);
  state=receive(state,annexId,receiptDate,[{id:state.items[1].id,received:10,damaged:0}]);
  assert.equal(value(roundTrip(state)),215000);
});

test('a documented stocktake correction transfers previously booked cost only on receipt',()=>{
  const {state,id,itemId,key}=shipment({received:90});
  let next=sell(state,key,30);
  const originalCost=report(next).cost;
  next=run(next,'container.annex',{parentId:id,name:'تصحيح',annexKind:'correction',documentDate:lossDate,notes:'تم العثور على صندوق'});
  const annexId=next.containers[1].id;
  next=run(next,'receipt.recover',{containerId:annexId,itemId,quantity:10});
  next=run(next,'cost.share',{containerId:annexId,sourceCostId:next.costs[0].id,amount:50,notes:'فاتورة الشحن'});
  assert.equal(report(next).cost,originalCost);
  assert.equal(calculateContainerFamily(next,id).total,200000);
  assert.equal(inventory(next)[0].quantity,60);
  next=receive(next,annexId,lossDate,[{id:next.items[1].id,received:10,damaged:0}]);
  assert.equal(next.items[0].received,90);
  assert.equal(next.items[1].purchase,0);
  assert.equal(calculateContainerFamily(next,id).total,200000);
  assert.equal(value(next)+Math.round(report(next).cost),200000);
  assert.equal(next.containers[1].correctionEffect.salesCost,Math.round(report(next).cost-originalCost));
  assert.equal(roundTrip(next).items[1].recoveryOf,itemId);
});

test('model correction preserves stable allocation IDs and historical invoice details',()=>{
  const {state,itemId,key}=shipment();
  const sold=sell(state,key,3);
  const corrected=run(sold,'item.details',{...sold.items[0],id:itemId,model:'00102B',name:'قميص قطن',barcode:'000123'});
  assert.equal(inventory(corrected)[0].key,key);
  assert.equal(inventory(corrected)[0].item.model,'00102B');
  assert.equal(corrected.sales[0].lines[0].model,'00102');
  assert.equal(report(corrected).cost,6000);
  assert.equal(sell(roundTrip(corrected),key,1).sales[1].lines[0].model,'00102B');
  for(const version of [1,2]){
    const backup=makeBackup(sold);
    backup.version=version;
    delete backup.state.stockMovements;
    assert.deepEqual(parseBackup(backup).state,sold);
  }
});

test('invalid settlement backups cannot create fictitious stock',()=>{
  const {state,itemId}=shipment();
  const backup=makeBackup(record(state,itemId,'damage',4));
  backup.state.stockMovements[0].quantity=101;
  assert.throws(()=>parseBackup(backup),/كمية حركة أكبر/);
  const graded=makeBackup(record(state,itemId,'grade',4,lossDate,{netUnitValue:800}));
  graded.state.stockMovements[0].outputItemId='missing';
  assert.throws(()=>parseBackup(graded),/دفعة درجة ثانية/);
  assert.equal(movementLoss(state,{kind:'cost',itemId,quantity:1}),0);
});
