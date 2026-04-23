'use client'

// AAR-293: SV-Abrechnungs-Card für Phase 6.x. Zeigt Honorar (faelle.gutachten_betrag),
// Leadpreis + Netto-Auszahlung. Kunden-Auszahlungsbetrag ist NICHT für SV bestimmt.

import { EuroIcon } from 'lucide-react'
import { berechneSvNetto, formatEuro, type SvAbrechnungInput } from '@/lib/gutachter/abrechnung'
import type { SvSubphase } from '@/lib/gutachter/subphase'

export function AbrechnungsCard({
  abrechnung,
  subphase,
}: {
  abrechnung: SvAbrechnungInput | null
  subphase: SvSubphase
}) {
  const honorar = abrechnung?.honorar ?? null
  const lead = abrechnung?.leadpreis ?? null
  const netto = berechneSvNetto(abrechnung)
  const ausgezahlt = Boolean(abrechnung?.abgerechnetAm)

  return (
    <div className="glass-light border border-claimondo-border border-l-4 border-l-claimondo-navy rounded-ios-md shadow-ios-sm p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <EuroIcon className="w-4 h-4 text-claimondo-ondo" />
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Deine Abrechnung
        </p>
        {abrechnung?.preistyp && (
          <span className="ml-auto text-[10px] text-gray-400">
            {abrechnung.preistyp}
          </span>
        )}
      </div>

      <dl className="space-y-2">
        <div className="flex items-baseline justify-between">
          <dt className="text-sm text-gray-600">Honorar (brutto)</dt>
          <dd className="text-sm font-medium text-claimondo-navy tabular-nums">{formatEuro(honorar)}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-sm text-gray-600">− Leadpreis</dt>
          <dd className="text-sm font-medium text-claimondo-navy tabular-nums">
            {lead != null ? `− ${formatEuro(lead)}` : '—'}
          </dd>
        </div>
        <div className="border-t border-claimondo-border pt-2 flex items-baseline justify-between">
          <dt className="text-sm font-semibold text-claimondo-navy">Netto-Auszahlung</dt>
          <dd className="text-base font-bold text-claimondo-ondo tabular-nums">{formatEuro(netto)}</dd>
        </div>
      </dl>

      <div
        className={`rounded-ios-sm p-3 text-xs ${
          ausgezahlt
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : subphase.code === 'zahlung-eingegangen'
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-gray-50 text-gray-700 border border-gray-200'
        }`}
      >
        {ausgezahlt ? (
          <>
            <p className="font-semibold">
              Überwiesen am {new Date(abrechnung!.abgerechnetAm!).toLocaleDateString('de-DE')}
            </p>
            <p className="mt-0.5">Bitte prüfe deinen Bankeingang.</p>
          </>
        ) : subphase.code === 'zahlung-eingegangen' ? (
          <>
            <p className="font-semibold">Zahlung vom Kunden ist da</p>
            <p className="mt-0.5">Dein Honorar wird in Kürze überwiesen.</p>
          </>
        ) : (
          <p>Noch nicht überwiesen. Warte auf Zahlungseingang bei Kanzlei.</p>
        )}
      </div>
    </div>
  )
}
