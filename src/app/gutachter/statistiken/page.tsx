import Link from 'next/link'
import { BarChart3Icon, ArrowRightIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

// 2026-05-07 Design-Review: Stub-Page mit klarem Beta-Label + ETA-Hinweis
// + CTA zur Abrechnung (dort sind die Zahlen die der SV bis zum Rework braucht).

export default function StatistikenPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 bg-white border-b border-claimondo-border px-4 py-2">
        <PageHeader
          title="Statistiken"
          description="Auswertungen und Kennzahlen"
          actions={
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
              Beta · in Arbeit
            </span>
          }
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="bg-white rounded-2xl border border-claimondo-border p-12 text-center max-w-2xl mx-auto">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--brand-secondary)]/10 flex items-center justify-center mb-4">
            <BarChart3Icon className="w-7 h-7 text-[var(--brand-secondary)]" />
          </div>
          <h2 className="text-lg font-semibold text-claimondo-navy mb-2">Statistiken werden gerade aufgebaut</h2>
          <p className="text-claimondo-ondo text-sm mb-6">
            Wir bauen das Statistik-Dashboard im Rahmen des nächsten Releases. Bis dahin findest du deine Zahlen in der Abrechnung.
          </p>
          <Link
            href="/gutachter/abrechnung"
            className="inline-flex items-center gap-2 bg-claimondo-navy hover:bg-claimondo-ondo text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            Zur Abrechnung
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
