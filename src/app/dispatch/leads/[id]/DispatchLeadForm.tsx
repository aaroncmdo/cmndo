'use client'

// P2a (dispatch-config-unify): flacher, config-getriebener Dispatcher-Renderer.
// Liest die lead-erfassung-Felder (audience dispatcher/beide, vom Loader gefiltert)
// und rendert sie nach `sektion` gruppiert — ALLE Sektionen sichtbar, kein Phasen-
// Lock. Wiederverwendet den geteilten FieldRenderer (eine Render-Quelle).
//
// P2a = read-only Vorschau hinter `?v2`: Felder sind interaktiv (lokaler State),
// aber es wird NICHTS gespeichert. Per-Feld-Autosave + Boolean-Coercion + die
// reichen Dispatch-Sektionen (SvDispatchPanel, Unfallskizze, …) kommen in P2b/P2d.

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { FieldRenderer } from '@/components/onboarding/FieldRenderer'
import type { OnboardingPhase, OnboardingFeld } from '@/components/onboarding/types'

type LeadRow = Record<string, unknown> & { id: string }

// Lead-Spaltenwert -> Initialwert fuer das jeweilige Feld-Render-Modell.
// segmented Ja/Nein liegt als boolean in der DB -> 'true'/'false'-String fuers Render.
function initialValue(feld: OnboardingFeld, lead: LeadRow): unknown {
  const raw = lead[feld.feld_key]
  if (feld.typ === 'file') return Array.isArray(raw) ? raw : []
  if (feld.typ === 'checkbox') return raw === true
  if (typeof raw === 'boolean') return String(raw)
  return raw ?? ''
}

export default function DispatchLeadForm({
  lead,
  phasen,
}: {
  lead: LeadRow
  phasen: OnboardingPhase[]
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    for (const phase of phasen) {
      for (const feld of phase.felder) init[feld.feld_key] = initialValue(feld, lead)
    }
    return init
  })

  const setField = (key: string, val: unknown) =>
    setValues((prev) => ({ ...prev, [key]: val }))

  const titel = `${(lead.vorname as string) ?? ''} ${(lead.nachname as string) ?? ''}`.trim() || 'Lead'

  return (
    <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-claimondo-navy">{titel}</h1>
        <p className="text-sm text-claimondo-ondo/70 mt-0.5">Lead-Erfassung — config-getrieben (Vorschau)</p>
      </div>

      {/* Read-only-Hinweis (P2a). Speichern kommt in P2b. */}
      <div className="mb-5 rounded-ios-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="font-semibold">Vorschau (?v2)</span> — die Felder sind interaktiv, werden aber
        noch <span className="font-semibold">nicht gespeichert</span>. Autosave + SV-Panel/Skizze folgen (P2b/P2d).
      </div>

      <div className="flex flex-col gap-3 max-w-3xl">
        {phasen.map((phase) => (
          <details
            key={phase.id}
            open
            className="group rounded-ios-xl border border-claimondo-border bg-white"
          >
            <summary className="flex items-center justify-between cursor-pointer select-none px-4 py-3 text-sm font-semibold text-claimondo-navy">
              <span>
                {phase.titel}
                <span className="ml-2 text-xs font-normal text-claimondo-ondo/50">
                  {phase.felder.length} Feld{phase.felder.length === 1 ? '' : 'er'}
                </span>
              </span>
              <ChevronDown className="w-4 h-4 text-claimondo-ondo/50 transition-transform group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
              {phase.felder.map((feld) => (
                <FieldRenderer
                  key={feld.id}
                  feld={feld}
                  value={values[feld.feld_key]}
                  onChange={(val) => setField(feld.feld_key, val)}
                  disabled={false}
                />
              ))}
            </div>
          </details>
        ))}
      </div>
    </main>
  )
}
