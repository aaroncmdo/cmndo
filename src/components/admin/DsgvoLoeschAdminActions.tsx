'use client'

// Admin-Aktionen für DSGVO-Lösch-Anträge.
// Zwei Buttons: Bestätigen (startet 14d-Karenz) und Direkt-Ausführen.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon, FlameIcon } from 'lucide-react'
import {
  bestaetigeLoeschAntrag,
  fuehreLoeschungAus,
} from '@/lib/actions/dsgvo-loeschung'

type Props = {
  auftragId: string
  status: 'eingereicht' | 'bestaetigt'
}

export default function DsgvoLoeschAdminActions({ auftragId, status }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmDirect, setConfirmDirect] = useState(false)

  function bestaetigen() {
    setError(null)
    startTransition(async () => {
      const r = await bestaetigeLoeschAntrag(auftragId)
      if (!r.ok) setError(r.error)
      else router.refresh()
    })
  }

  function ausfuehren() {
    setError(null)
    startTransition(async () => {
      const r = await fuehreLoeschungAus(auftragId)
      if (!r.ok) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      {status === 'eingereicht' && (
        <button
          type="button"
          onClick={bestaetigen}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-claimondo-ondo px-3.5 py-1.5 text-xs font-semibold text-white shadow-cta-ondo transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-[#3a6291] hover:-translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
        >
          <CheckIcon width={12} height={12} />
          {pending ? 'wartet …' : 'Bestätigen'}
        </button>
      )}

      {!confirmDirect ? (
        <button
          type="button"
          onClick={() => setConfirmDirect(true)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-red-700 transition-all duration-200 hover:bg-red-50 hover:-translate-y-[1px] disabled:opacity-50"
        >
          <FlameIcon width={12} height={12} />
          Direkt ausführen
        </button>
      ) : (
        <div className="flex flex-col items-end gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700">
            Sicher? Anonymisierung ist irreversibel.
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={ausfuehren}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(220,38,38,.30)] transition-all duration-200 hover:bg-red-700 hover:-translate-y-[1px] disabled:opacity-50"
            >
              <FlameIcon width={12} height={12} />
              {pending ? 'läuft …' : 'Ja, ausführen'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDirect(false)}
              disabled={pending}
              className="rounded-full border border-claimondo-border bg-white px-3.5 py-1.5 text-xs font-semibold text-claimondo-navy transition-colors hover:bg-claimondo-bg disabled:opacity-50"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="max-w-[200px] text-right text-[10px] text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
