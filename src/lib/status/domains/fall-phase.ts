// src/lib/status/domains/fall-phase.ts
// Claim subphase registry domain. Gives lifecycle.ts SUBPHASE_LABEL the color
// companion it never had. Keyed by ClaimSubPhase -> compiler enforces coverage.
import type { StatusDef, StatusSlot } from '../types'
import { SUBPHASE_LABEL, type ClaimSubPhase } from '@/lib/claims/lifecycle'

const SLOT: Record<ClaimSubPhase, StatusSlot> = {
  sa_offen: 'pending',
  vollmacht_offen: 'pending',
  onboarding_offen: 'pending',
  termin: 'pending',
  besichtigung: 'active',
  gutachten: 'active',
  filmcheck: 'active',
  'qc-pruefung': 'active',
  kanzlei_uebergabe: 'active',
  versicherungskontakt: 'pending',
  auszahlung: 'active',
  nachforderung: 'warning',
  'vs-kuerzt': 'warning',
  anschlussschreiben: 'active',
  'nachbesichtigung-laeuft': 'active',
  erfolgreich_reguliert: 'success',
  storniert: 'danger',
  klage_rechtsstreit: 'warning',
  verjaehrt: 'neutral',
  abgelehnt_final: 'danger',
  an_externe_kanzlei: 'done',
  termin_durchgefuehrt: 'done',
}

export const FALL_PHASE_DEFS: Record<ClaimSubPhase, StatusDef> = Object.fromEntries(
  (Object.keys(SLOT) as ClaimSubPhase[]).map((code) => [
    code,
    { label: SUBPHASE_LABEL[code], slot: SLOT[code] } satisfies StatusDef,
  ]),
) as Record<ClaimSubPhase, StatusDef>
