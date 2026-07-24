// FlowLink-Review C (Aaron 24.07.): kompaktes Szenario-Badge fuer die "fiktive
// Abrechnung" (reparaturwunsch === 'fiktiv'). Markiert operativ, dass der Claim
// NICHT ueber Kostenvoranschlag/Schlussrechnung abgerechnet wird, sondern fiktiv
// (Auszahlung auf Gutachten-Basis, § 249 BGB). Wichtig: die Werkstatt-Vermittlung
// wird trotzdem angeboten (brauchtWerkstattVermittlung inkludiert 'fiktiv') — der
// Kunde kann guenstiger reparieren + die Differenz behalten. Das Badge ersetzt
// keine Werkstatt-Offerte, es macht nur das Szenario sichtbar.
//
// Reuse StatusBadge (tone-Modus, sanktionierter info-Slot) — kein neuer Farb-Map,
// status-registry-safe. Rendert null wenn nicht fiktiv, damit Caller es bedingungslos
// einhaengen koennen: <FiktivAbrechnungBadge reparaturwunsch={x} />.
import { StatusBadge } from '@/components/shared/StatusBadge'

export function FiktivAbrechnungBadge({
  reparaturwunsch,
  size = 'xs',
}: {
  reparaturwunsch: string | null | undefined
  size?: 'xs' | 'sm'
}) {
  if (reparaturwunsch !== 'fiktiv') return null
  return (
    <StatusBadge tone="info" size={size}>
      Fiktive Abrechnung
    </StatusBadge>
  )
}
