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
      className="rounded-2xl border bg-red-50 border-red-200 p-4 sm:p-5 space-y-2"
    >
      <div className="flex items-center gap-2">
        <AlertCircleIcon className="w-4 h-4 text-red-700" />
        <p className="text-xs uppercase tracking-wider font-semibold text-red-900">
          Rückfrage offen
        </p>
      </div>
      <p className="text-sm text-claimondo-navy">
        Die Kanzlei oder der Kundenbetreuer hat eine Rückfrage zu deinem Fall.
      </p>
      <p className="text-xs text-red-800">
        Bitte beantworte die Rückfrage im Chat oder kontaktiere den Kundenbetreuer.
      </p>
    </div>
  )
}
