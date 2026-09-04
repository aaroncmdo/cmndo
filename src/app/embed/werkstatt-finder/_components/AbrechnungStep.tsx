'use client'

// F1 (Entry-Point-Audit 24.07.): Abrechnungsweg-Wahl im Werkstatt-Finder. Der Finder ist fuer
// Repair-Sucher — das ist Kasko (eigene VS) ODER Selbstzahler. Die Wahl setzt (via
// abrechnungZuLeadFelder) schuldfrage='eigenverantwortung' + eigene_versicherung, damit der /flow
// direkt das kasko/selbstzahler-Szenario matcht (statt den vollen Schuldfrage-Quali zu zeigen).
// Drei Wege (Aaron 04.08.): unverschuldet (Gegner haftet -> haftpflicht), Kasko, Selbstzahler.
// Vorher fehlte die Haftpflicht-Karte -> ein unverschuldeter Kunde musste sich falsch einordnen.
import { Scale, ShieldCheck, Wallet } from 'lucide-react'
import type { Abrechnungswahl } from './wizard-logic'
import { KaskoTarifFrage } from '@/components/self-service/KaskoTarifFrage'
import { Badge } from '@/components/primitives'
import type { KaskoWbWahl } from './wizard-logic'

const OPTIONEN: { wert: Abrechnungswahl; label: string; hint: string; icon: typeof ShieldCheck }[] = [
  {
    wert: 'haftpflicht',
    label: 'Unverschuldeter Unfall — der Gegner haftet',
    hint: 'Die gegnerische Haftpflicht übernimmt alles (§ 249 BGB): Gutachten, Reparatur, Wertminderung — für Sie kostenlos.',
    icon: Scale,
  },
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
  kaskoWb,
  onKaskoWb,
}: {
  abrechnung: Abrechnungswahl | null
  onChange: (w: Abrechnungswahl) => void
  kaskoWb: KaskoWbWahl | null
  onKaskoWb: (w: KaskoWbWahl | null) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-body font-bold text-claimondo-navy">Wer trägt die Reparaturkosten?</h3>
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
              onClick={() => { onChange(wert); if (wert !== 'kasko') onKaskoWb(null) }}
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

      {abrechnung === 'kasko' && !kaskoWb && (
        <div className="rounded-ios-lg border border-claimondo-border bg-white p-4">
          <KaskoTarifFrage kompakt onErgebnis={(auswahl, ergebnis) => onKaskoWb({ ...auswahl, ...ergebnis })} />
        </div>
      )}
      {abrechnung === 'kasko' && kaskoWb && (
        <div className="flex items-center justify-between gap-3 rounded-ios-lg border border-claimondo-border bg-white p-4">
          <span className="text-body-sm text-claimondo-navy">
            {[kaskoWb.markeName, kaskoWb.tarifName].filter(Boolean).join(' · ') || 'Kasko-Tarif'}
          </span>
          {kaskoWb.freieWerkstattwahl === true && <Badge tone="success" size="sm">freie Werkstattwahl</Badge>}
          {kaskoWb.freieWerkstattwahl === false && <Badge tone="warning" size="sm">Werkstattbindung</Badge>}
          {kaskoWb.freieWerkstattwahl === null && <Badge tone="info" size="sm">Bindung unklar</Badge>}
          <button type="button" className="text-caption text-claimondo-ondo underline" onClick={() => onKaskoWb(null)}>ändern</button>
        </div>
      )}
      {abrechnung === 'kasko' && kaskoWb?.freieWerkstattwahl === false && (
        <p className="text-body-sm text-warning-strong">
          Ihr Tarif enthält eine Werkstattbindung – Ihre Versicherung benennt die Werkstatt. Wir vermitteln deshalb keine
          Werkstatt; im nächsten Schritt können Sie einen Rückruf anfordern.
        </p>
      )}
    </div>
  )
}
