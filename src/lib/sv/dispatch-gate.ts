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
//
// ⚠ ZWEITE ENTSCHEIDUNG 2026-09-19 (Aaron, Nachmittag), sie ueberschreibt FG3-Task-3.0
// (11.07., „decision A: ENFORCE") und Option B (08.08., 14-Tage-Frist):
//   „ich moechte nicht mehr verifizieren und ich moechte auch nicht mehr nachhalten
//    muessen, ob die Dokumente fehlen oder nicht … wenn Dokumente fehlen, soll der
//    Sachverstaendige trotzdem angezeigt werden und sogar auch buchbar sein."
// `verifizierung_status = 'frist_ueberschritten'` blockt den Fall-Empfang NICHT mehr.
// Gemessen am selben Tag auf prod: 3 Gutachter waren allein deshalb aus der Engine
// ausgeschlossen, 2 davon trugen sogar `verifiziert=true`. Der Status bleibt als
// Information in der Spalte (Admin-Akte), wird aber nicht mehr geschrieben und
// entscheidet nichts mehr. Damit beschreiben die anon-Policy der Karte (sie hatte nie
// eine Frist-Klausel) und dieses Praedikat EXAKT dieselbe Menge.

/**
 * Fields the case-reception predicate reads — mirrors applyDispatchableFilter's columns.
 *
 * `verifiziert` und `verifizierung_status` bleiben optional im Typ, obwohl das Praedikat
 * beide seit dem 19.09. nicht mehr liest: die Aufrufer selektieren sie weiterhin, und ein
 * Entfernen wuerde nur ihre Selects umschreiben, ohne etwas zu gewinnen.
 */
export type SvDispatchGateFields = {
  verifiziert?: boolean | null
  ist_aktiv: boolean | null
  portal_zugang_freigeschaltet: boolean | null
  ist_testaccount: boolean | null
  gesperrt_seit: string | null
  geloescht_am: string | null
  verifizierung_status?: string | null
}

/**
 * Case-reception gate: a SV may RECEIVE new cases when technically active, portal-unlocked
 * (deposit paid or admin-released), not a test account, not admin-blocked, not soft-deleted.
 * Pure mirror of applyDispatchableFilter's SQL predicate so TS callers and the DB query agree.
 *
 * Weder `verifiziert` noch `verifizierung_status` werden geprueft (Aaron 19.09., siehe Kopf).
 */
export function svDarfFaelleEmpfangen(sv: SvDispatchGateFields | null | undefined): boolean {
  if (!sv) return false
  if (sv.ist_aktiv !== true) return false
  if (sv.portal_zugang_freigeschaltet !== true) return false
  if (sv.ist_testaccount !== false) return false
  if (sv.gesperrt_seit != null) return false
  if (sv.geloescht_am != null) return false
  return true
}
