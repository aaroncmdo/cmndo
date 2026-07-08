'use client'

// Dispatch-Leads-Workflow (2026-07-07): zeigt bei qualifizierenden Leads, WELCHE
// Pflichtangaben noch fehlen (aus dem QualificationResult) — damit der Dispatcher
// exakt sieht, was zu erfassen ist, statt es zu suchen. Rein praesentational,
// self-hiding (nichts offen -> null). Q5 (SV-Termin) bleibt aussen vor: das ist
// der eigene sv_zuweisen-Zustand, kein Erfassungs-Pflichtfeld.

import type { QualificationResult } from '../_lib/qualification-engine'

const GATE_LABEL: Array<[keyof QualificationResult, string]> = [
  ['q1_schuldfrage', 'Schuldfrage'],
  ['q2_schaden', 'Schaden'],
  ['q3_polizei', 'Polizei vor Ort'],
  ['q4_schadentyp', 'Schadentyp'],
  ['q6_gegnerKz', 'Gegner-Kennzeichen'],
  ['q7_fahrzeug', 'Fahrzeug-Daten'],
  ['q8_schadenhergang', 'Schadenshergang'],
]

export default function LeadQualProgress({ qual }: { qual: QualificationResult }) {
  const missing = GATE_LABEL.filter(([key]) => qual[key] !== true).map(([, label]) => label)
  if (missing.length === 0) return null
  const done = GATE_LABEL.length - missing.length

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-claimondo-bg/40 px-4 py-3">
      <p className="text-body-xs text-claimondo-ondo">
        Pflichtangaben {done}/{GATE_LABEL.length} — offen:
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {missing.map((label) => (
          <span
            key={label}
            className="rounded-full bg-warning-soft px-2 py-0.5 text-body-xs font-medium text-warning-strong"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
