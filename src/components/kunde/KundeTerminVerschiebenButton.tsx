'use client'

// AAR-864: Trigger-Button für den Kunden-Termin-Verschieben-Flow.
// Server-Component-friendly Wrapper — hält State + rendert Modal.

import { useState } from 'react'
import { CalendarClockIcon } from 'lucide-react'
import KundeTerminVerschiebenModal from './KundeTerminVerschiebenModal'

type Props = {
  terminId: string
  /** Optional anderes Label (Default: „Termin verschieben"). */
  label?: string
  /** 'default' = Outline-Button, 'primary' = solides Rot fuer verstrichene Termine. */
  variant?: 'default' | 'primary'
}

export default function KundeTerminVerschiebenButton({ terminId, label = 'Termin verschieben', variant = 'default' }: Props) {
  const [open, setOpen] = useState(false)
  const cls = variant === 'primary'
    ? 'inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-3 py-1.5 transition-colors shadow-sm'
    : 'inline-flex items-center gap-1.5 rounded-lg border border-claimondo-border bg-white text-claimondo-navy hover:bg-claimondo-navy/5 text-sm font-medium px-3 py-1.5 transition-colors'
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cls}>
        <CalendarClockIcon className="w-3.5 h-3.5" />
        {label}
      </button>
      <KundeTerminVerschiebenModal
        open={open}
        onClose={() => setOpen(false)}
        terminId={terminId}
      />
    </>
  )
}
