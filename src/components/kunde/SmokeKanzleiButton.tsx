'use client'

// Smoke-Helper: Zwei Buttons fuer den Kanzlei-Walkthrough.
//   1) Reset auf "Kanzlei-Wunsch offen" — Banner sichtbar, keine Vollmacht
//   2) Reset auf "LexDrive gewaehlt, Vollmacht offen" — blauer Vollmacht-Gate

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCcwIcon, HandshakeIcon, CheckCircle2Icon, FileWarningIcon } from 'lucide-react'
import {
  smokeResetAufKanzleiWunsch,
  smokeResetAufLexDriveVollmachtOffen,
  smokeResetAufLexDriveVollmachtSigniert,
  smokePflichtdokumenteAnlegen,
} from '@/lib/kanzlei-wunsch/actions'

export default function SmokeKanzleiButton({ fallId }: { fallId: string }) {
  const router = useRouter()
  const [pendingWunsch, startWunsch] = useTransition()
  const [pendingLex, startLex] = useTransition()
  const [pendingSigniert, startSigniert] = useTransition()
  const [pendingPflicht, startPflicht] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const pending = pendingWunsch || pendingLex || pendingSigniert || pendingPflicht

  function resetWunsch() {
    if (!confirm('Fall auf Kanzlei-Wunsch-Walkthrough zurücksetzen? Vollmacht raus, Gutachten freigegeben.')) return
    setError(null)
    startWunsch(async () => {
      const r = await smokeResetAufKanzleiWunsch(fallId)
      if (!r.ok) { setError(r.error ?? 'Fehler'); return }
      router.refresh()
    })
  }

  function resetLexDrive() {
    if (!confirm('Fall auf LexDrive + Vollmacht-Gate zurücksetzen? kanzlei_wunsch=partnerkanzlei, Vollmacht raus.')) return
    setError(null)
    startLex(async () => {
      const r = await smokeResetAufLexDriveVollmachtOffen(fallId)
      if (!r.ok) { setError(r.error ?? 'Fehler'); return }
      router.refresh()
    })
  }

  function resetLexDriveSigniert() {
    if (!confirm('Fall auf LexDrive + Vollmacht signiert + 7000 € Anspruch + BMW 5er K-AS 2014 setzen?')) return
    setError(null)
    startSigniert(async () => {
      const r = await smokeResetAufLexDriveVollmachtSigniert(fallId)
      if (!r.ok) { setError(r.error ?? 'Fehler'); return }
      router.refresh()
    })
  }

  function pflichtAnlegen() {
    if (!confirm('Offene Pflichtdokumente (Personalausweis, Fahrzeugschein, Schadenmeldung) anlegen?')) return
    setError(null)
    startPflicht(async () => {
      const r = await smokePflichtdokumenteAnlegen(fallId)
      if (!r.ok) { setError(r.error ?? 'Fehler'); return }
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/60 p-3 text-xs">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900 flex items-center gap-1.5">
            <span aria-hidden>🔧</span> Smoke: Walkthrough-Reset
          </p>
          <p className="text-[11px] text-amber-800/80 mt-0.5">
            Setze den Fall auf einen Punkt im Kanzlei-Flow zurück, um den Walkthrough zu testen.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={resetWunsch}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 transition-colors"
          >
            <RefreshCcwIcon className="w-3.5 h-3.5" />
            {pendingWunsch ? 'Setzt zurück…' : 'Kanzlei-Wunsch'}
          </button>
          <button
            type="button"
            onClick={resetLexDrive}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0e5be9] hover:bg-claimondo-navy text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 transition-colors"
          >
            <HandshakeIcon className="w-3.5 h-3.5" />
            {pendingLex ? 'Setzt zurück…' : 'LexDrive + Vollmacht offen'}
          </button>
          <button
            type="button"
            onClick={resetLexDriveSigniert}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2Icon className="w-3.5 h-3.5" />
            {pendingSigniert ? 'Setzt zurück…' : 'LexDrive signiert · 7000 €'}
          </button>
          <button
            type="button"
            onClick={pflichtAnlegen}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 transition-colors"
          >
            <FileWarningIcon className="w-3.5 h-3.5" />
            {pendingPflicht ? 'Legt an…' : 'Pflichtdokumente offen'}
          </button>
        </div>
      </div>
      {error && <p className="text-[11px] text-red-700 mt-1.5">{error}</p>}
    </div>
  )
}
