'use client'

// AAR-377: Regenerate-Button für das SV-Briefing. Wird in der BriefingCard
// gerendert — nur wenn der Aufrufer `canRegenerate=true` setzt (UI-Gate,
// zusätzlich Server-Seitiger Rollen-Check in `regenerateSvBriefing`).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { RefreshCwIcon } from 'lucide-react'
import { regenerateSvBriefing } from '@/app/faelle/[id]/actions/briefing'

type Props = {
  fallId: string
  label?: string
}

export default function BriefingRegenerateButton({
  fallId,
  label = 'Neu generieren',
}: Props) {
  const [pending, startTransition] = useTransition()
  const [, setTick] = useState(0)

  function onClick() {
    startTransition(async () => {
      const r = await regenerateSvBriefing(fallId)
      if (r.success) {
        toast.success(`Briefing aktualisiert (v${r.version ?? '?'})`)
        setTick((t) => t + 1)
      } else {
        toast.error(r.error ?? 'Briefing konnte nicht generiert werden')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
    >
      <RefreshCwIcon
        className={`w-3 h-3 ${pending ? 'animate-spin' : ''}`}
      />
      {pending ? 'Generiere ...' : label}
    </button>
  )
}
