// status-registry-skip: Finding-severity (critical/warning) ist kein Domain-Status (kein claim/lead-
//   Phasen-Badge), sondern eine lokale Monitoring-Ergebnis-Kennzeichnung — keine Registry-Domain dafuer.
'use client'

// Termine-Integritaet-Widget (Admin-Dashboard): on-demand-Ausloeser fuer die Termine-Integrity-Checks
// (Buchung<->Buchung-Constraint + Buchung<->CalDAV + Buchung<->Urlaub-Overlaps). Rendert den Report
// inline. Kein Server-Fetch beim Render — erst der „Pruefen"-Klick fragt die DB ab.

import { useState } from 'react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { pruefeTermineIntegritaet } from './termine-integritaet-actions'
import type { TermineIntegrityFinding, TermineIntegrityReport } from '@/lib/termine/termine-integrity-checks'

export default function TermineIntegritaetWidget() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<TermineIntegrityReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pruefen() {
    setLoading(true)
    setError(null)
    const res = await pruefeTermineIntegritaet()
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setReport(res.report)
  }

  return (
    <SectionCard
      title="Termine-Integrität"
      subtitle="Doppelbuchung · Buchung ↔ CalDAV-Kalender · Buchung ↔ Urlaub/Sperre"
      headerAction={
        <Button variant="navy" onClick={pruefen} loading={loading}>
          Prüfen
        </Button>
      }
    >
      {error ? (
        <p className="text-sm text-danger-strong">{error}</p>
      ) : report == null ? (
        <p className="text-sm text-claimondo-ondo/70">
          Prüft alle aktiven SV-Termine auf Überschneidungen — zwei Buchungen gleichzeitig, oder eine
          Buchung über einem externen Kalender-Eintrag bzw. einer Urlaubs-/Sperr-Zeit. Findet nichts,
          solange die Buchungs-Engine sauber greift.
        </p>
      ) : report.ok ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success-soft text-sm text-success-strong">
            ✓
          </span>
          <p className="text-sm text-claimondo-navy">
            Alles konsistent — {report.geprueft} Checks, 0 Findings.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-danger-strong">
            {report.findings.length} Finding(s) bei {report.geprueft} Checks:
          </p>
          <ul className="space-y-1.5">
            {report.findings.map((f: TermineIntegrityFinding, i: number) => (
              <li
                key={`${f.check}-${i}`}
                className="rounded-ios-md border border-claimondo-border bg-claimondo-bg/50 px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      f.severity === 'critical'
                        ? 'bg-danger-soft text-danger-strong'
                        : 'bg-warning-soft text-warning-strong'
                    }`}
                  >
                    {f.severity}
                  </span>
                  <span className="font-mono text-claimondo-ondo">{f.check}</span>
                </div>
                <p className="mt-1 text-claimondo-navy">{f.detail}</p>
                {f.beispiel_ids && f.beispiel_ids.length > 0 ? (
                  <p className="mt-0.5 text-[10px] text-claimondo-ondo/70">z.B. {f.beispiel_ids.join(', ')}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}
