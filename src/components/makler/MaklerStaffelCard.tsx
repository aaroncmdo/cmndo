'use client'

// Staffel-Fortschritt im Makler-Dashboard: Balken zur naechsten Meilenstein-Schwelle
// + erreichbare Bonus-Betraege. Reine Anzeige (keine I/O). 1:1 gespiegelt von
// WerkstattStaffelCard; nutzt den generischen (domain-freien) staffel.ts-Helper wieder.
// Metrik = freigegebene Vermittlungen (settled = freigegeben+ausgezahlt).

import { TrophyIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { berechneStaffelFortschritt, type StaffelStufe } from '@/lib/werkstatt/staffel'

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

type Props = {
  settledCount: number
  pendingCount: number
  stufen: StaffelStufe[]
}

export function MaklerStaffelCard({ settledCount, pendingCount, stufen }: Props) {
  if (stufen.length === 0) return null
  const f = berechneStaffelFortschritt(settledCount, stufen)

  return (
    <SectionCard icon={<TrophyIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Ihre Staffelung">
      {f.alleErreicht ? (
        <p className="text-body text-claimondo-navy font-semibold">
          Alle Meilensteine erreicht — stark! 🎉
        </p>
      ) : f.naechste ? (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-body-sm text-claimondo-ondo">
              Nächster Meilenstein: <strong className="text-claimondo-navy">{f.naechste.schwelle} Vermittlungen</strong>
            </span>
            <span className="text-body font-semibold text-claimondo-navy">
              +{EUR.format(f.naechste.bonus_betrag_netto)}
            </span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-ios-sm bg-claimondo-bg border border-claimondo-border">
            <div className="h-full rounded-ios-sm bg-claimondo-ondo transition-all" style={{ width: `${f.prozent}%` }} />
          </div>
          <p className="mt-1 text-caption text-claimondo-ondo/70">
            {settledCount} von {f.naechste.schwelle} freigegebenen Vermittlungen
            {pendingCount > 0 ? ` · ${pendingCount} in Prüfung` : ''}
          </p>
        </div>
      ) : null}

      <ul className="mt-4 space-y-1.5">
        {stufen.map((s) => {
          const erreicht = f.erreichteSchwellen.includes(s.schwelle)
          return (
            <li key={s.schwelle} className="flex items-center justify-between text-body-sm">
              <span className={erreicht ? 'text-success-strong font-medium' : 'text-claimondo-ondo'}>
                {erreicht ? '✓' : '○'} {s.schwelle} Vermittlungen
              </span>
              <span className={erreicht ? 'text-success-strong font-semibold' : 'text-claimondo-navy'}>
                {EUR.format(s.bonus_betrag_netto)}
              </span>
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}
