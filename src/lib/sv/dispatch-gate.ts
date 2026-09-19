// FG3 — Case-reception gate (Fall-Empfangs-Gate).
// Pure TS mirror of applyDispatchableFilter's SQL predicate (src/lib/sv/queries.ts),
// so TS callers and the DB query agree on ONE definition of "may receive cases".
//
// Decision FG3-Task-3.0 (Aaron 2026-07-11): ENFORCE — a SV whose Tier-2 verification
// deadline has lapsed (verifizierung_status = 'frist_ueberschritten') receives NO new
// cases. NULL / 'ausstehend' / 'geprueft' all still receive cases (NULL-safe).
//
// ⚠ ENTSCHEIDUNG 2026-09-19 (Aaron), sie ueberschreibt einen Teil der aelteren:
// `verifiziert` gatet die Sichtbarkeit und die Fall-Vergabe NICHT mehr.
//   „Die Verifizierung ist ja keine notwendige Sache fuer den Finder … wenn die Admins
//    etwas freigeben moechten, ohne Berufshaftpflicht etc., das ist nicht zwingend
//    notwendig … dann sollen die Sachverstaendigen auch auf der Karte angezeigt werden."
// Gemessen am selben Tag auf prod: von 27 freigeschalteten Gutachtern waren nur 13 im
// Finder sichtbar. Die 14 anderen hatten bezahlt oder waren bewusst freigegeben — sie
// scheiterten allein an diesem Flag, das seit dem Tier-2-Fix (08.08.) an zwei
// hochgeladenen Dokumenten haengt.
//
// Was `verifiziert` WEITERHIN steuert, unveraendert: das gruene Vertrauens-Siegel in
// der Kunden-Fallakte (components/kunde/claim-view/TeamZone.tsx) und das Whitelabel-Gate
// (lib/branding/gate.ts). Sichtbarkeit und Vertrauen sind zwei verschiedene Aussagen —
// genau deshalb wird hier nur die erste entkoppelt.
//
// Der Schutz des Pools haengt damit an den Feldern, die ihn wirklich tragen:
// portal_zugang_freigeschaltet (bezahlt ODER vom Admin freigegeben), ist_aktiv,
// gesperrt_seit (der Admin-Riegel) und geloescht_am.

/**
 * The verifizierung_status value that blocks case-reception. Single source shared by
 * the SQL filter (applyDispatchableFilter's .or(...)) and this predicate + its tests.
 */
export const FRIST_UEBERSCHRITTEN = 'frist_ueberschritten'

/**
 * Fields the case-reception predicate reads — mirrors applyDispatchableFilter's columns.
 *
 * `verifiziert` bleibt im Typ, obwohl das Praedikat es seit dem 19.09. nicht mehr liest:
 * die Aufrufer selektieren es weiterhin, und ein Entfernen wuerde nur ihre Selects
 * umschreiben, ohne etwas zu gewinnen. Optional, damit neue Aufrufer es weglassen duerfen.
 */
export type SvDispatchGateFields = {
  verifiziert?: boolean | null
  ist_aktiv: boolean | null
  portal_zugang_freigeschaltet: boolean | null
  ist_testaccount: boolean | null
  gesperrt_seit: string | null
  geloescht_am: string | null
  verifizierung_status: string | null
}

/**
 * Case-reception gate: a SV may RECEIVE new cases when technically active, portal-unlocked
 * (deposit paid or admin-released), not a test account, not admin-blocked, not soft-deleted
 * — and (per decision FG3-Task-3.0) not 'frist_ueberschritten'. Pure mirror of
 * applyDispatchableFilter's SQL predicate so TS callers and the DB query agree.
 *
 * `verifiziert` wird seit dem 19.09. NICHT mehr geprueft (Aaron-Entscheidung, siehe Kopf).
 */
export function svDarfFaelleEmpfangen(sv: SvDispatchGateFields | null | undefined): boolean {
  if (!sv) return false
  if (sv.ist_aktiv !== true) return false
  if (sv.portal_zugang_freigeschaltet !== true) return false
  if (sv.ist_testaccount !== false) return false
  if (sv.gesperrt_seit != null) return false
  if (sv.geloescht_am != null) return false
  if (sv.verifizierung_status === FRIST_UEBERSCHRITTEN) return false
  return true
}
