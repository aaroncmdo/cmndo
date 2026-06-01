'use client'

// Cardentity scharf (2026-05-31): EIN manueller Button, beide Outcomes.
// Ein (kostenpflichtiger) Report-Pull liefert Fahrzeugdaten + Vorschaden.
// Confirm-Dialog vor dem ~15-EUR-Call. Idempotent: bereits abgerufen -> nur
// Anzeige, kein Re-Call. Konsumenten: Dispatch Phase 4 (Lead), Admin/KB-Fallakte,
// SV-Fallakte. Ersetzt den alten CardentityTypBButton.

import { useState, useTransition } from 'react'
import { ShieldAlertIcon, CheckCircle2Icon, AlertTriangleIcon, LoaderIcon } from 'lucide-react'

export type CardentityButtonState = {
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
      vehicleFieldsUpdated: string[]
      vorschadenVorhanden: boolean
      vorschadenAnzahl: number
      letzterVorschadenDatum: string | null
    }
  | { success: false; error: string; code?: number }

export function CardentityButton({
  action,
  finVorhanden,
  initial,
  size = 'sm',
}: {
  action: () => Promise<Result>
  finVorhanden: boolean
  initial: CardentityButtonState
  size?: 'sm' | 'md'
}) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<CardentityButtonState>(initial)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const fetched = !!state.fetchedAt

  function trigger() {
    setError(null)
    setInfo(null)
    // Kostenpflichtige Abfrage — explizite Bestaetigung vor jedem echten Call.
    if (!window.confirm('Kostenpflichtige Cardentity-Abfrage (~15 €): Fahrzeugdaten und Vorschäden jetzt abrufen?')) {
      return
    }
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
      if (r.alreadyFetched) {
        setInfo('Bereits abgerufen — gespeicherter Stand angezeigt (kein erneuter Abruf).')
      } else if (r.vehicleFieldsUpdated.length > 0) {
        setInfo(`Fahrzeugdaten aktualisiert: ${r.vehicleFieldsUpdated.join(', ')}`)
      }
    })
  }

  if (!finVorhanden) {
    return (
      <p className="text-[11px] text-claimondo-ondo/70">
        Cardentity-Abruf verfügbar sobald die FIN erfasst ist.
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
        className={`rounded-ios-lg border px-3 py-2 text-xs space-y-0.5 ${
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
              ? `${state.vorschadenAnzahl ?? 0} Vorschaden-Eintrag${(state.vorschadenAnzahl ?? 0) === 1 ? '' : 'e'} gefunden`
              : 'Keine Vorschäden in Cardentity'}
          </span>
        </div>
        <p className="text-[10px] text-claimondo-ondo">
          Cardentity abgefragt am {datum}
          {vorhanden && state.letzterVorschadenDatum
            ? ` · letzter Eintrag ${new Date(state.letzterVorschadenDatum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}`
            : ''}
        </p>
        {info && <p className="text-[10px] text-claimondo-ondo/80">{info}</p>}
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
        className={`inline-flex items-center gap-1.5 ${padding} rounded-ios-lg border border-claimondo-border bg-white text-xs font-medium text-claimondo-navy hover:bg-claimondo-bg disabled:opacity-60 disabled:cursor-not-allowed`}
        title="Kostenpflichtige Cardentity-Abfrage (~15 €): liefert Fahrzeugdaten + Vorschadenhistorie zur FIN."
      >
        {pending ? (
          <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ShieldAlertIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
        )}
        Cardentity abrufen
      </button>
      <p className="text-[10px] text-claimondo-ondo/70">~15 € pro Abfrage · Fahrzeugdaten + Vorschäden · einmalig pro Fahrzeug</p>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
