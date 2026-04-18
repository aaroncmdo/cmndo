'use client'

// AAR-388: Fokus-Modus-interner Offline-Banner.
// Drei States: Offline / Sync läuft / Dead-Letter. Pollt alle 5s die beiden
// Outboxes. Nicht zu verwechseln mit dem globalen KFZ-180 OfflineBanner —
// dieser hier ist auf den Fokus-Modus-Alltag abgestimmt (Funkloch,
// Parkhaus, ländliche Route).

import { useState } from 'react'
import {
  AlertTriangleIcon,
  CloudUploadIcon,
  WifiOffIcon,
} from 'lucide-react'
import { useOnlineStatus } from '@/lib/offline/use-online-status'
import { usePendingCount } from '@/lib/offline/use-pending-count'
import DeadLetterDialog from '@/components/offline/DeadLetterDialog'

export default function OfflineStatusBanner() {
  const online = useOnlineStatus()
  const counts = usePendingCount()
  const [dialogOpen, setDialogOpen] = useState(false)

  const totalPending = counts.uploadPending + counts.gpsPending

  // Nichts anzuzeigen wenn: online und alles synced und keine Dead-Letter
  if (online && totalPending === 0 && counts.dead === 0) return null

  // Dead-Letter priorisiert anzeigen
  if (counts.dead > 0) {
    return (
      <>
        <div className="bg-red-600/95 text-white text-xs px-3 py-2 flex items-center gap-2">
          <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">
            {counts.dead} {counts.dead === 1 ? 'Upload dauerhaft' : 'Uploads dauerhaft'} fehlgeschlagen.
          </span>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="underline underline-offset-2 hover:text-white/90"
          >
            Details
          </button>
        </div>
        <DeadLetterDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </>
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
