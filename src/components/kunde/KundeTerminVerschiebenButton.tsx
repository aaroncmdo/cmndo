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
}

export default function KundeTerminVerschiebenButton({ terminId, label = 'Termin verschieben' }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-claimondo-border bg-white text-claimondo-navy hover:bg-claimondo-navy/5 text-sm font-medium px-3 py-1.5 transition-colors"
      >
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
