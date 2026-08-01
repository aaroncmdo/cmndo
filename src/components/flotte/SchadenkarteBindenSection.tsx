'use client'

import { useState } from 'react'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives/Button'
import { SchadenkarteScanner } from './SchadenkarteScanner'
import type { FlottenFahrzeug } from '@/lib/kunde/firma-flotte'

type Props = {
  flotte: FlottenFahrzeug[]
  onBinde: (token: string, vehicleId: string) => Promise<{ ok: boolean; error?: string }>
}

type RowState = {
  scannerOffen: boolean
  busy: boolean
  meldung: { ok: boolean; text: string } | null
}

function initRowState(): RowState {
  return { scannerOffen: false, busy: false, meldung: null }
}

export function SchadenkarteBindenSection({ flotte, onBinde }: Props) {
  const [rowStates, setRowStates] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {}
    for (const fz of flotte) init[fz.vehicleId] = initRowState()
    return init
  })

  function patchRow(vehicleId: string, patch: Partial<RowState>) {
    setRowStates((prev) => ({
      ...prev,
      [vehicleId]: { ...(prev[vehicleId] ?? initRowState()), ...patch },
    }))
  }

  function toggleScanner(vehicleId: string) {
    const aktuell = rowStates[vehicleId] ?? initRowState()
    patchRow(vehicleId, { scannerOffen: !aktuell.scannerOffen, meldung: null })
  }

  async function handleToken(vehicleId: string, token: string) {
    patchRow(vehicleId, { scannerOffen: false, busy: true, meldung: null })
    const res = await onBinde(token, vehicleId)
    patchRow(vehicleId, {
      busy: false,
      meldung: {
        ok: res.ok,
        text: res.ok ? 'Netzwerkkarte erfolgreich gebunden.' : (res.error ?? 'Fehler beim Binden.'),
      },
    })
  }

  if (flotte.length === 0) {
    return (
      <SectionCard title="Netzwerkkarten binden" subtitle="Fügen Sie zuerst Fahrzeuge zur Flotte hinzu.">
        <p className="text-body-sm text-claimondo-ondo">Keine Fahrzeuge vorhanden.</p>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Netzwerkkarten binden"
      subtitle="Weisen Sie jeder Netzwerkkarte ein Fahrzeug zu. QR-Code scannen, Code manuell eingeben — oder die Karte mit dem Handy antippen."
    >
      <ul className="space-y-4">
        {flotte.map((fz) => {
          const state = rowStates[fz.vehicleId] ?? initRowState()
          const label = [fz.kennzeichen, fz.hersteller, fz.modell].filter(Boolean).join(' · ') || fz.vehicleId
          return (
            <li key={fz.vehicleId} className="space-y-2 border-b border-claimondo-border pb-4 last:border-none last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-sm font-medium text-claimondo-navy">{label}</span>
                <Button
                  variant={state.scannerOffen ? 'ghost' : 'navy'}
                  size="sm"
                  onClick={() => toggleScanner(fz.vehicleId)}
                  disabled={state.busy}
                >
                  {state.scannerOffen ? 'Abbrechen' : 'Karte binden'}
                </Button>
              </div>

              {state.scannerOffen && (
                <SchadenkarteScanner
                  onToken={(t) => handleToken(fz.vehicleId, t)}
                  disabled={state.busy}
                />
              )}

              {state.meldung && (
                <p
                  className={
                    state.meldung.ok
                      ? 'text-body-sm text-success-strong'
                      : 'text-body-sm text-danger-strong'
                  }
                >
                  {state.meldung.text}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}
