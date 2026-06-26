'use client'

// AAR-294: Reklamation läuft via faelle.status='rueckfrage' (keine eigenen
// reklamation_*-Spalten in der DB).

import { AlertCircleIcon } from 'lucide-react'
import { NoticeBox } from '@/components/shared/NoticeBox'

type Fall = {
  id: string
  status: string | null
}

export function ReklamationsCard({ fall, id }: { fall: Fall; id?: string }) {
  if (fall.status !== 'rueckfrage') return null

  return (
    <NoticeBox
      tone="danger"
      id={id}
      className="rounded-2xl p-4 sm:p-5 space-y-2"
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
    </NoticeBox>
  )
}
