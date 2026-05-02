'use client'

// Smoke-Helper: Button setzt den aktuellen Fall auf den Stand
// "Erfassung -> Kanzlei-Wunsch offen, ohne Vollmacht" zurueck, damit der
// Walkthrough erneut durchgespielt werden kann.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCcwIcon } from 'lucide-react'
import { smokeResetAufKanzleiWunsch } from '@/lib/kanzlei-wunsch/actions'

export default function SmokeKanzleiButton({ fallId }: { fallId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function reset() {
    if (!confirm('Fall auf Kanzlei-Wunsch-Walkthrough zurücksetzen? Vollmacht wird entfernt, Gutachten als freigegeben markiert.')) return
    setError(null)
    startTransition(async () => {
      const r = await smokeResetAufKanzleiWunsch(fallId)
      if (!r.ok) { setError(r.error ?? 'Fehler'); return }
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/60 p-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900 flex items-center gap-1.5">
            <span aria-hidden>🔧</span> Smoke: Kanzlei-Walkthrough
          </p>
          <p className="text-[11px] text-amber-800/80 mt-0.5">
            Setzt den Fall auf „QC durch, kein Kanzlei-Wunsch, keine Vollmacht" zurück — du kannst den Banner-Flow neu durchspielen.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 transition-colors"
        >
          <RefreshCcwIcon className="w-3.5 h-3.5" />
          {pending ? 'Wird zurückgesetzt…' : 'Zurücksetzen'}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-700 mt-1.5">{error}</p>}
    </div>
  )
}
