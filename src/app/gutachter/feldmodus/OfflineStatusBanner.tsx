'use client'

// AAR-388: Fokus-Modus-interner Offline-Banner.
// Drei States: Offline / Sync läuft / Dead-Letter. Pollt alle 5s die beiden
// Outboxes. Nicht zu verwechseln mit dem globalen KFZ-180 OfflineBanner —
// dieser hier ist auf den Fokus-Modus-Alltag abgestimmt (Funkloch,
// Parkhaus, ländliche Route).

import { useEffect, useState } from 'react'
import {
  AlertTriangleIcon,
  CloudUploadIcon,
  WifiOffIcon,
} from 'lucide-react'
import { useOnlineStatus } from '@/lib/offline/use-online-status'
import { getDeadCount, getPendingCount } from '@/lib/offline/outbox'
import { getGpsPendingCount } from '@/lib/offline/sync-gps-outbox'

type Counts = {
  uploadPending: number
  gpsPending: number
  dead: number
}

const INITIAL: Counts = { uploadPending: 0, gpsPending: 0, dead: 0 }

export default function OfflineStatusBanner() {
  const online = useOnlineStatus()
  const [counts, setCounts] = useState<Counts>(INITIAL)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const [uploadPending, gpsPending, dead] = await Promise.all([
          getPendingCount(),
          getGpsPendingCount(),
          getDeadCount(),
        ])
        if (!cancelled) setCounts({ uploadPending, gpsPending, dead })
      } catch {
        // Silent — Outbox kann kurzzeitig locked sein
      }
    }
    void poll()
    const id = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const totalPending = counts.uploadPending + counts.gpsPending

  // Nichts anzuzeigen wenn: online und alles synced und keine Dead-Letter
  if (online && totalPending === 0 && counts.dead === 0) return null

  // Dead-Letter priorisiert anzeigen
  if (counts.dead > 0) {
    return (
      <div className="bg-red-600/95 text-white text-xs px-3 py-2 flex items-center gap-2">
        <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">
          {counts.dead} {counts.dead === 1 ? 'Upload dauerhaft' : 'Uploads dauerhaft'} fehlgeschlagen — bitte Support kontaktieren.
        </span>
      </div>
    )
  }

  if (!online) {
    return (
      <div className="bg-amber-600/95 text-white text-xs px-3 py-2 flex items-center gap-2">
        <WifiOffIcon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">
          Offline-Modus aktiv
          {totalPending > 0 &&
            ` · ${totalPending} ${totalPending === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Verbindung`}
        </span>
      </div>
    )
  }

  // Online mit Pending → Sync läuft/bevorsteht
  return (
    <div className="bg-[color:var(--brand-primary,#4573A2)]/95 text-white text-xs px-3 py-2 flex items-center gap-2">
      <CloudUploadIcon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">
        Synchronisiere {totalPending} {totalPending === 1 ? 'Eintrag' : 'Einträge'}…
      </span>
    </div>
  )
}
