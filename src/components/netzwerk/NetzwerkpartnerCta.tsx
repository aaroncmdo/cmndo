'use client'

// P5 T8/T9: Geteilte Netzwerkpartner-Upgrade-CTA — Onboarding-Ask (skippbar) +
// Einstellungen-Sektion nutzen dieselbe Karte (DRY). Preise kommen formatiert vom
// Server (Config-getrieben, nie hardcoded). Primitives-Layer (Component-Set-Policy).

import { Card, Button } from '@/components/primitives'

export function NetzwerkpartnerCta({
  monatEuro,
  setupEuro,
  onUpgrade,
  onSkip,
  loading = false,
}: {
  /** Formatierter Monatspreis, z.B. "29,99 €" (aus ladeNetzwerkPreise, server-seitig formatiert). */
  monatEuro: string
  /** Formatierte Einrichtungsgebühr, z.B. "39,90 €" — leerer String = Waiver (wird ausgeblendet). */
  setupEuro: string
  onUpgrade: () => void
  /** Ohne onSkip (Einstellungen-Kontext) wird kein Später-Button gezeigt. */
  onSkip?: () => void
  loading?: boolean
}) {
  return (
    <Card className="space-y-4">
      <div>
        <p className="text-body-xs uppercase tracking-wider text-claimondo-shield font-semibold">
          Netzwerkpartner
        </p>
        <h3 className="text-heading-sm text-claimondo-navy mt-1">
          Werde Teil des Claimondo-Netzwerks
        </h3>
        <p className="text-sm text-claimondo-ondo mt-2">
          Als Netzwerkpartner erscheinen Sie bevorzugt im Gutachter-Finder Ihrer gebundenen
          Kunden, Ihre Partner-Werkstätten stehen oben im „Ihr Netzwerk"-Bereich — und Ihr
          eigenes Branding (Logo &amp; Farben) geht für Ihre Kunden live.
        </p>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-heading-md text-claimondo-navy font-semibold">{monatEuro}</span>
        <span className="text-sm text-claimondo-shield">/ Monat</span>
        {setupEuro ? (
          <span className="text-body-xs text-claimondo-shield">
            + {setupEuro} einmalige Einrichtung
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ondo" onClick={onUpgrade} loading={loading}>
          Netzwerkpartner werden
        </Button>
        {onSkip ? (
          <Button variant="ghost" onClick={onSkip} disabled={loading}>
            Später entscheiden
          </Button>
        ) : null}
      </div>
      <p className="text-body-xs text-claimondo-shield">
        Monatlich kündbar — die Kündigung wirkt zum Ende des laufenden Abrechnungsmonats.
      </p>
    </Card>
  )
}
