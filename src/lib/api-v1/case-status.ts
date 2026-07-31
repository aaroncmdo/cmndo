import { isKnownStatus, statusLabel } from '@/lib/status/resolve'

// Grober, kunden-facing Fall-Status fuer die oeffentliche case-status-API (MCP/GPT-Action).
//
// PII-FREI by design: liefert NUR ein kunden-taugliches Status-Label (via
// statusLabel(..,'kunde')) — NIE Name/Telefon/SV/Fall-Detail und NIE den rohen
// operative_status-Code (interne Taxonomie). Ein unbekannter/fehlender Status (z.B. Lead
// noch nicht in einen Claim konvertiert, oder ein Code den die Registry nicht kennt)
// faellt auf einen freundlichen Sammel-Status zurueck — kein Roh-Code-Leak.
export const CASE_STATUS_FALLBACK = 'Deine Anfrage ist eingegangen und wird bearbeitet.'

export function coarseKundeStatus(operativeStatus: string | null | undefined): string {
  if (operativeStatus && isKnownStatus('claims-status', operativeStatus)) {
    return statusLabel('claims-status', operativeStatus, 'kunde')
  }
  return CASE_STATUS_FALLBACK
}
