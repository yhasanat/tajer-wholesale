import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createLocalStore,ConflictError} from '../src/lib/local-store.ts';
import {demoState} from '../src/lib/demo.ts';
const make=(name='test',factory=new IDBFactory())=>createLocalStore({factory,name});
const addContainer={type:'container.save',payload:{name:'حاوية تجربة',currency:'ILS',fx:1}};
test('local data survives closing and reopening the browser database',async()=>{
  const factory=new IDBFactory(),store=make('persistent',factory);const empty=await store.load();assert.equal(empty.revision,0);
  const saved=await store.mutate(0,'op-one',addContainer);assert.ok(saved.entityId);await store.close();
  const reopened=make('persistent',factory),loaded=await reopened.load();assert.equal(loaded.containers.length,1);assert.equal(loaded.containers[0].name,'حاوية تجربة');await reopened.close();
});
test('independent project namespaces do not share records',async()=>{
  const factory=new IDBFactory(),a=make('/project-a/',factory),b=make('/project-b/',factory);await a.mutate(0,'a',addContainer);assert.equal((await b.load()).containers.length,0);await a.close();await b.close();
});
test('retrying an operation does not duplicate its record',async()=>{
  const store=make();const first=await store.mutate(0,'same',addContainer),again=await store.mutate(0,'same',addContainer);assert.equal(first.entityId,again.entityId);assert.equal(again.state.containers.length,1);assert.equal(again.state.revision,1);await store.close();
});
test('two tabs at one revision produce one winner and one conflict',async()=>{
  const factory=new IDBFactory(),a=make('shared',factory),b=make('shared',factory);
  const result=await Promise.allSettled([a.mutate(0,'A',addContainer),b.mutate(0,'B',addContainer)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);const failed=result.find(r=>r.status==='rejected');assert.ok(failed.reason instanceof ConflictError);assert.equal(failed.reason.state.revision,1);assert.equal((await a.load()).containers.length,1);await a.close();await b.close();
});
test('simultaneous retries return the same canonical entity',async()=>{
  const factory=new IDBFactory(),a=make('shared',factory),b=make('shared',factory);const [x,y]=await Promise.all([a.mutate(0,'same',addContainer),b.mutate(0,'same',addContainer)]);assert.equal(x.entityId,y.entityId);assert.equal((await b.load()).containers.length,1);await a.close();await b.close();
});
test('an invalid bulk import aborts the entire local transaction',async()=>{
  const store=make(),created=await store.mutate(0,'c',addContainer);await assert.rejects(()=>store.mutate(1,'bad',{type:'items.add',payload:{containerId:created.entityId,items:[{model:'OK',name:'Good',quantity:10,purchase:10},{model:'BAD',name:'Bad',quantity:0,purchase:10}]}}));const loaded=await store.load();assert.equal(loaded.items.length,0);assert.equal(loaded.revision,1);await store.close();
});
test('restoring uses a fresh revision and saves the preceding data as a recovery snapshot',async()=>{
  const store=make();await store.mutate(0,'a',addContainer);const imported=demoState();imported.revision=450;const result=await store.restore(imported,1,'restore');assert.equal(result.state.revision,2);assert.equal(result.state.sales.length,3);const snapshots=await store.snapshots();assert.equal(snapshots.length,1);assert.equal(snapshots[0].state.containers[0].name,'حاوية تجربة');const recovered=await store.restore(snapshots[0].state,2,'recover');assert.equal(recovered.state.sales.length,0);assert.equal(recovered.state.revision,3);await store.close();
});
test('restore conflicts and invalid backups leave the current data untouched',async()=>{
  const store=make();await store.mutate(0,'a',addContainer);await assert.rejects(()=>store.restore(demoState(),0,'stale'),e=>e instanceof ConflictError);const bad=demoState();bad.sales[0].customerId='missing';assert.throws(()=>store.restore(bad,1,'bad'));const state=await store.load();assert.equal(state.containers.length,1);assert.equal(state.sales.length,0);assert.equal((await store.snapshots()).length,0);await store.close();
});
test('recovery snapshots are bounded and data changes remain atomic',async()=>{
  const store=make();for(let n=0;n<12;n++){const state=demoState();state.settings.name='Snapshot '+n;await store.restore(state,n,'restore-'+n);}const snapshots=await store.snapshots();assert.equal(snapshots.length,8);assert.equal((await store.load()).settings.name,'Snapshot 11');await store.close();
});
