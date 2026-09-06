// FiktiveAbrechnungCard — Kunde-Fallakte. Zeigt die VORAUSSICHTLICHE fiktive
// Auszahlung auf Gutachten-Basis, wenn der Kunde reparaturwunsch='fiktiv' gewaehlt
// hat. § 249 BGB: netto (keine Reparaturrechnung) + Wertminderung; bei Totalschaden
// Wiederbeschaffungswert − Restwert. Erwartung, nicht garantiert (Disclaimer).
// Anders als AuszahlungCard (= tatsaechliche Auszahlung nach Regulierung).

import { CalculatorIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'

interface Props {
  reparaturkostenNetto: number | null
  minderwert: number | null
  totalschaden: boolean | null
  wiederbeschaffungswert: number | null
  restwert: number | null
}

function euro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function FiktiveAbrechnungCard({
  reparaturkostenNetto,
  minderwert,
  totalschaden,
  wiederbeschaffungswert,
  restwert,
}: Props) {
  const ts = totalschaden === true
  const positionen: Array<{ label: string; betrag: number }> = []

  if (ts) {
    if (wiederbeschaffungswert != null) {
      positionen.push({ label: 'Wiederbeschaffungswert', betrag: wiederbeschaffungswert })
    }
    if (restwert != null && restwert > 0) {
      positionen.push({ label: 'abzüglich Restwert', betrag: -restwert })
    }
  } else {
    if (reparaturkostenNetto != null) {
      positionen.push({ label: 'Reparaturkosten (netto)', betrag: reparaturkostenNetto })
    }
    if (minderwert != null && minderwert > 0) {
      positionen.push({ label: 'Wertminderung', betrag: minderwert })
    }
  }

  if (positionen.length === 0) return null
  const summe = positionen.reduce((s, p) => s + p.betrag, 0)
  if (summe <= 0) return null

  return (
    <SectionCard title="Fiktive Abrechnung">
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <CalculatorIcon className="w-4 h-4 mt-0.5 text-claimondo-ondo shrink-0" />
          <div>
            <p className="text-xs text-claimondo-ondo">Voraussichtliche Auszahlung</p>
            <p className="text-2xl font-bold text-claimondo-navy tabular-nums">{euro(summe)}</p>
          </div>
        </div>

        <div className="space-y-1 text-body-sm">
          {positionen.map((p) => (
            <div key={p.label} className="flex justify-between gap-2">
              <span className="text-claimondo-ondo">{p.label}</span>
              <span className="text-claimondo-navy font-medium tabular-nums">{euro(p.betrag)}</span>
            </div>
          ))}
        </div>

        <p className="border-t border-claimondo-border pt-2 text-[11px] leading-relaxed text-claimondo-ondo">
          Sie haben Sie für die fiktive Abrechnung entschieden — die Auszahlung erfolgt auf
          Basis des Gutachtens (netto, ohne Mehrwertsteuer, da keine Reparaturrechnung; § 249 BGB),
          statt einer tatsächlichen Reparatur. Die endgültige Höhe legt die Versicherung fest.
        </p>
      </div>
    </SectionCard>
  )
}
