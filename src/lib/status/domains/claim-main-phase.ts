// src/lib/status/domains/claim-main-phase.ts
// Claim main-phase registry domain (v_claim_phase main_phase, 4 Hauptphasen).
// Gibt lifecycle.ts MAIN_PHASE_LABEL das zentrale Farb-Companion (Slot) und loest die
// inline PHASE_PILL_COLOR (MaklerAktenList) + PHASE_ACCENT (Kanzlei-Kanban) ab.
// Keyed by ClaimMainPhase -> der Compiler erzwingt Vollstaendigkeit. Label aus lifecycle (SSoT).
import type { StatusDef, StatusSlot } from '../types'
import { MAIN_PHASE_LABEL, type ClaimMainPhase } from '@/lib/claims/lifecycle'

// Semantische 4-Schritt-Pipeline statt der frueheren beliebigen (und zwischen den beiden
// Consumern widerspruechlichen) Tints: erfassung=Start/neutral (grau), begutachtung=aktive
// Arbeit (blau), regulierung=wartet auf Versicherer-Regulierung (pending/amber), abschluss=
// erledigt (gruen). 4 optisch distinkte Stufen -> Kanban-Spalten + Akten-Pillen bleiben auf
// einen Blick unterscheidbar (Design-Intent der urspruenglichen 4-Farb-PHASE_ACCENT-Map).
const SLOT: Record<ClaimMainPhase, StatusSlot> = {
  erfassung: 'neutral',
  begutachtung: 'active',
  regulierung: 'pending',
  abschluss: 'success',
}

export const CLAIM_MAIN_PHASE_DEFS: Record<ClaimMainPhase, StatusDef> = Object.fromEntries(
  (Object.keys(SLOT) as ClaimMainPhase[]).map((code) => [
    code,
    { label: MAIN_PHASE_LABEL[code], slot: SLOT[code] } satisfies StatusDef,
  ]),
) as Record<ClaimMainPhase, StatusDef>
