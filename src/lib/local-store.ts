import type {State,Action} from './domain.ts';
import {emptyState,perform,createdEntityId,uid} from './domain.ts';
import {validateState,backupSummary} from './backup.ts';

export type Saved={state:State;entityId?:string};
export type Snapshot={id:string;createdAt:string;reason:string;summary:ReturnType<typeof backupSummary>;state:State};
export class ConflictError extends Error{state:State;constructor(state:State){super('تغيّرت البيانات في نافذة أخرى. تم تحديثها؛ راجع العملية ثم احفظ مجددًا.');this.name='ConflictError';this.state=state;}}
export function storageName(){const path=typeof location==='undefined'?'test':new URL('.',location.href).pathname;return 'tajer-github-v1:'+path;}
function storageError(error:unknown){const name=error&&typeof error==='object'&&'name'in error?String(error.name):'';if(name==='QuotaExceededError')return Error('مساحة تخزين المتصفح غير كافية. صدّر نسخة احتياطية ووفّر مساحة ثم حاول مجددًا.');if(name==='VersionError')return Error('تخزين البرنامج أحدث من هذه النسخة. افتح أحدث نسخة من الرابط.');return error instanceof Error?error:Error('تعذّر حفظ البيانات على هذا الجهاز. استخدم متصفحًا يسمح بالتخزين المحلي.');}
const actionLabels:Record<string,string>={'container.delete':'قبل حذف حاوية','container.receive':'قبل استلام حاوية','container.finalize':'قبل اعتماد تكلفة الحاوية','sale.void':'قبل إلغاء فاتورة','items.add':'قبل استيراد كشف أصناف'};

export function createLocalStore(options:{factory?:IDBFactory;name?:string;notify?:(revision:number)=>void}={}){
  const name=options.name||storageName();let connection:Promise<IDBDatabase>|undefined,channel:BroadcastChannel|undefined;const listeners=new Set<()=>void>();
  function open(){if(connection)return connection;connection=new Promise<IDBDatabase>((resolve,reject)=>{const factory=options.factory||globalThis.indexedDB;if(!factory){reject(Error('المتصفح لا يتيح حفظ البيانات. استخدم Chrome أو Firefox أو Safari في نافذة عادية.'));return;}const req=factory.open(name,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('app'))db.createObjectStore('app');if(!db.objectStoreNames.contains('operations')){const store=db.createObjectStore('operations',{keyPath:'id'});store.createIndex('createdAt','createdAt');}if(!db.objectStoreNames.contains('snapshots')){const store=db.createObjectStore('snapshots',{keyPath:'id'});store.createIndex('createdAt','createdAt');}};req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();connection=undefined;};resolve(db);};req.onerror=()=>{connection=undefined;reject(storageError(req.error));};req.onblocked=()=>{connection=undefined;reject(Error('أغلق النوافذ القديمة للبرنامج ثم أعد فتحه.'));};});return connection;}
  function notify(revision:number){options.notify?.(revision);if(typeof window==='undefined')return;try{if(typeof BroadcastChannel!=='undefined'){if(!channel)channel=new BroadcastChannel(name);channel.postMessage({revision});}else window.localStorage.setItem(name+':sync',String(revision)+':'+uid());}catch{}}
  function subscribe(listener:()=>void){listeners.add(listener);if(typeof window!=='undefined'){if(typeof BroadcastChannel!=='undefined'){if(!channel)channel=new BroadcastChannel(name);channel.onmessage=()=>{for(const fn of listeners)fn();};}else{window.addEventListener('storage',onStorage);}}return()=>{listeners.delete(listener);if(!listeners.size){channel?.close();channel=undefined;if(typeof window!=='undefined')window.removeEventListener('storage',onStorage);}};}
  function onStorage(event:StorageEvent){if(event.key===name+':sync')for(const fn of listeners)fn();}
  async function load():Promise<State>{const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('app','readonly'),req=tx.objectStore('app').get('main');req.onsuccess=()=>resolve(req.result||emptyState());req.onerror=()=>reject(storageError(req.error));});}
  function prune(store:IDBObjectStore,keep:number){let count=0;const req=store.index('createdAt').openCursor(null,'prev');req.onsuccess=()=>{const cursor=req.result;if(!cursor)return;if(++count>keep)cursor.delete();cursor.continue();};}
  async function write(revision:number,operation:string,change:(state:State)=>Saved,snapshotReason=''):Promise<Saved>{
    const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['app','operations','snapshots'],'readwrite'),app=tx.objectStore('app'),ops=tx.objectStore('operations');let state:State|undefined,done=false,op:any,requests=0,result:Saved|undefined,failed:unknown;
      function ready(){if(++requests!==2)return;const before=state||emptyState();if(op){result={state:before,entityId:op.entityId};done=true;return;}
        if(before.revision!==revision){failed=new ConflictError(before);tx.abort();return;}
        try{result=change(before);if(snapshotReason&&(before.containers.length||before.sales.length||before.customers.length)){const snapshots=tx.objectStore('snapshots');snapshots.put({id:uid(),createdAt:new Date().toISOString(),reason:snapshotReason,summary:backupSummary(before),state:before} satisfies Snapshot);prune(snapshots,8);}app.put(result.state,'main');ops.put({id:operation,entityId:result.entityId,createdAt:new Date().toISOString()});prune(ops,1500);done=true;}catch(error){failed=error;tx.abort();}
      }
      const getState=app.get('main');getState.onsuccess=()=>{state=getState.result;ready();};const getOp=ops.get(operation);getOp.onsuccess=()=>{op=getOp.result;ready();};
      tx.oncomplete=()=>{if(done&&result){if(!op)notify(result.state.revision);resolve(result);}else reject(Error('تعذّر تأكيد حفظ العملية.'))};
      tx.onabort=()=>reject(failed||storageError(tx.error));tx.onerror=()=>{if(!failed)failed=storageError(tx.error);};
    });
  }
  function mutate(revision:number,operation:string,action:Action){const snapshot=(action.type==='items.add'?(Array.isArray(action.payload.items)&&action.payload.items.length>=10):['container.delete','container.receive','container.finalize','sale.void'].includes(action.type))?actionLabels[action.type]:'';return write(revision,operation,before=>{const state=perform(before,action);return{state,entityId:createdEntityId(before,state,action.type)};},snapshot);}
  function restore(imported:State,revision:number,operation=uid()){const checked=validateState(imported);return write(revision,operation,before=>({state:{...structuredClone(checked),revision:before.revision+1}}),'قبل استعادة نسخة احتياطية');}
  async function snapshots():Promise<Snapshot[]>{const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readonly'),req=tx.objectStore('snapshots').getAll();req.onsuccess=()=>resolve((req.result as Snapshot[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));req.onerror=()=>reject(storageError(req.error));});}
  async function close(){channel?.close();channel=undefined;if(connection){const db=await connection;db.close();connection=undefined;}}
  return {name,load,mutate,restore,snapshots,subscribe,close};
}
let singleton:ReturnType<typeof createLocalStore>|undefined;
export function getLocalStore(){return singleton||(singleton=createLocalStore());}
