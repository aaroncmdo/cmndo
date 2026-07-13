// FG3 — Case-reception gate (Fall-Empfangs-Gate).
// Pure TS mirror of applyDispatchableFilter's SQL predicate (src/lib/sv/queries.ts),
// so TS callers and the DB query agree on ONE definition of "may receive cases".
//
// Decision FG3-Task-3.0 (Aaron 2026-07-11): ENFORCE — a SV whose Tier-2 verification
// deadline has lapsed (verifizierung_status = 'frist_ueberschritten') receives NO new
// cases. NULL / 'ausstehend' / 'geprueft' all still receive cases (NULL-safe).

/**
 * The verifizierung_status value that blocks case-reception. Single source shared by
 * the SQL filter (applyDispatchableFilter's .or(...)) and this predicate + its tests.
 */
export const FRIST_UEBERSCHRITTEN = 'frist_ueberschritten'

/** Fields the case-reception predicate reads — mirrors applyDispatchableFilter's columns. */
export type SvDispatchGateFields = {
  verifiziert: boolean | null
  ist_aktiv: boolean | null
  portal_zugang_freigeschaltet: boolean | null
  ist_testaccount: boolean | null
  gesperrt_seit: string | null
  geloescht_am: string | null
  verifizierung_status: string | null
}

/**
 * Case-reception gate: a SV may RECEIVE new cases only when verified, technically active,
 * portal-unlocked (deposit paid), not a test account, not admin-blocked, not soft-deleted
 * — and (per decision FG3-Task-3.0) not 'frist_ueberschritten'. Pure mirror of
 * applyDispatchableFilter's SQL predicate so TS callers and the DB query agree.
 */
export function svDarfFaelleEmpfangen(sv: SvDispatchGateFields | null | undefined): boolean {
  if (!sv) return false
  if (sv.verifiziert !== true) return false
  if (sv.ist_aktiv !== true) return false
  if (sv.portal_zugang_freigeschaltet !== true) return false
  if (sv.ist_testaccount !== false) return false
  if (sv.gesperrt_seit != null) return false
  if (sv.geloescht_am != null) return false
  if (sv.verifizierung_status === FRIST_UEBERSCHRITTEN) return false
  return true
}
