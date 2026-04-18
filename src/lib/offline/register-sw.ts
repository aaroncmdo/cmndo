// AAR-388: Service-Worker-Registration + Background-Sync-Request.
//
// Registriert /sw.js beim Client-Start. Versucht zusätzlich, einen
// `sync`-Tag `outbox-sync` zu setzen — der Browser ruft dann den
// SW-`sync`-Handler (public/sw.js) bei Reconnect auf, selbst wenn der
// Tab nicht aktiv ist. Der SW postet an alle Clients `OUTBOX_SYNC`,
// was hier in einen syncOutbox/syncGpsOutbox-Aufruf gemappt wird.
//
// Fallback: iOS Safari < 17 hat keine Background Sync API — in dem Fall
// bleibt der normale online-Event-basierte Sync der einzige Pfad.

'use client'

import { syncOutbox } from './sync-outbox'
import { syncGpsOutbox } from './sync-gps-outbox'

let registered = false

export async function registerServiceWorker(): Promise<void> {
  if (registered) return
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  registered = true

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = (event as MessageEvent).data as { type?: string } | null
      if (data?.type === 'OUTBOX_SYNC') {
        void syncOutbox().catch(() => {})
        void syncGpsOutbox().catch(() => {})
      }
    })

    // Background Sync registrieren falls supported.
    const anyReg = reg as unknown as {
      sync?: { register: (tag: string) => Promise<void> }
    }
    if (anyReg.sync?.register) {
      try {
        await anyReg.sync.register('outbox-sync')
      } catch {
        // Permissions/Quota — best-effort, kein Hard-Fail
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AAR-388] Service-Worker-Registration fehlgeschlagen:', err)
    }
  }
}

export async function requestBackgroundSync(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const anyReg = reg as unknown as {
    sync?: { register: (tag: string) => Promise<void> }
  }
  if (anyReg.sync?.register) {
    try {
      await anyReg.sync.register('outbox-sync')
    } catch {
      // egal
    }
  }
}
