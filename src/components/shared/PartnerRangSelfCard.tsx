import { PartnerRangBadge } from './PartnerRangBadge'
import { tierLabel } from './partner-rang-badge.helpers'
import type { PartnerRangSelf } from '@/lib/partner-rang/get'

// Selbstansicht des verdienten Partner-Rangs (Makler/Werkstatt-Dashboard). Zeigt den Badge
// + Volumen (in der EIGENEN Ansicht erlaubt — nur oeffentlich bleibt die nackte Zahl verborgen)
// + Fortschritt zur naechsten Stufe (Motivation/Gamification). Gold = Endstufe. Rein
// praesentational; Daten via getPartnerRangSelf.
export function PartnerRangSelfCard({ rang }: { rang: PartnerRangSelf }) {
  const volumenText =
    rang.volumen === 1 ? '1 abgeschlossener Fall' : `${rang.volumen} abgeschlossene Fälle`

  return (
    <section
      aria-label="Ihr Partner-Rang"
      className="bg-white rounded-ios-md border border-claimondo-border p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PartnerRangBadge tier={rang.tier} sinnsatz={rang.sinnsatz} size="md" />
        <span className="text-body-sm text-claimondo-ondo">{volumenText}</span>
      </div>

      {rang.naechster ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-body-xs text-claimondo-ondo">
            <span>{tierLabel(rang.tier)}</span>
            <span>Nächste Stufe: {tierLabel(rang.naechster)}</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-ios-sm bg-claimondo-bg"
            role="progressbar"
            aria-valuenow={rang.prozent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-ios-sm bg-claimondo-ondo transition-all"
              style={{ width: `${rang.prozent}%` }}
            />
          </div>
          <p className="mt-2 text-body-xs text-claimondo-shield/70">
            Mehr abgeschlossene Fälle, Top-Bewertungen und Qualität bringen Sie näher an{' '}
            {tierLabel(rang.naechster)}.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-body-sm text-claimondo-shield">
          Höchste Stufe erreicht — Gold-Partner. <span aria-hidden>🏆</span>
        </p>
      )}
    </section>
  )
}
