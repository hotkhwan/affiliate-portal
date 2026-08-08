const cacheName = 'kwanni-shell-v1'
self.addEventListener('install', event => event.waitUntil(caches.open(cacheName)))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  const safeDestination = ['document', 'script', 'style', 'font', 'manifest'].includes(event.request.destination)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !safeDestination || url.pathname.includes('/api/') || url.pathname.includes('/v1/')) return
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone()
      caches.open(cacheName).then(cache => cache.put(event.request, copy))
    }
    return response
  }).catch(async () => (await caches.match(event.request)) || new Response('Offline', { status: 503 })))
})
