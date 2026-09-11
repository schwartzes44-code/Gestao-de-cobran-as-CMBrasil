const CACHE='gestao-cobrancas-v1-0-alpha3-central-write';
const CORE=['./','./index.html','./styles-alpha3.css?v=1.0.0a3','./cloud-alpha3.js?v=1.0.0a3','./app-alpha3.js?v=1.0.0a3','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const req=event.request,url=new URL(req.url);if(url.origin!==self.location.origin)return;
 const isAppShell=req.mode==='navigate'||/\.(?:js|css)$/.test(url.pathname);
 if(isAppShell){event.respondWith(fetch(req,{cache:'no-store'}).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));return resp}).catch(()=>caches.match(req).then(r=>r||(req.mode==='navigate'?caches.match('./index.html'):Response.error()))))}
 else{event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));return resp})))}
});
