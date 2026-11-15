import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,perform,itemGroupKey,availableSaleStock,previewSaleLineCost,saleLineCost,inventory,report} from '../src/lib/domain.ts';
import {makeBackup,parseBackup} from '../src/lib/backup.ts';

const change=(state,type,payload)=>perform(state,{type,payload});
const details={model:'7-1',name:'قميص',color:'أسود',size:'M',price:40};
const firstDate='2026-01-01';
const nextDate='2026-01-04';
const saleDate='2026-01-06';

function sampleStock(){
  let state=change(emptyState(),'container.save',{name:'الدفعة الأولى',supplier:'المورد الأول',currency:'USD',fx:4});
  const cid=state.containers[0].id;
  state=change(state,'items.add',{containerId:cid,items:[{...details,quantity:5,purchase:3.5,currency:'USD',fx:4}]});
  const first=state.items[0];
  state=change(state,'cost.save',{containerId:cid,name:'شحن',amount:10,basis:'quantity',confirmed:true});
  state=change(state,'container.receive',{id:cid,date:firstDate,counts:[{id:first.id,received:5,damaged:0}]});
  state=change(state,'container.finalize',{id:cid});
  state=change(state,'container.annex',{parentId:cid,name:'الدفعة الثانية',supplier:'المورد الثاني',annexKind:'addition',documentDate:nextDate});
  const annexId=state.containers.at(-1).id;
  state=change(state,'items.add',{containerId:annexId,items:[{...details,quantity:7,purchase:18,currency:'ILS',fx:1}]});
  const second=state.items[1];
  state=change(state,'cost.save',{containerId:annexId,name:'نقل',amount:21,basis:'quantity',confirmed:false});
  state=change(state,'container.receive',{id:annexId,date:nextDate,counts:[{id:second.id,received:7,damaged:0}]});
  state=change(state,'stock.record',{itemId:second.id,kind:'cost',date:'2026-01-05',amount:700,reason:'تخليص إضافي'});
  return {state,key:itemGroupKey(first),first,second};
}

test('preview and saved invoice use the same FIFO quantities and unrounded costs for two batches',()=>{
  const {state,key,first,second}=sampleStock();
  const line={key,quantity:8,price:40};
  const serialized=JSON.stringify(state);
  const preview=previewSaleLineCost(state,line,saleDate);
  assert.deepEqual(preview.batches.map(batch=>[batch.itemId,batch.quantity,batch.purchase,batch.currency,batch.unitCost,batch.provisional]),[
    [first.id,5,3.5,'USD',1600,false],
    [second.id,3,18,'ILS',2200,true],
  ]);
  assert.equal(preview.total,14600);
  assert.equal(preview.averageUnitCost,1825);
  assert.equal(JSON.stringify(state),serialized);
  const sold=change(state,'sale.create',{customerName:'زبون',date:saleDate,lines:[line],discount:100,paid:0,method:'credit'});
  const invoice=sold.sales.at(-1);
  assert.deepEqual(invoice.lines[0].allocations,[{itemId:first.id,quantity:5},{itemId:second.id,quantity:3,extraUnitCost:100}]);
  assert.equal(saleLineCost(sold,invoice.lines[0]),preview.total);
  assert.equal(invoice.total,31900);
  assert.equal(report(sold).gross,17300);
  assert.equal(inventory(sold)[0].quantity,4);
  assert.deepEqual(parseBackup(makeBackup(sold)).state,sold);
});

test('cost preview follows the selected sale date and actual sale validation',()=>{
  const {state,key}=sampleStock();
  const line={key,quantity:5,price:40};
  const preview=previewSaleLineCost(state,line,nextDate);
  assert.equal(availableSaleStock(state,nextDate).get(key),5);
  assert.equal(availableSaleStock(state,saleDate).get(key),12);
  assert.equal(preview.batches.length,1);
  assert.equal(preview.total,8000);
  assert.throws(()=>previewSaleLineCost(state,{key,quantity:6},nextDate),/في تاريخ الفاتورة/);
  assert.throws(()=>change(state,'sale.create',{customerName:'زبون',date:nextDate,lines:[{...line,quantity:6}]}),/في تاريخ الفاتورة/);
  assert.throws(()=>previewSaleLineCost(state,{key,quantity:0},saleDate),/صحيحة/);
  assert.throws(()=>previewSaleLineCost(state,line,'2026-02-30'),/تاريخًا صحيحًا/);
});

test('a later copied row previews the remaining FIFO batches after rows for the same model',()=>{
  const {state,key,second}=sampleStock();
  const earlier={key,quantity:5,price:40};
  const later={key,quantity:3,price:38};
  const preview=previewSaleLineCost(state,later,saleDate,[earlier]);
  assert.deepEqual(preview.batches.map(batch=>[batch.itemId,batch.quantity]),[[second.id,3]]);
  const sold=change(state,'sale.create',{customerName:'زبون',date:saleDate,lines:[earlier,later]});
  assert.equal(preview.total,saleLineCost(sold,sold.sales.at(-1).lines[1]));
});

test('second-grade stock shows its source purchase price and its own carrying value',()=>{
  const {state,first}=sampleStock();
  const graded=change(state,'stock.record',{
    itemId:first.id,kind:'grade',quantity:2,date:saleDate,netUnitValue:650,price:12,reason:'عيب جزئي',
  });
  const item=graded.items.find(row=>row.gradeOf);
  const preview=previewSaleLineCost(graded,{key:itemGroupKey(item),quantity:2},saleDate);
  assert.deepEqual(preview.batches.map(batch=>[batch.purchase,batch.currency,batch.unitCost]),[[3.5,'USD',650]]);
});
