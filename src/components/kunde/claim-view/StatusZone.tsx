// P1 (Kunde-Detail-Rebuild): StatusZone — kompakter Status-Streifen (immer sichtbar).
// Phase + „was passiert als Nächstes" + der SV-Begutachtungstermin (falls vorhanden).
// Ersetzt den alten ClaimStepper-Hero + den inline-color-KundeSvLiveBanner (token-sauber).
// „Live" ohne eigene Subscription: das bestehende FallRealtimeRefresh in page.tsx
// revalidiert bei gutachter_termine-Änderungen → diese Server-Komponente rendert frisch.

import { Card } from '@/components/primitives'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { MAIN_PHASE_LABEL, SUBPHASE_LABEL, type ClaimMainPhase } from '@/lib/claims/lifecycle'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'

// Kundengerechte „nächster Schritt"-Kopie je Hauptphase.
const NAECHSTER_SCHRITT: Record<ClaimMainPhase, string> = {
  erfassung: 'Bitte vervollständige deine Angaben, damit es weitergeht.',
  begutachtung: 'Dein Gutachter erstellt das Gutachten für deinen Schaden.',
  regulierung: 'Wir kümmern uns um die Regulierung mit der Versicherung.',
  abschluss: 'Dein Fall ist abgeschlossen.',
}

export function StatusZone({ vm }: { vm: KundeClaimViewModel }) {
  const mainPhase = vm.lifecycle.mainPhase
  const phaseLabel = MAIN_PHASE_LABEL[mainPhase]
  const subLabel = SUBPHASE_LABEL[vm.lifecycle.subPhase]
  const svTermin = vm.termine.find((t) => t.art === 'sv' && t.start)

  return (
    <Card p={4} className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge tone="ondo" size="sm">{phaseLabel}</StatusBadge>
        {subLabel && <span className="text-body-sm text-claimondo-ondo">{subLabel}</span>}
      </div>
      <p className="text-body-sm text-claimondo-navy">{NAECHSTER_SCHRITT[mainPhase]}</p>
      {svTermin?.start && (
        <p className="text-body-xs text-claimondo-ondo">
          Begutachtungstermin:{' '}
          {formatBerlin(svTermin.start, {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          Uhr
          {svTermin.status === 'bestaetigt' ? ' · bestätigt' : ''}
        </p>
      )}
    </Card>
  )
}
