'use client'

// F1 (Entry-Point-Audit 24.07.): Abrechnungsweg-Wahl im Werkstatt-Finder. Der Finder ist fuer
// Repair-Sucher — das ist Kasko (eigene VS) ODER Selbstzahler. Die Wahl setzt (via
// abrechnungZuLeadFelder) schuldfrage='eigenverantwortung' + eigene_versicherung, damit der /flow
// direkt das kasko/selbstzahler-Szenario matcht (statt den vollen Schuldfrage-Quali zu zeigen).
// Wer einen Gegner-Unfall (Haftpflicht) hat, gehoert in den Gutachter-Finder -> dezenter Hinweis.
import { ShieldCheck, Wallet } from 'lucide-react'
import type { Abrechnungswahl } from './wizard-logic'

const OPTIONEN: { wert: Abrechnungswahl; label: string; hint: string; icon: typeof ShieldCheck }[] = [
  {
    wert: 'kasko',
    label: 'Über meine Kaskoversicherung',
    hint: 'Ihre eigene Kasko übernimmt die Reparatur (abzüglich Selbstbeteiligung).',
    icon: ShieldCheck,
  },
  {
    wert: 'selbstzahler',
    label: 'Ich zahle selbst',
    hint: 'Sie tragen die Reparaturkosten selbst — z. B. ohne Kasko oder bei kleinem Schaden.',
    icon: Wallet,
  },
]

export function AbrechnungStep({
  abrechnung,
  onChange,
}: {
  abrechnung: Abrechnungswahl | null
  onChange: (w: Abrechnungswahl) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-body font-bold text-claimondo-navy">Wie wird die Reparatur bezahlt?</h3>
        <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
          So bereiten wir die Abwicklung passend für Sie vor.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {OPTIONEN.map(({ wert, label, hint, icon: Icon }) => {
          const aktiv = abrechnung === wert
          return (
            <button
              key={wert}
              type="button"
              onClick={() => onChange(wert)}
              aria-pressed={aktiv}
              className={`flex items-start gap-3 rounded-ios-lg border p-4 text-left transition ${
                aktiv
                  ? 'border-claimondo-ondo bg-claimondo-ondo/[0.06] ring-1 ring-claimondo-ondo'
                  : 'border-claimondo-border bg-white hover:border-claimondo-ondo/50'
              }`}
            >
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-claimondo-navy/10 text-claimondo-navy">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-bold text-claimondo-navy">{label}</span>
                <span className="mt-0.5 block text-[0.8125rem] text-claimondo-ondo">{hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-[0.75rem] leading-relaxed text-claimondo-shield/70">
        Unverschuldeter Unfall mit einem Unfallgegner? Dann übernimmt die gegnerische Haftpflicht
        alles (§ 249 BGB) — dafür ist der{' '}
        <a href="/embed/gutachter-finder" className="font-semibold text-claimondo-ondo hover:underline">
          Gutachter-Finder
        </a>{' '}
        der richtige Weg.
      </p>
    </div>
  )
}
