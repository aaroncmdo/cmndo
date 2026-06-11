import { describe, it, expect } from 'vitest'
import { resolveFlowTerminState, type FlowTerminInput, type FlowTerminState } from '../flow-resolver'

// AAR-956 §4: Resolver-State-Machine fuer den kanonischen /flow.
// Reine Entscheidungs-Funktion (kein I/O) — sie sagt NUR welcher Zustand,
// die matchAndSlots/findBestSV-Quelle bleibt unberuehrt (keine dritte Quelle).

// Minimal-Basis: termin-loser, nicht-disqualifizierter Lead mit Ort.
const base: FlowTerminInput = {
  hatTerminMitSv: false,
  fixerSvId: null,
  besichtigungsLat: 51.0,
  besichtigungsLng: 7.0,
  disqualifiziert: false,
}

describe('resolveFlowTerminState (AAR-956 §4 Resolver)', () => {
  it('disqualifizierter Lead → disqualifiziert (Kasko-Endansicht)', () => {
    expect(resolveFlowTerminState({ ...base, disqualifiziert: true }).kind).toBe('disqualifiziert')
  })

  it('SV + Termin gesetzt → zeige_termin (kein Resolver, kein "wir suchen") [§4.1]', () => {
    expect(resolveFlowTerminState({ ...base, hatTerminMitSv: true }).kind).toBe('zeige_termin')
  })

  it('Fixer (Monika) gesetzt, kein Termin, Ort da → buchen_fixer mit fixerSvId [§4.2/§4.4]', () => {
    const s = resolveFlowTerminState({ ...base, fixerSvId: 'sv-monika' })
    expect(s.kind).toBe('buchen_fixer')
    if (s.kind === 'buchen_fixer') expect(s.fixerSvId).toBe('sv-monika')
  })

  it('weder SV noch Termin, Ort da → buchen_global [§4.3 da]', () => {
    expect(resolveFlowTerminState(base).kind).toBe('buchen_global')
  })

  it('weder SV noch Termin, Ort fehlt → ort_abfragen (NICHT telefonisch-passiv) [§4.3 fehlt / Task 3]', () => {
    expect(
      resolveFlowTerminState({ ...base, besichtigungsLat: null, besichtigungsLng: null }).kind,
    ).toBe('ort_abfragen')
  })

  it('Fixer gesetzt aber Ort fehlt → ort_abfragen (Ort-Gate vor Buchung, auch fuer Monika)', () => {
    expect(
      resolveFlowTerminState({ ...base, fixerSvId: 'sv-monika', besichtigungsLat: null, besichtigungsLng: null }).kind,
    ).toBe('ort_abfragen')
  })

  it('Termin vorhanden ueberstimmt fehlenden Ort → zeige_termin (Termin war schon gebucht)', () => {
    expect(
      resolveFlowTerminState({ ...base, hatTerminMitSv: true, besichtigungsLat: null, besichtigungsLng: null }).kind,
    ).toBe('zeige_termin')
  })

  // Task 1 — Kernzusicherung: ein termin-loser, nicht-disqualifizierter Lead
  // landet NIE in einem passiven "wir suchen / wir melden uns"-Wartezustand.
  // Jede Kombination ergibt einen AKTIVEN Zustand (buchen oder Ort abfragen).
  it('Task 1: kein termin-loser Lead ergibt je einen Passiv-Zustand — immer aktiv', () => {
    const aktiv = new Set(['buchen_fixer', 'buchen_global', 'ort_abfragen'])
    for (const fixerSvId of [null, 'sv-x']) {
      for (const ort of [
        { besichtigungsLat: 51.0, besichtigungsLng: 7.0 },
        { besichtigungsLat: null, besichtigungsLng: null },
      ]) {
        const s = resolveFlowTerminState({ ...base, fixerSvId, ...ort })
        expect(aktiv.has(s.kind)).toBe(true)
      }
    }
  })

  // Explizite 2x2-Matrix "SV gesetzt x Termin gesetzt" (Ort vorhanden, nicht disqualifiziert).
  // "SV gesetzt" = fixerSvId (Monika/Dispatcher-Pick); "Termin gesetzt" = hatTerminMitSv
  // (page.tsx terminMitSv, bezug-aware seit #2636). hatTerminMitSv=true ueberstimmt
  // fixerSvId IMMER (Termin gewinnt, §4.1) — auch wenn beide gesetzt sind.
  it('Matrix SVxTermin: Termin gewinnt (zeige_termin); sonst SV->fixer / kein-SV->global', () => {
    const matrix: Array<{ fixerSvId: string | null; hatTerminMitSv: boolean; erwartet: FlowTerminState['kind'] }> = [
      { fixerSvId: 'sv-x', hatTerminMitSv: true, erwartet: 'zeige_termin' }, // SV + Termin
      { fixerSvId: null, hatTerminMitSv: true, erwartet: 'zeige_termin' }, // kein SV + Termin (Termin gewinnt)
      { fixerSvId: 'sv-x', hatTerminMitSv: false, erwartet: 'buchen_fixer' }, // SV + kein Termin
      { fixerSvId: null, hatTerminMitSv: false, erwartet: 'buchen_global' }, // kein SV + kein Termin
    ]
    for (const { fixerSvId, hatTerminMitSv, erwartet } of matrix) {
      expect(resolveFlowTerminState({ ...base, fixerSvId, hatTerminMitSv }).kind).toBe(erwartet)
    }
  })
})
