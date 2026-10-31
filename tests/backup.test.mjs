import test from 'node:test';
import assert from 'node:assert/strict';
import {demoState} from '../src/lib/demo.ts';
import {makeBackup,parseBackup,validateState} from '../src/lib/backup.ts';
test('full backup round-trips all business records and settings',()=>{
  const original=demoState(),file=makeBackup(original),loaded=parseBackup(JSON.stringify(file));assert.deepEqual(loaded.state,original);assert.equal(loaded.summary.sales,3);assert.equal(loaded.summary.items,6);assert.equal(loaded.demo,false);
});
test('backups exported by the previous hosted version remain compatible',()=>{
  const state=demoState();const old={format:'tajer-backup',version:1,exportedAt:new Date().toISOString(),state};assert.deepEqual(parseBackup(JSON.stringify(old)).state,state);
});
test('demo metadata is preserved without forcing it into real records',()=>{
  const result=parseBackup(makeBackup(demoState(),true));assert.equal(result.demo,true);
});
test('malformed JSON and unrelated files are rejected',()=>{
  assert.throws(()=>parseBackup('{oops'));assert.throws(()=>parseBackup({hello:'world'}));assert.throws(()=>parseBackup({format:'tajer-backup',version:77,state:demoState()}));
});
test('duplicate identities and missing references are rejected',()=>{
  const duplicate=demoState();duplicate.items.push(structuredClone(duplicate.items[0]));assert.throws(()=>validateState(duplicate),/مكرر/);
  const orphan=demoState();orphan.sales[0].customerId='unknown';assert.throws(()=>validateState(orphan),/زبون مفقود/);
  const badCost=demoState();badCost.costs[0].basis='direct';badCost.costs[0].target='missing';assert.throws(()=>validateState(badCost),/مصروف مباشر/);
});
test('corrupted invoice amounts and impossible dates are rejected',()=>{
  const state=demoState();state.sales[0].total++;assert.throws(()=>validateState(state),/إجمالي الفاتورة/);
  const date=demoState();date.sales[0].date='2026-02-31';assert.throws(()=>validateState(date),/تاريخ/);
});
test('restoring a backup cannot introduce oversold inventory',()=>{
  const state=demoState(),sale=state.sales[2],line=sale.lines[0];line.quantity=100;line.gross=100*line.price*100;line.net=line.gross;line.allocations[0].quantity=100;sale.total=line.gross;sale.paid=0;assert.throws(()=>validateState(state),/تتجاوز المخزون/);
});
test('a finalized container cannot silently regain unconfirmed costs',()=>{
  const state=demoState();state.containers.find(c=>c.id==='demo-next').status='final';state.containers.find(c=>c.id==='demo-next').receivedAt='2026-10-31T12:00:00.000Z';for(const i of state.items.filter(i=>i.containerId==='demo-next'))i.received=i.quantity;assert.throws(()=>validateState(state),/غير مؤكد/);
});
