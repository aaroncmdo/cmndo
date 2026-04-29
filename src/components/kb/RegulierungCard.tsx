'use client'

// CMM-32i: Kanzlei-Fall-Lifecycle in der KB-Fallakte. Zeigt den aktuellen
// Stand (versicherungskontakt → auszahlung) als Mini-Stepper plus zwei
// Buttons. Render-Bedingung: Caller liefert nur Daten, wenn kanzlei_faelle
// für diesen Fall existiert (also nach KB-Freigabe).

import { useState, useTransition } from 'react'
import { CheckIcon, MailIcon, EuroIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  kanzleiVsKontaktErfasst,
  kanzleiAuszahlungEingegangen,
} from '@/lib/kanzlei-fall/actions'

type Props = {
  fallId: string
  status: 'versicherungskontakt' | 'auszahlung'
  vsKontaktAm: string | null
  ausgezahltAm: string | null
}

function fmt(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function RegulierungCard({
  fallId,
  status,
  vsKontaktAm,
  ausgezahltAm,
}: Props) {
  const router = useRouter()
  const [betrag, setBetrag] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [pendingKontakt, startKontakt] = useTransition()
  const [pendingAuszahlung, startAuszahlung] = useTransition()

  const vsKontaktDone = !!vsKontaktAm
  const auszahlungDone = !!ausgezahltAm

  function handleKontakt() {
    setError(null)
    startKontakt(async () => {
      const r = await kanzleiVsKontaktErfasst(fallId)
      if (!r.ok) setError(r.error ?? 'Fehler')
      else router.refresh()
    })
  }

  function handleAuszahlung() {
    setError(null)
    const parsed = betrag.trim() ? Number(betrag.replace(',', '.')) : undefined
    if (parsed !== undefined && (Number.isNaN(parsed) || parsed <= 0)) {
      setError('Betrag ungültig')
      return
    }
    startAuszahlung(async () => {
      const r = await kanzleiAuszahlungEingegangen(fallId, parsed)
      if (!r.ok) setError(r.error ?? 'Fehler')
      else router.refresh()
    })
  }

  return (
    <div className="rounded-2xl bg-white border border-claimondo-border px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-claimondo-navy">Regulierung</p>
          <p className="text-xs text-claimondo-ondo">Kanzlei-Fall-Lifecycle</p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${
            status === 'auszahlung'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-violet-50 text-violet-800 border border-violet-200'
          }`}
        >
          {status === 'auszahlung' ? 'Auszahlung' : 'In Regulierung'}
        </span>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        <StepperDot
          done={vsKontaktDone}
          icon={<MailIcon className="w-3.5 h-3.5" />}
          label="VS-Kontakt"
          datum={fmt(vsKontaktAm)}
        />
        <div className={`flex-1 h-0.5 ${vsKontaktDone ? 'bg-emerald-400' : 'bg-claimondo-border'}`} />
        <StepperDot
          done={auszahlungDone}
          icon={<EuroIcon className="w-3.5 h-3.5" />}
          label="Auszahlung"
          datum={fmt(ausgezahltAm)}
        />
      </div>

      {/* Aktionen */}
      {!auszahlungDone && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-claimondo-border/60">
          {!vsKontaktDone && (
            <button
              type="button"
              onClick={handleKontakt}
              disabled={pendingKontakt}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium px-3 py-2 transition-colors"
            >
              <MailIcon className="w-4 h-4" />
              {pendingKontakt ? 'Wird gespeichert…' : 'VS-Kontakt erfasst'}
            </button>
          )}
          <div className="flex items-center gap-2 sm:ml-auto">
            <input
              type="text"
              inputMode="decimal"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
              placeholder="Betrag €"
              className="w-28 rounded-lg border border-claimondo-border px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAuszahlung}
              disabled={pendingAuszahlung}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium px-3 py-2 transition-colors"
            >
              <EuroIcon className="w-4 h-4" />
              {pendingAuszahlung ? 'Wird gespeichert…' : 'Auszahlung eingegangen'}
            </button>
          </div>
        </div>
      )}

      {auszahlungDone && (
        <div className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckIcon className="w-4 h-4 text-emerald-600" />
          <span>Auszahlung am {fmt(ausgezahltAm)} eingegangen — Kanzlei-Fall abgeschlossen.</span>
        </div>
      )}

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

function StepperDot({
  done,
  icon,
  label,
  datum,
}: {
  done: boolean
  icon: React.ReactNode
  label: string
  datum: string | null
}) {
  return (
    <div className="flex flex-col items-center min-w-[80px]">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center ${
          done ? 'bg-emerald-500 text-white' : 'bg-claimondo-border text-claimondo-ondo'
        }`}
      >
        {done ? <CheckIcon className="w-4 h-4" /> : icon}
      </div>
      <span className="text-[11px] font-medium text-claimondo-navy mt-1">{label}</span>
      {datum && <span className="text-[10px] text-claimondo-ondo">{datum}</span>}
    </div>
  )
}
