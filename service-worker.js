/* WEBNIX STUDIO — local-first static assets only. No map files are cached or uploaded. */
const CACHE = 'webnix-placemark-cleaner-v2.1';
const ASSETS = ['./','./index.html','./assets/app.css','./assets/readability.css?v=2.1','./assets/app.js','./assets/jszip.min.js','./assets/brand-mark.png','./assets/icon.svg','./assets/app-icon-192.png','./assets/app-icon-512.png'];
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate', event => {event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const u=new URL(event.request.url);
  if(u.origin!==self.location.origin) return;
  event.respondWith(caches.match(event.request).then(hit=>hit || fetch(event.request)));
});
