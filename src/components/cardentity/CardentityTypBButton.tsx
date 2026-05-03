'use client'

// AAR-311: Shared UI für den Cardentity-Typ-B-Trigger.
// Konsumenten: Dispatcher Phase 4, Admin/KB-Fallakte, SV-Fallakte.
// Idempotent — wenn bereits abgerufen, zeigt der Button nur den Stand und das
// Ergebnis statt einer erneuten 15€-Abfrage.

import { useState, useTransition } from 'react'
import { ShieldAlertIcon, CheckCircle2Icon, AlertTriangleIcon, LoaderIcon } from 'lucide-react'

export type TypBState = {
  fetchedAt: string | null
  vorschadenVorhanden: boolean | null
  vorschadenAnzahl: number | null
  letzterVorschadenDatum: string | null
}

type Result =
  | {
      success: true
      alreadyFetched: boolean
      fetchedAt: string
      vorschadenVorhanden: boolean
      vorschadenAnzahl: number
      letzterVorschadenDatum: string | null
    }
  | { success: false; error: string; code?: number }

export function CardentityTypBButton({
  action,
  finVorhanden,
  initial,
  size = 'sm',
}: {
  action: () => Promise<Result>
  finVorhanden: boolean
  initial: TypBState
  size?: 'sm' | 'md'
}) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<TypBState>(initial)
  const [error, setError] = useState<string | null>(null)

  const fetched = !!state.fetchedAt

  function trigger() {
    setError(null)
    startTransition(async () => {
      const r = await action()
      if (!r.success) {
        setError(r.error)
        return
      }
      setState({
        fetchedAt: r.fetchedAt,
        vorschadenVorhanden: r.vorschadenVorhanden,
        vorschadenAnzahl: r.vorschadenAnzahl,
        letzterVorschadenDatum: r.letzterVorschadenDatum,
      })
    })
  }

  if (!finVorhanden) {
    return (
      <p className="text-[11px] text-claimondo-ondo/70">
        Cardentity Typ-B verfügbar sobald die FIN erfasst ist.
      </p>
    )
  }

  if (fetched) {
    const datum = state.fetchedAt
      ? new Date(state.fetchedAt).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
      : '—'
    const vorhanden = state.vorschadenVorhanden === true
    return (
      <div
        className={`rounded-lg border px-3 py-2 text-xs space-y-0.5 ${
          vorhanden ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
        }`}
      >
        <div className="flex items-center gap-1.5 font-medium">
          {vorhanden ? (
            <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-700" />
          ) : (
            <CheckCircle2Icon className="w-3.5 h-3.5 text-emerald-700" />
          )}
          <span className={vorhanden ? 'text-amber-900' : 'text-emerald-900'}>
            {vorhanden
              ? `${state.vorschadenAnzahl ?? 0} Vorschaden${(state.vorschadenAnzahl ?? 0) === 1 ? '' : ''}-Eintrag${(state.vorschadenAnzahl ?? 0) === 1 ? '' : 'e'} gefunden`
              : 'Keine Vorschäden in Cardentity'}
          </span>
        </div>
        <p className="text-[10px] text-claimondo-ondo">
          Typ-B abgefragt am {datum}
          {vorhanden && state.letzterVorschadenDatum
            ? ` · letzter Eintrag ${new Date(state.letzterVorschadenDatum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}`
            : ''}
        </p>
      </div>
    )
  }

  const padding = size === 'md' ? 'px-3 py-2' : 'px-2.5 py-1.5'

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={trigger}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 ${padding} rounded-lg border border-claimondo-border bg-white text-xs font-medium text-claimondo-navy hover:bg-[#f8f9fb] disabled:opacity-60 disabled:cursor-not-allowed`}
        title="Cardentity Typ-B kostet 15€ pro Abfrage. Sinnvoll bei konkretem Vorschadenverdacht."
      >
        {pending ? (
          <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ShieldAlertIcon className="w-3.5 h-3.5 text-[#4573A2]" />
        )}
        Cardentity Typ-B anfordern
      </button>
      <p className="text-[10px] text-claimondo-ondo/70">15€ pro Abfrage · einmalig pro Fahrzeug</p>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
