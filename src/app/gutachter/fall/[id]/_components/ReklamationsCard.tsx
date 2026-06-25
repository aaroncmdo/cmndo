'use client'

// AAR-294: Reklamation läuft via faelle.status='rueckfrage' (keine eigenen
// reklamation_*-Spalten in der DB).

import { AlertCircleIcon } from 'lucide-react'

type Fall = {
  id: string
  status: string | null
}

export function ReklamationsCard({ fall, id }: { fall: Fall; id?: string }) {
  if (fall.status !== 'rueckfrage') return null

  return (
    <div
      id={id}
      className="rounded-2xl border bg-danger-soft border-danger/30 p-4 sm:p-5 space-y-2"
    >
      <div className="flex items-center gap-2">
        <AlertCircleIcon className="w-4 h-4 text-danger-strong" />
        <p className="text-xs uppercase tracking-wider font-semibold text-danger-strong">
          Rückfrage offen
        </p>
      </div>
      <p className="text-sm text-claimondo-navy">
        Die Kanzlei oder der Kundenbetreuer hat eine Rückfrage zu deinem Fall.
      </p>
      <p className="text-xs text-danger-strong">
        Bitte beantworte die Rückfrage im Chat oder kontaktiere den Kundenbetreuer.
      </p>
    </div>
  )
}
