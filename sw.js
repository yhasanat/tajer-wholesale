const PREFIX='tajer-pages-'+encodeURIComponent(new URL('./',self.location.href).pathname)+'-';
const CACHE=PREFIX+'9cb49bb3a113';
const ROOT=new URL('./',self.location.href).href;
const SHELL=new URL('index.html',ROOT).href;
const FILES=['index.html','favicon.svg','manifest.webmanifest','icon-192.png','icon-512.png'].map(p=>new URL(p,ROOT).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET'||!request.url.startsWith(ROOT))return;if(request.mode==='navigate'){event.respondWith((async()=>{try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);let response;try{response=await fetch(request,{signal:controller.signal});}finally{clearTimeout(timer);}if(response.ok){const cache=await caches.open(CACHE);await cache.put(SHELL,response.clone());return response;}return (await caches.match(SHELL))||response;}catch{return (await caches.match(SHELL))||Response.error();}})());}else{event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));}});