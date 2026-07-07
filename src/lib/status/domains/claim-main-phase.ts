// src/lib/status/domains/claim-main-phase.ts
// Claim main-phase registry domain (v_claim_phase main_phase, 4 Hauptphasen).
// Gibt lifecycle.ts MAIN_PHASE_LABEL das zentrale Farb-Companion (Slot) und loest die
// inline PHASE_PILL_COLOR (MaklerAktenList) + PHASE_ACCENT (Kanzlei-Kanban) ab.
// Keyed by ClaimMainPhase -> der Compiler erzwingt Vollstaendigkeit. Label aus lifecycle (SSoT).
import type { StatusDef, StatusSlot } from '../types'
import { MAIN_PHASE_LABEL, type ClaimMainPhase } from '@/lib/claims/lifecycle'

// Semantische Slots (nicht die frueheren beliebigen Tints): erfassung=Start/neutral,
// begutachtung+regulierung=aktive Arbeitsphasen, abschluss=erledigt (gruen, wie vorher).
const SLOT: Record<ClaimMainPhase, StatusSlot> = {
  erfassung: 'neutral',
  begutachtung: 'active',
  regulierung: 'active',
  abschluss: 'success',
}

export const CLAIM_MAIN_PHASE_DEFS: Record<ClaimMainPhase, StatusDef> = Object.fromEntries(
  (Object.keys(SLOT) as ClaimMainPhase[]).map((code) => [
    code,
    { label: MAIN_PHASE_LABEL[code], slot: SLOT[code] } satisfies StatusDef,
  ]),
) as Record<ClaimMainPhase, StatusDef>
