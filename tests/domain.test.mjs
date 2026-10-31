import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,perform,calculateContainer,split,inventory,saleCost,customerBalance,report,variant,createdEntityId} from '../src/lib/domain.ts';
const run=(s,type,payload)=>perform(s,{type,payload});
function shipment(){
  let s=run(emptyState(),'container.save',{name:'Test shipment',currency:'ILS',fx:1});
  const id=s.containers[0].id;
  s=run(s,'items.add',{containerId:id,items:[
    {model:'00102',name:'Blouse',color:'Black',size:'M',quantity:600,purchase:18,volume:3,weight:150,price:35},
    {model:'TR205',name:'Trousers',color:'Blue',size:'L',quantity:300,purchase:32,volume:2,weight:180,price:55},
    {model:'JK310',name:'Jacket',color:'Navy',size:'XL',quantity:100,purchase:60,volume:3,weight:120,price:105},
  ]});
  for(const [name,amount,basis] of [['China',1200,'value'],['Sea',3000,'volume'],['Clearance',1600,'value'],['Local',800,'quantity']])s=run(s,'cost.save',{containerId:id,name,amount,basis,currency:'ILS',fx:1,confirmed:false});
  return {s,id};
}
test('landed costs and forecast preserve all expense cents',()=>{
  const {s,id}=shipment(),c=calculateContainer(s,id);
  assert.equal(c.valid,true);assert.equal(c.base,2640000);assert.equal(c.extra,660000);assert.equal(c.total,3300000);assert.equal(c.revenue,4800000);assert.equal(c.profit,1500000);
  assert.equal(c.rows.reduce((n,r)=>n+r.allocated,0),660000);assert.equal(c.rows.reduce((n,r)=>n+r.total,0),3300000);
  assert.deepEqual(split(100,[1,1,1]),[34,33,33]);
});
test('incoming goods cannot be sold or counted as received stock',()=>{
  const {s}=shipment();assert.equal(inventory(s).length,0);
  assert.throws(()=>run(s,'sale.create',{customerName:'A',date:'2026-10-31',lines:[{key:variant(s.items[0]),quantity:1,price:35}],paid:3500,method:'cash'}),/المخزون/);
  assert.equal(s.sales.length,0);assert.equal(s.customers.length,0);
});
test('a direct expense only affects its target model',()=>{
  const {s,id}=shipment(),before=calculateContainer(s,id);
  const after=calculateContainer(run(s,'cost.save',{containerId:id,name:'inspection',amount:100,currency:'ILS',fx:1,basis:'direct',target:s.items[1].id}),id);
  assert.equal(after.rows[0].total,before.rows[0].total);assert.equal(after.rows[1].total,before.rows[1].total+10000);assert.equal(after.rows[2].total,before.rows[2].total);
});
test('missing volume is visible and prevents receiving with incomplete costing',()=>{
  let {s,id}=shipment();const item=s.items[0];s=run(s,'item.save',{...item,volume:0});
  assert.equal(calculateContainer(s,id).valid,false);
  assert.throws(()=>run(s,'container.receive',{id,date:'2026-10-31',counts:s.items.map(i=>({id:i.id,received:i.quantity,damaged:0}))}),/الحجم/);
  assert.equal(s.containers[0].status,'draft');
});
test('duplicate variants are rejected atomically and leading zeros survive',()=>{
  const {s,id}=shipment();assert.equal(s.items[0].model,'00102');
  assert.throws(()=>run(s,'items.add',{containerId:id,items:[{...s.items[0],model:'New'},{...s.items[0]}]}),/مكرر/);assert.equal(s.items.length,3);
});
test('original currencies convert using the stored exchange rate',()=>{
  let s=run(emptyState(),'container.save',{name:'USD',currency:'USD',fx:4});const id=s.containers[0].id;
  s=run(s,'items.add',{containerId:id,items:[{model:'U',name:'USD item',quantity:10,purchase:5,price:40}]});
  s=run(s,'cost.save',{containerId:id,name:'shipping',currency:'USD',fx:4,amount:10,basis:'quantity'});
  const c=calculateContainer(s,id);assert.equal(c.base,20000);assert.equal(c.extra,4000);assert.equal(c.rows[0].unit,2400);
});
test('receiving requires explained variances and costs spread over sound pieces',()=>{
  const {s,id}=shipment(),counts=s.items.map((i,n)=>({id:i.id,received:n===0?590:i.quantity,damaged:0}));
  assert.throws(()=>run(s,'container.receive',{id,counts,date:'2026-10-31'}),/فروقات/);
  const received=run(s,'container.receive',{id,counts,date:'2026-10-31',notes:'10 pieces missing'});
  assert.equal(calculateContainer(received,id).rows[0].count,590);assert.equal(inventory(received).reduce((n,g)=>n+g.quantity,0),990);
});
function twoBatches(){
  let s=emptyState();const ids=[];
  for(let n=0;n<2;n++){
    s=run(s,'container.save',{name:'Batch '+n,currency:'ILS',fx:1});const id=s.containers.at(-1).id;
    s=run(s,'items.add',{containerId:id,items:[{model:'M1',name:'Same model',color:'Black',size:'L',quantity:10,purchase:n===0?10:20,price:30}]});
    const item=s.items.at(-1);ids.push(item.id);
    s=run(s,'container.receive',{id,date:n===0?'2026-10-01':'2026-10-02',counts:[{id:item.id,received:10,damaged:0}]});
    s=run(s,'container.finalize',{id});
  }return {s,ids};
}
test('FIFO source batches and partial payments give correct profit and receivables',()=>{
  let {s,ids}=twoBatches();const before=s;
  s=run(s,'sale.create',{customerName:'Customer',date:'2026-10-31',lines:[{key:variant(s.items[0]),quantity:15,price:30}],paid:10000,method:'cash'});
  const sale=s.sales[0];assert.deepEqual(sale.lines[0].allocations,[{itemId:ids[0],quantity:10},{itemId:ids[1],quantity:5}]);assert.equal(saleCost(s,sale),20000);assert.equal(report(s).gross,25000);assert.equal(customerBalance(s,sale.customerId),35000);
  assert.equal(inventory(s)[0].quantity,5);assert.equal(createdEntityId(before,s,'sale.create'),sale.id);
  s=run(s,'payment.create',{customerId:sale.customerId,date:'2026-10-31',amount:20000,method:'bank'});assert.equal(customerBalance(s,sale.customerId),15000);
  s=run(s,'expense.create',{date:'2026-10-31',amount:2000,category:'Delivery'});assert.equal(report(s).net,23000);
});
test('multiple lines cannot overcommit the same batch',()=>{
  const {s}=twoBatches(),key=variant(s.items[0]);
  assert.throws(()=>run(s,'sale.create',{customerName:'A',date:'2026-10-31',lines:[{key,quantity:13,price:30},{key,quantity:13,price:30}],paid:0,method:'credit'}),/المخزون/);
});
test('discount allocation is exact and reflected in model profit',()=>{
  const {s}=twoBatches(),next=run(s,'sale.create',{customerName:'A',date:'2026-10-31',lines:[{key:variant(s.items[0]),quantity:2,price:30},{key:variant(s.items[0]),quantity:1,price:30}],discount:101,paid:0,method:'credit'});
  const sale=next.sales[0];assert.equal(sale.total,8899);assert.equal(sale.lines.reduce((n,l)=>n+l.net,0),8899);assert.equal(report(next).gross,5899);
});
test('final costs lock while new selling prices preserve historical profit',()=>{
  let {s}=twoBatches();const item=s.items[0],cid=item.containerId;
  s=run(s,'sale.create',{customerName:'A',date:'2026-10-31',lines:[{key:variant(item),quantity:2,price:30}],paid:6000,method:'cash'});const gross=report(s).gross;
  assert.throws(()=>run(s,'cost.save',{containerId:cid,name:'late expense',amount:5,currency:'ILS',fx:1,basis:'value'}),/مقفلة/);
  s=run(s,'prices.save',{items:[{id:item.id,price:50}]});assert.equal(report(s).gross,gross);
});
test('provisional profit updates for actual expenses, then can be finalized',()=>{
  let {s,id}=shipment();s=run(s,'container.receive',{id,date:'2026-10-31',counts:s.items.map(i=>({id:i.id,received:i.quantity,damaged:0}))});
  s=run(s,'sale.create',{customerName:'A',date:'2026-10-31',lines:[{key:variant(s.items[0]),quantity:10,price:35}],paid:35000,method:'cash'});
  const oldCost=saleCost(s,s.sales[0]);assert.equal(report(s).provisional,true);
  assert.throws(()=>run(s,'container.finalize',{id}),/مؤكدة/);
  const expense=s.costs[0];s=run(s,'cost.save',{...expense,amount:1300,confirmed:true});assert.ok(saleCost(s,s.sales[0])>oldCost);
  for(const e of s.costs)s=run(s,'cost.save',{...e,confirmed:true});s=run(s,'container.finalize',{id});assert.equal(report(s).provisional,false);
});
test('voiding a mistake restores stock and requires paid settlement',()=>{
  let {s}=twoBatches();s=run(s,'sale.create',{customerName:'A',date:'2026-10-31',lines:[{key:variant(s.items[0]),quantity:5,price:30}],paid:15000,method:'cash'});const id=s.sales[0].id;
  assert.throws(()=>run(s,'sale.void',{id,reason:'mistake'}),/المبلغ/);
  s=run(s,'sale.void',{id,reason:'mistake',refunded:true});assert.equal(inventory(s)[0].quantity,20);assert.equal(report(s).revenue,0);assert.equal(customerBalance(s,s.customers[0].id),0);
});
test('foreign currencies require an explicit rate and impossible dates are rejected',()=>{
  assert.throws(()=>run(emptyState(),'container.save',{name:'USD',currency:'USD'}),/الحقول الرقمية/);
  assert.throws(()=>run(emptyState(),'container.save',{name:'bad date',currency:'ILS',eta:'2026-02-31'}),/تاريخ/);
});
