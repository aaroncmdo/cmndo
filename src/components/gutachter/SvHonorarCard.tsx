// AAR-559 (C10): Honorar-Card für das SV-Portal.
// Zeigt AUSSCHLIESSLICH den SV-Anteil (auszahlung_gutachter_betrag +
// auszahlung_gutachter_eingegangen_am). NIE auszahlung_kunde_betrag und
// NIE regulierung_betrag. Column-Filter kommt aus faelle_sv_view (C8).

import { EuroIcon } from 'lucide-react'

interface Props {
  betrag: number | null
  eingegangenAm: string | null
}

function formatEuro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function SvHonorarCard({ betrag, eingegangenAm }: Props) {
  const n = betrag == null ? null : Number(betrag)
  const hatBetrag = n != null && !Number.isNaN(n) && n > 0
  const eingegangen = !!eingegangenAm

  if (!hatBetrag && !eingegangen) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <EuroIcon className="w-4 h-4 text-[var(--brand-secondary)]" />
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Dein Honorar
        </p>
        <span
          className={`ml-auto text-[10px] font-medium rounded-full px-2 py-0.5 ${
            eingegangen
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          {eingegangen ? 'Ausgezahlt' : 'Avisiert'}
        </span>
      </div>

      {hatBetrag && (
        <div>
          <p className="text-xs text-gray-500">Dein Anteil</p>
          <p className="text-2xl font-bold text-[var(--brand-primary)] tabular-nums">
            {formatEuro(n!)}
          </p>
        </div>
      )}

      {eingegangenAm && (
        <div className="text-xs pt-1 border-t border-gray-100">
          <p className="text-gray-500">Eingang auf deinem Konto</p>
          <p className="text-gray-900 font-medium">{formatDate(eingegangenAm)}</p>
        </div>
      )}

      <p className="text-[11px] text-gray-500 pt-1 border-t border-gray-100">
        Dies ist dein SV-Honorar-Anteil nach Abzug des Leadpreises. Die Regulierung
        an den Kunden ist für dich nicht relevant.
      </p>
    </div>
  )
}
