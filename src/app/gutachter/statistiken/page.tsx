import { BarChart3Icon } from 'lucide-react'

export default function StatistikenPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 bg-white border-b border-claimondo-border px-4 py-2">
        <h1 className="text-sm font-semibold text-claimondo-navy">Statistiken</h1>
        <p className="text-claimondo-ondo text-xs">Auswertungen und Kennzahlen</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="bg-white rounded-2xl border border-claimondo-border p-12 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--brand-secondary)]/10 flex items-center justify-center mb-4">
            <BarChart3Icon className="w-7 h-7 text-[var(--brand-secondary)]" />
          </div>
          <h2 className="text-lg font-semibold text-claimondo-navy mb-2">Statistiken werden gerade aufgebaut</h2>
          <p className="text-claimondo-ondo text-sm">
            Kommt mit dem Statistik-Rework. Bis dahin findest du deine Zahlen in der Abrechnung.
          </p>
        </div>
      </div>
    </div>
  )
}
