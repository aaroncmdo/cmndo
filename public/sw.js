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

// Slice 2 (Kunde Offline-READ): eigene Caches fuer /flow-Dokumente + Next-Static-Chunks.
const FLOW_DOCS_CACHE = 'claimondo-flow-docs-v1'
const NEXT_STATIC_CACHE = 'claimondo-next-static-v1'
const FLOW_DOCS_MAX = 5

// CMM-14-sicher: NUR harte Dokument-Navigationen zu /flow/*. ?_rsc=/RSC-Streams sind
// NIE mode==='navigate' -> fallen automatisch auf den Pass-Through; die extra Checks
// sind zusaetzliche Absicherung.
function isHardFlowDocument(request, url) {
  return (
    request.method === 'GET' &&
    request.mode === 'navigate' &&
    !url.searchParams.has('_rsc') &&
    request.headers.get('RSC') !== '1' &&
    !request.headers.has('Next-Router-Prefetch') &&
    url.pathname.startsWith('/flow/') &&
    url.origin === self.location.origin
  )
}

// Count-bounded: behaelt nur die neuesten FLOW_DOCS_MAX Flow-Dokumente. Cache.keys()
// liefert Insertion-Order -> die aeltesten zuerst loeschen (kein echtes LRU noetig,
// wenige Tokens pro Geraet).
async function evictFlowDocs(cache, max) {
  const keys = await cache.keys()
  if (keys.length <= max) return
  for (const key of keys.slice(0, keys.length - max)) {
    await cache.delete(key)
  }
}

// Minimale, branded Offline-Fallback-Seite wenn ein /flow-Link offline geoeffnet wird,
// der NIE online geladen wurde (nichts gecached). Inline-Styles/Hex sind hier ok:
// public/ wird von keinem Token-Ratchet gescannt + es rendert vor jedem Tailwind/Branding.
const OFFLINE_FALLBACK_HTML =
  '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Offline — Claimondo</title>' +
  '<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0D1B3E;color:#fff;' +
  'display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}' +
  'div{max-width:22rem}h1{font-size:1.15rem;margin:0 0 .5rem}p{opacity:.85;font-size:.92rem;line-height:1.5}</style>' +
  '</head><body><div><h1>Keine Internetverbindung</h1>' +
  '<p>Bitte öffnen Sie Ihren Link einmal mit Internet — danach ist er auch offline verfügbar.</p>' +
  '</div></body></html>'

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
          .filter(
            (k) =>
              k !== CACHE_NAME &&
              k !== TTS_CACHE &&
              k !== TILE_CACHE &&
              k !== FLOW_DOCS_CACHE &&
              k !== NEXT_STATIC_CACHE,
          )
          .map((k) => caches.delete(k)),
      ),
    ),
  )
  self.clients.claim()
})

// Fetch: Network-first mit Cache-Fallback fuer statische Assets + (Slice 2) den
// /flow-Offline-Read.
self.addEventListener('fetch', (event) => {
  // Nur GET Requests cachen
  if (event.request.method !== 'GET') return

  const req = event.request
  const url = new URL(req.url)

  // Slice 2: /_next/static/* cache-first (content-gehashte immutable Chunks) —
  // damit gecachtes /flow-HTML offline hydrieren kann. Self-warming beim Online-Besuch.
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(NEXT_STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      })
    )
    return
  }

  // Slice 2: /flow/* HARTE Navigation — network-first mit Cache-Fallback.
  // Online = byte-identisch (echter fetch, SW klont nur). Offline = gecachtes HTML.
  // CMM-14-sicher via isHardFlowDocument: NIE ?_rsc=/RSC-Streams.
  if (isHardFlowDocument(req, url)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const cache = await caches.open(FLOW_DOCS_CACHE)
          cache.put(req, res.clone())
          void evictFlowDocs(cache, FLOW_DOCS_MAX)
          return res
        } catch {
          const cached = await caches.match(req)
          return (
            cached ||
            new Response(OFFLINE_FALLBACK_HTML, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            })
          )
        }
      })()
    )
    return
  }

  // CMM-14: Statische Assets sind ansonsten die EINZIGEN Requests die der SW abfängt.
  // Alle anderen (Navigation, RSC-Streams, API, Auth) müssen explizit
  // fetch-pass-through bekommen — sonst kann der SW während Install/Activate
  // den `?_rsc=`-Stream der Login-Redirect-Soft-Navigation verschlucken
  // → weiße Seite, erst Reload behebt es.
  if (STATIC_ASSETS.some((a) => url.pathname === a) || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    )
    return
  }

  // Alles andere: explizit pass-through — SW garantiert keine Interferenz.
  // Insbesondere RSC-Streams (`?_rsc=`), Auth-Routes und API.
  event.respondWith(fetch(req))
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
