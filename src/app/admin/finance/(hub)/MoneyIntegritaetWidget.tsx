// status-registry-skip: Finding-severity (critical/warning) ist kein Domain-Status (kein claim/lead-
//   Phasen-Badge), sondern eine lokale Monitoring-Ergebnis-Kennzeichnung — keine Registry-Domain dafuer.
'use client'

// Money-Integritaet-Widget (Admin Finance-Hub): on-demand-Ausloeser fuer die Money-Integrity-Checks
// (USt-Konsistenz + §14-Beleg-Reconciliation + Ledger-Cache-Drift). Rendert den Report inline.

import { useState } from 'react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { pruefeMoneyIntegritaet } from './money-integritaet-actions'
import type { MoneyIntegrityFinding, MoneyIntegrityReport } from '@/lib/finance/money-integrity-checks'

export default function MoneyIntegritaetWidget() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<MoneyIntegrityReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pruefen() {
    setLoading(true)
    setError(null)
    const res = await pruefeMoneyIntegritaet()
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setReport(res.report)
  }

  return (
    <div className="px-4 pb-8">
      <SectionCard
        title="Money-Integrität"
        subtitle="USt-Konsistenz · §14-Beleg-Reconciliation · Ledger-Cache-Drift"
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
            Prüft die Money-Tabellen auf Rechenfehler (brutto ≠ netto + USt), fehlende §14-Belege zu
            ausgezahlten Provisionen und Ledger-Cache-Drift. Findet nichts, solange kein echtes Geld fließt.
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
              {report.findings.map((f: MoneyIntegrityFinding, i: number) => (
                <li
                  key={`${f.check}-${f.tabelle}-${i}`}
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
                    <span className="text-claimondo-ondo/70">· {f.tabelle}</span>
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
    </div>
  )
}
