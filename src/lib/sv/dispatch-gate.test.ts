import { describe, it, expect } from 'vitest'
import { svDarfFaelleEmpfangen, type SvDispatchGateFields } from './dispatch-gate'

const good: SvDispatchGateFields = {
  verifiziert: true,
  ist_aktiv: true,
  portal_zugang_freigeschaltet: true,
  ist_testaccount: false,
  gesperrt_seit: null,
  geloescht_am: null,
  verifizierung_status: 'geprueft',
}

describe('svDarfFaelleEmpfangen', () => {
  it('true when all dispatch clauses pass', () => {
    expect(svDarfFaelleEmpfangen(good)).toBe(true)
  })
  // DECISION 2026-09-19 (Aaron): `verifiziert` gatet die Sichtbarkeit NICHT mehr.
  // "Die Verifizierung ist ja keine notwendige Sache für den Finder … wenn die Admins
  // etwas freigeben möchten, ohne Berufshaftpflicht etc., dann sollen die
  // Sachverständigen auch auf der Karte angezeigt werden."
  // Gemessen am selben Tag auf prod: 13 freigegebene Gutachter waren unsichtbar.
  // Das Flag bleibt das nutzersichtbare Vertrauens-Siegel (Fallakte, Whitelabel) —
  // es entscheidet nur nicht mehr, WER Fälle bekommt.
  it('true even when not verified [decision 2026-09-19: Sichtbarkeit entkoppelt]', () => {
    expect(svDarfFaelleEmpfangen({ ...good, verifiziert: false, verifizierung_status: 'ausstehend' })).toBe(true)
    expect(svDarfFaelleEmpfangen({ ...good, verifiziert: null, verifizierung_status: null })).toBe(true)
  })
  it('false when not active', () => {
    expect(svDarfFaelleEmpfangen({ ...good, ist_aktiv: false })).toBe(false)
  })
  it('false when portal not unlocked', () => {
    expect(svDarfFaelleEmpfangen({ ...good, portal_zugang_freigeschaltet: false })).toBe(false)
  })
  it('false for test accounts (mirrors .eq(ist_testaccount,false): only false passes)', () => {
    expect(svDarfFaelleEmpfangen({ ...good, ist_testaccount: true })).toBe(false)
    expect(svDarfFaelleEmpfangen({ ...good, ist_testaccount: null })).toBe(false)
  })
  it('false when admin-blocked (gesperrt_seit set)', () => {
    expect(svDarfFaelleEmpfangen({ ...good, gesperrt_seit: '2026-07-01T00:00:00Z' })).toBe(false)
  })
  it('false when soft-deleted (geloescht_am set)', () => {
    expect(svDarfFaelleEmpfangen({ ...good, geloescht_am: '2026-07-01T00:00:00Z' })).toBe(false)
  })
  it('false for null / undefined input', () => {
    expect(svDarfFaelleEmpfangen(null)).toBe(false)
    expect(svDarfFaelleEmpfangen(undefined)).toBe(false)
  })
  // DECISION 2026-09-19 (Aaron) — überschreibt FG3-Task-3.0 (11.07., „decision A: ENFORCE")
  // und Option B (08.08., 14-Tage-Frist): „ich möchte auch nicht mehr nachhalten müssen, ob
  // die Dokumente fehlen oder nicht … wenn Dokumente fehlen, soll der Sachverständige trotzdem
  // angezeigt werden und sogar auch buchbar sein." Gemessen am selben Tag auf prod: 3 Gutachter
  // waren allein wegen `frist_ueberschritten` aus der Engine ausgeschlossen, 2 davon trugen
  // sogar `verifiziert=true`. Der Status bleibt als Information in der Spalte, entscheidet aber
  // nicht mehr, wer Fälle bekommt. Do NOT flip back without re-recording the decision.
  it('true for EVERY verifizierung_status — auch frist_ueberschritten [decision 2026-09-19: Frist zurückgenommen]', () => {
    expect(svDarfFaelleEmpfangen({ ...good, verifizierung_status: 'frist_ueberschritten' })).toBe(true)
    expect(svDarfFaelleEmpfangen({ ...good, verifizierung_status: 'ausstehend' })).toBe(true)
    expect(svDarfFaelleEmpfangen({ ...good, verifizierung_status: 'abgelehnt' })).toBe(true)
    expect(svDarfFaelleEmpfangen({ ...good, verifizierung_status: null })).toBe(true)
  })
})
