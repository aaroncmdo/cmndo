'use client'

import { useEffect } from 'react'
import { useOnlineStatus } from '@/lib/offline/use-online-status'
import { registerOnlineSync } from '@/lib/offline/sync-outbox'
import { WifiOffIcon } from 'lucide-react'

// KFZ-180: Offline-Banner am oberen Rand wenn kein Internet.

export default function OfflineBanner() {
  const isOnline = useOnlineStatus()

  // Register auto-sync listener once
  useEffect(() => {
    registerOnlineSync()
  }, [])

  if (isOnline) return null

  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg">
      <WifiOffIcon className="w-4 h-4" />
      Offline-Modus aktiv — Daten werden lokal gespeichert und hochgeladen sobald du wieder online bist.
    </div>
  )
}
