// src/lib/status/domains/fall-status.ts
// faelle.status registry domain. Label+short imported from the legacy map
// (single source until the cleanup wave); slot mapping owned here.
import type { StatusDef, StatusSlot } from '../types'
import { FALL_STATUS_LABELS, FALL_STATUS_LABELS_SHORT } from '@/lib/statusLabels'

const SLOT: Record<string, StatusSlot> = {
  ersterfassung: 'neutral',
  'flow-gesendet': 'active',
  onboarding: 'neutral',
  erstgespraech: 'active',
  'sv-gesucht': 'active',
  'termin-reserviert': 'pending',
  'besichtigung-laeuft': 'active',
  'gutachten-bearbeitung': 'active',
  'gutachten-erstellt': 'done',
  'akte-uebergeben': 'active',
  'as-vorbereitung': 'active',
  'as-versendet': 'active',
  'warten-auf-vs': 'pending',
  'vs-kuerzt': 'warning',
  'vs-reguliert': 'success',
  klage: 'danger',
  'sv-zugewiesen': 'active',
  'sv-termin': 'pending',
  besichtigung: 'active',
  'begutachtung-laeuft': 'active',
  'gutachten-eingegangen': 'done',
  filmcheck: 'active',
  'qc-pruefung': 'active',
  'kanzlei-uebergeben': 'active',
  anschlussschreiben: 'active',
  'as-gesendet': 'active',
  regulierung: 'success',
  'regulierung-laeuft': 'success',
  'nachbesichtigung-laeuft': 'active',
  'vs-regulierung': 'success',
  'vs-abgelehnt': 'danger',
  'zahlung-eingegangen': 'success',
  abgeschlossen: 'success',
  storniert: 'danger',
  in_bearbeitung: 'pending',
  vs_kontakt: 'pending',
  reguliert: 'success',
  abgelehnt: 'danger',
  kanzlei: 'active',
}

export const FALL_STATUS_DEFS: Record<string, StatusDef> = Object.fromEntries(
  Object.keys(FALL_STATUS_LABELS).map((code) => [
    code,
    {
      label: FALL_STATUS_LABELS[code],
      short: FALL_STATUS_LABELS_SHORT[code],
      slot: SLOT[code] ?? 'neutral',
    } satisfies StatusDef,
  ]),
)
