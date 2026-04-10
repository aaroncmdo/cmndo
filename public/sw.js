// KFZ-171: Claimondo Service Worker — Offline-Cache fuer statische Assets.
// Push-Notifications vorbereitet (Listener registriert, wird spaeter aktiviert).

const CACHE_NAME = 'claimondo-v1'
const STATIC_ASSETS = [
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/manifest.json',
]

// Install: statische Assets cachen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: alte Caches aufraumen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: Network-first mit Cache-Fallback fuer statische Assets
self.addEventListener('fetch', (event) => {
  // Nur GET Requests cachen
  if (event.request.method !== 'GET') return

  // API/Auth Requests NICHT cachen
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  // Statische Assets: Cache-first
  if (STATIC_ASSETS.some((a) => url.pathname === a) || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    )
    return
  }

  // Navigation + andere Requests: Network-first, kein Cache
  // (App-Daten sollen immer frisch sein)
})

// Push-Notifications (vorbereitet, wird spaeter aktiviert)
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Claimondo', {
      body: data.body ?? '',
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      data: data.url ? { url: data.url } : undefined,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
