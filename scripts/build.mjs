import {build} from 'vite';
import {readFile,writeFile,copyFile,mkdir,readdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
await build();
const project=process.cwd(),dist=resolve(project,'dist');
let html=await readFile(join(dist,'index.html'),'utf8');
const cssLinks=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];
for(const match of cssLinks){const css=await readFile(join(dist,match[1].replace(/^\.\//,'')),'utf8');html=html.replace(match[0],()=>'<style>'+css.replace(/<\/style/gi,'<\\/style')+'</style>');}
const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)];
for(const match of scripts){const js=await readFile(join(dist,match[1].replace(/^\.\//,'')),'utf8');html=html.replace(match[0],()=>'<script type="module">'+js.replace(/<\/script/gi,'<\\/script')+'</script>');}
html=html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g,'');
if(/(?:src|href)=["']\/(?:assets|src|api)\//.test(html))throw Error('An absolute runtime path would break GitHub project pages.');
await writeFile(join(dist,'index.html'),html);
const version=createHash('sha256').update(html).digest('hex').slice(0,12);
const worker=[
  "const PREFIX='tajer-pages-'+encodeURIComponent(new URL('./',self.location.href).pathname)+'-';",
  "const CACHE=PREFIX+'"+version+"';",
  "const ROOT=new URL('./',self.location.href).href;",
  "const SHELL=new URL('index.html',ROOT).href;",
  "const FILES=['index.html','favicon.svg','manifest.webmanifest','icon-192.png','icon-512.png'].map(p=>new URL(p,ROOT).href);",
  "self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));",
  "self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));",
  "self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET'||!request.url.startsWith(ROOT))return;if(request.mode==='navigate'){event.respondWith((async()=>{try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);let response;try{response=await fetch(request,{signal:controller.signal});}finally{clearTimeout(timer);}if(response.ok){const cache=await caches.open(CACHE);await cache.put(SHELL,response.clone());return response;}return (await caches.match(SHELL))||response;}catch{return (await caches.match(SHELL))||Response.error();}})());}else{event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));}});",
].join('\n');
await writeFile(join(dist,'sw.js'),worker);
await writeFile(join(dist,'.nojekyll'),'');
const assets=join(dist,'assets');
try{await rm(assets,{recursive:true});}catch{}
const deployFiles=['index.html','sw.js','favicon.svg','manifest.webmanifest','icon-192.png','icon-512.png','.nojekyll'];
for(const file of deployFiles)await copyFile(join(dist,file),join(project,file));
console.log('Ready for GitHub Pages: '+html.length+' inline characters, all application code bundled locally.');
