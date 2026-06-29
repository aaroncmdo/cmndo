'use client'

// P2f / §8c (dispatch-config-unify): nicht-blockierende „erfasst / offen"-Übersicht
// VOR dem Flowlink-Versand — zeigt dem Dispatcher pro Sektion, welche Felder noch
// leer sind. Reines Info-Panel (KEIN Hard-Gate). Liest die Live-Form-Werte, damit
// sich die Zählung beim Tippen aktualisiert.
//
// Hinweis: im lead-erfassung-Seed ist (noch) kein Feld pflicht=true → die Übersicht
// zählt ALLE Dispatcher-sichtbaren Felder (audience dispatcher/beide), nicht nur
// Pflichtfelder. termin (SvDispatchPanel-Override) + signature sind keine einfachen
// Datenfelder und werden ausgenommen (eigener Status). Die Dokument-Anforder-Buttons
// (§8c Teil 2) sind separat.

import { ChevronDown, CheckCircle2Icon, CircleIcon } from 'lucide-react'
import type { OnboardingPhase, OnboardingFeld } from '@/components/onboarding/types'

type Vals = Record<string, unknown>

function istErfasst(feld: OnboardingFeld, value: unknown): boolean {
  if (feld.typ === 'file') return Array.isArray(value) && value.length > 0
  if (typeof value === 'string') return value.trim() !== ''
  return value != null && value !== ''
}

function istZaehlbar(feld: OnboardingFeld): boolean {
  return feld.typ !== 'termin' && feld.typ !== 'signature'
}

export function DispatchChecklistPanel({ phasen, values }: { phasen: OnboardingPhase[]; values: Vals }) {
  const sektionen = phasen
    .map((phase) => {
      const felder = phase.felder.filter(istZaehlbar)
      const fehlend = felder.filter((f) => !istErfasst(f, values[f.feld_key]))
      return { titel: phase.titel, total: felder.length, fehlend }
    })
    .filter((s) => s.total > 0)

  const total = sektionen.reduce((n, s) => n + s.total, 0)
  const fehlendGesamt = sektionen.reduce((n, s) => n + s.fehlend.length, 0)
  const erfasst = total - fehlendGesamt

  return (
    <details className="group mt-3 max-w-3xl rounded-ios-xl border border-claimondo-border bg-white">
      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-semibold text-claimondo-navy">
        <span className="flex items-center gap-2">
          Erfassungs-Checkliste
          <span className="text-xs font-normal text-claimondo-ondo/70">
            {erfasst}/{total} Felder erfasst{fehlendGesamt > 0 ? ` · ${fehlendGesamt} offen` : ' ✓'}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-claimondo-ondo/50 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 px-4 pb-4 pt-1">
        {sektionen.map((s) => (
          <div key={s.titel} className="text-xs">
            <div className="flex items-center gap-1.5 font-medium text-claimondo-navy">
              {s.fehlend.length === 0 ? (
                <CheckCircle2Icon className="h-3.5 w-3.5 text-success" />
              ) : (
                <CircleIcon className="h-3.5 w-3.5 text-claimondo-ondo/40" />
              )}
              {s.titel}
              <span className="font-normal text-claimondo-ondo/60">
                {s.total - s.fehlend.length}/{s.total}
              </span>
            </div>
            {s.fehlend.length > 0 && (
              <p className="ml-5 text-claimondo-ondo/70">
                Offen: {s.fehlend.map((f) => f.label).join(' · ')}
              </p>
            )}
          </div>
        ))}
        <p className="pt-1 text-[11px] italic text-claimondo-ondo/60">
          Hinweis: rein informativ — der Flowlink kann jederzeit versendet werden.
        </p>
      </div>
    </details>
  )
}
