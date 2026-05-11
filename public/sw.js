// KFZ-171: Claimondo Service Worker — Offline-Cache fuer statische Assets.
// Push-Notifications vorbereitet (Listener registriert, wird spaeter aktiviert).
//
// 2026-05-08 (C13) Offline-Resilience: SVs fahren oft durch Funkloecher
// (Eifel/Sauerland) oder Tiefgaragen ohne GPS und ohne Netz. Damit der
// Feldmodus dort nicht komplett tot ist, cachen wir zusaetzlich:
//   - /tts/* (TTS-MP3s + Manifest) — Voice-Ansagen weiter funktional
//   - Mapbox-Tiles + Sprite + Style — letzte erfolgreich-geladene Tiles
//     bleiben offline verfuegbar (stale-while-revalidate)
// Cache-Versionen-Bump bei jedem SW-Asset-Update wichtig, sonst stuck.

const CACHE_NAME = 'claimondo-v2'
const TTS_CACHE = 'claimondo-tts-v1'
const TILE_CACHE = 'claimondo-tiles-v1'
const STATIC_ASSETS = [
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/manifest.json',
  '/tts/manifest.json',
]
const TILE_HOSTS = [
  'api.mapbox.com',
  'events.mapbox.com', // wird ignoriert
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
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== TTS_CACHE && k !== TILE_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  )
  self.clients.claim()
})

// Fetch: Network-first mit Cache-Fallback fuer statische Assets
self.addEventListener('fetch', (event) => {
  // Nur GET Requests cachen
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // CMM-14: Statische Assets sind die EINZIGEN Requests die der SW abfängt.
  // Alle anderen (Navigation, RSC-Streams, API, Auth) müssen explizit
  // fetch-pass-through bekommen — sonst kann der SW während Install/Activate
  // den `?_rsc=`-Stream der Login-Redirect-Soft-Navigation verschlucken
  // → weiße Seite, erst Reload behebt es. Der "kein respondWith"-Pfad ist
  // theoretisch identisch mit Browser-Default, aber in der Praxis kommt
  // es bei manchen Browsern/Versionen zu Race-Conditions im Lifecycle.
  if (STATIC_ASSETS.some((a) => url.pathname === a) || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    )
    return
  }

  // Alles andere: explizit pass-through — SW garantiert keine Interferenz.
  // Insbesondere RSC-Streams (`?_rsc=`), Auth-Routes und API.
  event.respondWith(fetch(event.request))
})

// AAR-499 N4: Push-Notifications via web-push — Payload kommt aus
// src/lib/notifications/templates/web-push.ts (buildPushPayload).
self.addEventListener('push', (event) => {
  if (!event.data) return
  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Claimondo', body: event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Claimondo', {
      body: data.body || '',
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      tag: data.tag,
      renotify: !!data.tag,
      requireInteraction: data.priority === 'urgent',
      data: { url: data.url || '/', eventId: data.eventId },
    })
  )
})

// KFZ-180: Background Sync — notify clients to flush outbox
self.addEventListener('sync', (event) => {
  if (event.tag === 'outbox-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'OUTBOX_SYNC' })
        }
      })
    )
  }
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
