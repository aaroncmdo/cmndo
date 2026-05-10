'use client'

import { useEffect, useRef, useState } from 'react'
import { useOnlineStatus } from '@/lib/offline/use-online-status'
import { registerOnlineSync, syncOutbox } from '@/lib/offline/sync-outbox'
import { getPendingCount } from '@/lib/offline/outbox'
import { WifiOffIcon, CloudUploadIcon, CheckCircle2Icon } from 'lucide-react'

// KFZ-180: Offline-Banner am oberen Rand wenn kein Internet.
// AAR-363: Zusätzlich Wieder-Online-Banner — zeigt Sync-Fortschritt und
//          verschwindet nach 5 s automatisch, wenn alle Uploads durch sind.

type ReconnectState =
  | { phase: 'idle' }
  | { phase: 'syncing'; pending: number }
  | { phase: 'done'; synced: number }
  | { phase: 'failed'; failed: number }

export default function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const prevOnlineRef = useRef<boolean>(isOnline)
  const [reconnect, setReconnect] = useState<ReconnectState>({ phase: 'idle' })
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Register auto-sync listener once
  useEffect(() => {
    registerOnlineSync()
  }, [])

  // Wieder-Online-Übergang erkennen und Sync-Banner zeigen.
  useEffect(() => {
    const wasOffline = prevOnlineRef.current === false
    prevOnlineRef.current = isOnline
    if (!isOnline || !wasOffline) return

    let cancelled = false
    ;(async () => {
      const pending = await getPendingCount().catch(() => 0)
      if (pending === 0) {
        // Nichts zu syncen — kurzen „Verbindung wieder da"-Hinweis zeigen
        if (cancelled) return
        setReconnect({ phase: 'done', synced: 0 })
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = setTimeout(
          () => setReconnect({ phase: 'idle' }),
          5000,
        )
        return
      }

      if (cancelled) return
      setReconnect({ phase: 'syncing', pending })

      // syncOutbox() läuft schon via registerOnlineSync asynchron — aber wir
      // rufen es hier nochmal auf, um das Ergebnis direkt zu kennen. Der
      // sync-Singleton-Guard verhindert Doppelläufe.
      const result = await syncOutbox().catch(() => ({ synced: 0, failed: pending }))
      if (cancelled) return

      if (result.failed > 0) {
        setReconnect({ phase: 'failed', failed: result.failed })
        // Failure-Banner bleibt sichtbar, aber nach 8 s ausblenden
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = setTimeout(
          () => setReconnect({ phase: 'idle' }),
          8000,
        )
      } else {
        setReconnect({ phase: 'done', synced: result.synced })
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = setTimeout(
          () => setReconnect({ phase: 'idle' }),
          5000,
        )
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOnline])

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  if (!isOnline) {
    return (
      <div className="fixed top-0 inset-x-0 z-[60] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg">
        <WifiOffIcon className="w-4 h-4" />
        Offline-Modus aktiv — Daten werden lokal gespeichert und hochgeladen sobald du wieder online bist.
      </div>
    )
  }

  if (reconnect.phase === 'syncing') {
    return (
      <div className="fixed top-0 inset-x-0 z-[60] bg-claimondo-ondo text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg">
        <CloudUploadIcon className="w-4 h-4 animate-pulse" />
        Verbindung wiederhergestellt — {reconnect.pending}{' '}
        {reconnect.pending === 1 ? 'Upload wird' : 'Uploads werden'} synchronisiert...
      </div>
    )
  }

  if (reconnect.phase === 'done') {
    return (
      <div className="fixed top-0 inset-x-0 z-[60] bg-green-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg">
        <CheckCircle2Icon className="w-4 h-4" />
        {reconnect.synced > 0
          ? `${reconnect.synced} ${reconnect.synced === 1 ? 'Upload erfolgreich' : 'Uploads erfolgreich'} synchronisiert.`
          : 'Verbindung wiederhergestellt.'}
      </div>
    )
  }

  if (reconnect.phase === 'failed') {
    return (
      <div className="fixed top-0 inset-x-0 z-[60] bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg">
        <WifiOffIcon className="w-4 h-4" />
        {reconnect.failed}{' '}
        {reconnect.failed === 1 ? 'Upload konnte' : 'Uploads konnten'} nicht synchronisiert werden — bitte später erneut versuchen.
      </div>
    )
  }

  return null
}
