import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function worker(){
  const listeners={},stores=new Map(),root='https://example.github.io/shop/',old='tajer-pages-%2Fshop%2F-old',other='tajer-pages-%2Fother%2F-old';stores.set(old,new Map());stores.set(other,new Map());
  const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return {async addAll(files){for(const file of files)map.set(file,new Response('shell'));},async put(key,response){map.set(typeof key==='string'?key:key.url,response.clone());}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);},async match(key){const url=typeof key==='string'?key:key.url;for(const map of stores.values())if(map.has(url))return map.get(url).clone();}};
  const runtime={URL,Response,Request,AbortController,setTimeout,clearTimeout,caches,fetch:async()=>new Response('fresh'),self:{location:{href:root+'sw.js'},skipWaiting:async()=>{},clients:{claim:async()=>{}},addEventListener:(name,fn)=>listeners[name]=fn}};
  vm.runInNewContext(fs.readFileSync('sw.js','utf8'),runtime);
  async function event(name,request){let response,pending=Promise.resolve();listeners[name]({request,waitUntil(p){pending=p;},respondWith(p){response=p;}});await pending;return response?await response:undefined;}
  return {event,runtime,stores,root,old,other};
}
test('offline shell is cached and activation preserves other GitHub project caches',async()=>{
  const w=worker();await w.event('install');await w.event('activate');assert.equal(w.stores.has(w.old),false);assert.equal(w.stores.has(w.other),true);assert.ok([...w.stores.values()].some(m=>m.has(w.root+'index.html')));
});
test('offline navigation falls back to the cached application shell',async()=>{
  const w=worker();await w.event('install');w.runtime.fetch=async()=>{throw Error('offline');};const response=await w.event('fetch',{method:'GET',url:w.root,mode:'navigate'});assert.equal(await response.text(),'shell');
});
test('successful navigation refreshes the cached shell',async()=>{
  const w=worker();await w.event('install');const response=await w.event('fetch',{method:'GET',url:w.root,mode:'navigate'});assert.equal(await response.text(),'fresh');w.runtime.fetch=async()=>{throw Error('offline');};const offline=await w.event('fetch',{method:'GET',url:w.root+'index.html',mode:'navigate'});assert.equal(await offline.text(),'fresh');
});
test('a GitHub Pages subpath is self-contained without server or sign-in endpoints',()=>{
  const html=fs.readFileSync('index.html','utf8');assert.ok(html.includes('<script type="module">'));assert.ok(html.includes('<style>'));const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];assert.equal(scripts.length,1);assert.doesNotMatch(scripts[0][1],/\bsrc\s*=/i);new vm.Script(scripts[0][2]);assert.doesNotMatch(html,/\/api\/state|signin-with-chatgpt|cloudflare:workers/);
  assert.ok(fs.existsSync('.nojekyll'));assert.ok(fs.existsSync('manifest.webmanifest'));assert.ok(fs.existsSync('icon-192.png'));
});
