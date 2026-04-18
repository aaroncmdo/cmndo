'use client'

// AAR-388: Persist-Storage-Retry — bittet den User dezent um
// dauerhaften Speicher-Zugriff, falls Outbox-Items warten aber
// navigator.storage.persisted() === false. Nicht aggressiv nudgen:
// ein Toast bei App-Start, Session-Memo damit wir nicht dauernd
// fragen.

import { useEffect } from 'react'
import { toast } from 'sonner'
import { getPendingCount } from '@/lib/offline/outbox'

const SESSION_KEY = 'claimondo-persist-asked'

export default function PersistStorageToast() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!navigator.storage?.persisted || !navigator.storage.persist) return
    if (sessionStorage.getItem(SESSION_KEY) === '1') return

    let cancelled = false

    ;(async () => {
      try {
        const persisted = await navigator.storage.persisted()
        if (persisted) return

        const pending = await getPendingCount().catch(() => 0)
        if (pending === 0) return
        if (cancelled) return

        sessionStorage.setItem(SESSION_KEY, '1')

        toast(
          `Sie haben ${pending} ${pending === 1 ? 'Upload' : 'Uploads'} lokal zwischengespeichert.`,
          {
            description:
              'Schützen Sie die Daten vor automatischer Löschung durch den Browser.',
            duration: 10000,
            action: {
              label: 'Schutz aktivieren',
              onClick: async () => {
                try {
                  const ok = await navigator.storage.persist!()
                  if (ok) {
                    toast.success('Speicher-Schutz aktiviert')
                  } else {
                    toast.message(
                      'Der Browser hat den Schutz abgelehnt — aktivieren Sie ihn in den Website-Einstellungen.',
                    )
                  }
                } catch {
                  // ignorieren
                }
              },
            },
          },
        )
      } catch {
        // ignorieren
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
