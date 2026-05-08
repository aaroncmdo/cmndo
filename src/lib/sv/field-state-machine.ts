// AAR-380: Field-Modus State-Machine.
//
// Alle Transitions gehen AUSSCHLIESSLICH durch `transition()`. Direkte
// Updates von `sv_tages_session.status` sind verboten — sonst brechen
// Invarianten (z. B. `started_at` beim ersten en_route, `completed_at`
// beim finished, `paused_at` beim paused).

import type { SessionStatus, SvTagesSession } from '@/lib/types/field-modus'

/** Erlaubte Transitionen. Alles was nicht hier steht, wirft. */
export const ALLOWED_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  idle: ['en_route', 'paused'],
  // Aus en_route kann auch zurück zu idle gewechselt werden (Reset bei Fehlstart).
  en_route: ['arrived', 'paused', 'idle'],
  // Aus arrived: weiter zum Abschluss, zurück zu en_route (falsche Ankunft),
  // oder pausieren (Aaron 2026-05-08: Fokus-Modus-Exit aus SvFallakteView).
  arrived: ['completing', 'en_route', 'paused'],
  // Aus completing entweder weiter zum nächsten Stop (en_route), fertig,
  // oder pausieren (UI-Exit während Abschluss).
  completing: ['en_route', 'finished', 'paused'],
  finished: [],
  // Aus paused kann in den vorigen aktiven State zurückgekehrt werden.
  paused: ['idle', 'en_route', 'arrived'],
}

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Berechnet die Feld-Updates für eine Transition. Setzt Timestamps
 * und bereinigt obsolete Felder. Der Caller persistiert das Ergebnis.
 *
 * @throws wenn Transition nicht erlaubt.
 */
export function computeTransitionPatch(
  from: SessionStatus,
  to: SessionStatus,
): Partial<SvTagesSession> {
  if (!canTransition(from, to)) {
    throw new Error(`AAR-380: Transition ${from} → ${to} nicht erlaubt`)
  }

  const now = new Date().toISOString()
  const patch: Partial<SvTagesSession> = { status: to }

  // Erste Aktivierung: started_at setzen
  if (from === 'idle' && to === 'en_route') {
    patch.started_at = now
  }

  // Pausiert: paused_at setzen
  if (to === 'paused') {
    patch.paused_at = now
  }

  // Fortgesetzt: paused_at zurück auf null
  if (from === 'paused' && to !== 'paused') {
    patch.paused_at = null
  }

  // Fertig: completed_at setzen
  if (to === 'finished') {
    patch.completed_at = now
  }

  return patch
}
