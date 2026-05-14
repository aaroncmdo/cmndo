'use client'

// AAR-558 (C9) Brutto-Leak-Fix: Diese Säule zeigt dem Kunden KEINE Brutto-
// Beträge mehr (regulierung_betrag / zahlung_betrag / kuerzungs_betrag).
// Die Netto-Auszahlung kommt aus AuszahlungCard (auszahlung_kunde_betrag aus
// faelle_kunde_view). Hier bleibt nur die eigene Forderung (schadens_hoehe_netto),
// der Totalschaden-Badge und die Zahlungsweg-Wahl (die vor Auszahlung nötig ist).

import { useState, useTransition } from 'react'
import { BanknoteIcon, AlertTriangleIcon } from 'lucide-react'

type Props = {
  fallId: string
  status: string
  schadens_hoehe_netto: number | null
  totalschaden: boolean
  zahlungsweg: string | null
  onZahlungswegSave?: (fallId: string, weg: string) => Promise<{ success: boolean }>
}

function fmt(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export default function SaeuleMeinGeld({ fallId, status, schadens_hoehe_netto, totalschaden, zahlungsweg, onZahlungswegSave }: Props) {
  const [pending, startTransition] = useTransition()
  const [weg, setWeg] = useState<string | null>(zahlungsweg)
  const [saved, setSaved] = useState(!!zahlungsweg)

  const gefordert = schadens_hoehe_netto ?? 0
  const showGefordert = !!schadens_hoehe_netto
  const showZahlungswegWahl = ['regulierung-laeuft', 'regulierung', 'zahlung-eingegangen'].includes(status) && !saved && onZahlungswegSave

  function handleSaveWeg(selected: string) {
    if (!onZahlungswegSave) return
    startTransition(async () => {
      const res = await onZahlungswegSave(fallId, selected)
      if (res.success) { setWeg(selected); setSaved(true) }
    })
  }

  return (
    <div className="bg-white rounded-ios-xl border border-claimondo-border shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BanknoteIcon className="w-5 h-5 text-emerald-600" />
        <h2 className="text-sm font-semibold text-claimondo-navy">Mein Geld</h2>
      </div>

      {totalschaden && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-ios-lg px-3 py-2">
          <AlertTriangleIcon className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-xs text-red-700 font-medium">Ihr Fahrzeug ist ein Totalschaden</p>
        </div>
      )}

      <div className="space-y-3">
        {showGefordert ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-claimondo-ondo">Ihre Forderung</span>
            <span className="text-claimondo-navy font-semibold">{fmt(gefordert)}</span>
          </div>
        ) : (
          <p className="text-xs text-claimondo-ondo/70">Beträge werden nach Gutachten-Erstellung angezeigt.</p>
        )}
        <p className="text-[11px] text-claimondo-ondo">
          Die ausgezahlte Summe sehen Sie nach der Regulierung in der Auszahlungs-Card.
        </p>
      </div>

      {saved && weg && (
        <p className="text-xs text-claimondo-ondo">Auszahlung: {weg === 'kundenkonto' ? 'Auf mein Konto' : 'Direkt an Werkstatt'}</p>
      )}

      {showZahlungswegWahl && (
        <div className="border-t border-claimondo-border pt-3 space-y-2">
          <p className="text-xs font-semibold text-claimondo-navy">Wohin soll die Auszahlung gehen?</p>
          <div className="flex gap-2">
            <button disabled={pending} onClick={() => handleSaveWeg('kundenkonto')} className="flex-1 px-3 py-2 rounded-ios-lg border border-claimondo-border text-xs font-medium hover:bg-claimondo-bg disabled:opacity-50">Auf mein Konto</button>
            <button disabled={pending} onClick={() => handleSaveWeg('werkstatt_direkt')} className="flex-1 px-3 py-2 rounded-ios-lg border border-claimondo-border text-xs font-medium hover:bg-claimondo-bg disabled:opacity-50">Direkt an Werkstatt</button>
          </div>
        </div>
      )}
    </div>
  )
}
