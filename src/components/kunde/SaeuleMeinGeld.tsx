'use client'

import { BanknoteIcon, AlertTriangleIcon } from 'lucide-react'

type Props = {
  status: string
  schadenhoehe_netto: number | null
  regulierung_betrag: number | null
  kuerzungs_betrag: number | null
  zahlung_betrag: number | null
  ist_totalschaden: boolean
}

function fmt(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export default function SaeuleMeinGeld({ status, schadenhoehe_netto, regulierung_betrag, kuerzungs_betrag, zahlung_betrag, ist_totalschaden }: Props) {
  const gefordert = schadenhoehe_netto ?? 0
  const anerkannt = regulierung_betrag ?? 0
  const kuerzung = kuerzungs_betrag ?? 0
  const eingegangen = zahlung_betrag ?? 0

  // Phasen-abhaengige Anzeige
  const showGefordert = !!schadenhoehe_netto
  const showAnerkannt = ['regulierung-laeuft', 'regulierung', 'zahlung-eingegangen', 'abgeschlossen'].includes(status)
  const showZahlung = ['zahlung-eingegangen', 'abgeschlossen'].includes(status)
  const showKuerzung = kuerzung > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BanknoteIcon className="w-5 h-5 text-emerald-600" />
        <h2 className="text-sm font-semibold text-[#0D1B3E]">Mein Geld</h2>
      </div>

      {ist_totalschaden && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangleIcon className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-xs text-red-700 font-medium">Ihr Fahrzeug ist ein Totalschaden</p>
        </div>
      )}

      <div className="space-y-3">
        {showGefordert && (
          <Row label="Gefordert" value={fmt(gefordert)} color="text-gray-900" />
        )}
        {showAnerkannt && (
          <Row label="Anerkannt" value={fmt(anerkannt)} color="text-green-700" />
        )}
        {showKuerzung && (
          <Row label="Kürzung" value={`-${fmt(kuerzung)}`} color="text-amber-700" />
        )}
        {showZahlung && (
          <Row label="Eingegangen" value={fmt(eingegangen)} color="text-emerald-700" bold />
        )}
        {!showGefordert && (
          <p className="text-xs text-gray-400">Beträge werden nach Gutachten-Erstellung angezeigt.</p>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`${color} ${bold ? 'font-bold text-base' : 'font-semibold'}`}>{value}</span>
    </div>
  )
}
