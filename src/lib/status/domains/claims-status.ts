// src/lib/status/domains/claims-status.ts
// claims.status registry domain. Owns its 11 entries directly to stay
// lucide-free (importing status-mappings.ts would pull lucide into lib/status).
// Mirrors src/components/shared/claims/status-mappings.ts CLAIM_STATUS.
import type { StatusDef } from '../types'

export const CLAIMS_STATUS_DEFS: Record<string, StatusDef> = {
  dispatch_done:        { label: 'Neu', labelByRole: { kunde: 'Neu eingegangen' }, slot: 'active', iconKey: 'play-circle', isEndzustand: false },
  in_bearbeitung:       { label: 'In Bearbeitung', slot: 'active', iconKey: 'user-check', isEndzustand: false },
  in_kommunikation_vs:  { label: 'Kommunikation mit VS', labelByRole: { kunde: 'Wir verhandeln mit der Versicherung' }, slot: 'active', iconKey: 'phone-call', isEndzustand: false },
  reguliert:            { label: 'Reguliert', slot: 'success', iconKey: 'check-circle', isEndzustand: true },
  reguliert_vollstaendig: { label: 'Erfolgreich reguliert', slot: 'success', iconKey: 'check-circle', isEndzustand: true },
  abgelehnt:            { label: 'VS-Ablehnung (Nachforderung)', labelByRole: { kunde: 'Versicherung hat abgelehnt' }, slot: 'warning', iconKey: 'x-circle', isEndzustand: false },
  abgelehnt_final:      { label: 'Abgelehnt (final)', labelByRole: { kunde: 'Abgelehnt' }, slot: 'danger', iconKey: 'x-circle', isEndzustand: true },
  klage_rechtsstreit:   { label: 'Klage / Rechtsstreit', labelByRole: { kunde: 'Im Rechtsstreit' }, slot: 'warning', iconKey: 'scale', isEndzustand: true },
  verjaehrt:            { label: 'Verjährt', slot: 'neutral', iconKey: 'clock', isEndzustand: true },
  an_externe_kanzlei_uebergeben: { label: 'An externe Kanzlei', labelByRole: { kunde: 'An Ihre Kanzlei übergeben' }, slot: 'done', iconKey: 'scale', isEndzustand: true },
  storniert:            { label: 'Storniert', labelByRole: { kunde: 'Gestoppt' }, slot: 'neutral', iconKey: 'pause-circle', isEndzustand: true },
  // AAR-939: embed-B/nur_gutachter Terminal (von close-nur-gutachter-termin.ts geschrieben).
  termin_durchgefuehrt: { label: 'Termin durchgeführt', slot: 'success', iconKey: 'check-circle', isEndzustand: true },
}
