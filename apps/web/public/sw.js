const CACHE="campus-exchange-shell-v1";
const SHELL=["/","/sign-in","/manifest.webmanifest"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener("fetch",event=>{const request=event.request;if(request.method!=="GET"||request.url.includes("/api/")||request.url.includes("/messages"))return;event.respondWith(fetch(request).then(response=>{if(response.ok&&new URL(request.url).origin===location.origin){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(request,clone))}return response}).catch(()=>caches.match(request).then(hit=>hit??caches.match("/"))))});
