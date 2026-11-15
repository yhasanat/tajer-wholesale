import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBackup,parseBackup} from '../src/lib/backup.ts';
import {demoState} from '../src/lib/demo.ts';
import {availableSaleStock,customerBalance,inventory,perform,today} from '../src/lib/domain.ts';
import {draftQuantities,invoiceDraftFromSale} from '../src/lib/invoice-draft.ts';

test('a restored invoice creates an editable new sale with its own number, payment and stock deductions',()=>{
  const backup=makeBackup(demoState());
  backup.version=2;
  delete backup.state.stockMovements;
  backup.state.sales[2].number='INV-00008';
  const {state}=parseBackup(backup);
  const previous=structuredClone(state.sales[2]);
  const draft=invoiceDraftFromSale(state.sales[2]);
  assert.deepEqual(Object.keys(draft),['customerId','lines']);
  assert.equal(draft.lines[0].price,100);
  assert.equal(draft.lines[0].quantity,10);
  assert.equal(draft.lines[0].allocations,undefined);

  const other=inventory(state).find(group=>group.item.model==='BL102');
  const lines=[{...draft.lines[0],quantity:3},{key:other.key,quantity:2,price:other.price}];
  const next=perform(state,{type:'sale.create',payload:{
    customerId:draft.customerId,date:today(),lines,paid:2000,method:'cash',
  }});
  const sale=next.sales.at(-1);
  assert.deepEqual(next.sales[2],previous);
  assert.equal(sale.number,'INV-00009');
  assert.notEqual(sale.id,previous.id);
  assert.equal(sale.paid,2000);
  assert.equal(sale.total,37000);
  assert.equal(customerBalance(next,draft.customerId),35000);
  assert.equal(inventory(next).find(group=>group.key===other.key).quantity,148);
  assert.equal(inventory(next).find(group=>group.key===draft.lines[0].key).quantity,12);
  assert.deepEqual(parseBackup(makeBackup(next)).state,next);
});

test('copied rows for the same model keep their individual prices and share the available balance',()=>{
  const state=demoState();
  const original=state.sales[2];
  const line=original.lines[0];
  const source={...original,lines:[{...line,quantity:8},{...line,quantity:8,price:90}]};
  const {lines}=invoiceDraftFromSale(source);
  assert.equal(new Set(lines.map(row=>row.id)).size,2);
  assert.deepEqual(lines.map(row=>row.price),[100,90]);
  assert.equal(draftQuantities(lines).get(line.key),16);
  assert.equal(availableSaleStock(state,today()).get(line.key),15);
  assert.throws(()=>perform(state,{type:'sale.create',payload:{
    customerId:source.customerId,date:today(),lines,
  }}),/تتجاوز المخزون/);
});
