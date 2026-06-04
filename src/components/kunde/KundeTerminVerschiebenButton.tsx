'use client'

// AAR-864: Trigger-Button für den Kunden-Termin-Verschieben-Flow.
// Server-Component-friendly Wrapper — hält State + rendert Modal.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarClockIcon } from 'lucide-react'
import KundeTerminVerschiebenModal from './KundeTerminVerschiebenModal'

type Props = {
  terminId: string
  /** Optional anderes Label (Default: „Termin verschieben" aus terminVerschieben.modalTitel). */
  label?: string
}

export default function KundeTerminVerschiebenButton({ terminId, label }: Props) {
  const t = useTranslations('terminVerschieben')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-ios-lg border border-claimondo-border bg-white text-claimondo-navy hover:bg-claimondo-navy/5 text-sm font-medium px-3 py-1.5 transition-colors"
      >
        <CalendarClockIcon className="w-3.5 h-3.5" />
        {label ?? t('modalTitel')}
      </button>
      <KundeTerminVerschiebenModal
        open={open}
        onClose={() => setOpen(false)}
        terminId={terminId}
      />
    </>
  )
}
