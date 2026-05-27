// AAR-566 (B3): Tests für Visibility-Matrix.

import { describe, expect, it } from 'vitest'
import {
  SUBPHASE_VISIBILITY,
  PHASE_META,
  buildPhasePipelineData,
  buildClaimPhasePipeline,
  getSubphaseVisibilityForRolle,
} from './subphase-visibility'
import type { Rolle } from '@/components/shared/fall-phases/types'
import { mainPhaseOf, type ClaimLifecycle, type ClaimMainPhase, type ClaimSubPhase } from '@/lib/claims/lifecycle'

const ALL_ROLLES: Rolle[] = ['admin', 'kb', 'sv', 'kunde', 'makler']

describe('SUBPHASE_VISIBILITY Konstante', () => {
  it('deckt alle 52 Subphasen aus dem Notion-CHECK-Constraint ab', () => {
    expect(Object.keys(SUBPHASE_VISIBILITY).length).toBe(52)
  })

  it('jede Subphase definiert alle 5 Rollen', () => {
    for (const [id, rule] of Object.entries(SUBPHASE_VISIBILITY)) {
      for (const rolle of ALL_ROLLES) {
        expect(rule.rollen[rolle], `${id} fehlt für Rolle ${rolle}`).toBeDefined()
      }
    }
  })

  it('jede Subphase gehört zu einer gültigen Phase 1-10', () => {
    for (const [id, rule] of Object.entries(SUBPHASE_VISIBILITY)) {
      expect(rule.phase, `${id} hat ungültige Phase ${rule.phase}`).toBeGreaterThanOrEqual(1)
      expect(rule.phase, `${id} hat ungültige Phase ${rule.phase}`).toBeLessThanOrEqual(10)
      expect(PHASE_META[rule.phase]).toBeDefined()
    }
  })
})

describe('getSubphaseVisibilityForRolle', () => {
  it('Admin sieht alle Subphasen', () => {
    for (const id of Object.keys(SUBPHASE_VISIBILITY)) {
      expect(getSubphaseVisibilityForRolle(id, 'admin').visible).toBe(true)
    }
  })

  it('KB sieht alle Subphasen (Parallel zur Admin-Sicht)', () => {
    for (const id of Object.keys(SUBPHASE_VISIBILITY)) {
      expect(getSubphaseVisibilityForRolle(id, 'kb').visible).toBe(true)
    }
  })

  it('SV sieht Phase-1-Terminbestätigung, aber nicht alle internen Kanzlei-Schritte', () => {
    expect(getSubphaseVisibilityForRolle('termin_bestaetigt', 'sv').visible).toBe(true)
    expect(getSubphaseVisibilityForRolle('fallakte_wird_uebergeben', 'sv').visible).toBe(false)
    expect(getSubphaseVisibilityForRolle('vs_kontakt_laeuft', 'sv').visible).toBe(false)
  })

  it('Kunde sieht Haupt-Phasen mit freundlichem Label-Override', () => {
    const r = getSubphaseVisibilityForRolle('fallakte_angelegt', 'kunde')
    expect(r.visible).toBe(true)
    expect(r.labelOverride).toBe('Schaden gemeldet')
  })

  it('Kunde sieht keine internen Kanzlei-Details (technische Stellungnahme + VS-Eskalation)', () => {
    expect(getSubphaseVisibilityForRolle('technische_stellungnahme_angefordert', 'kunde').visible).toBe(false)
    expect(getSubphaseVisibilityForRolle('technische_stellungnahme_hochgeladen', 'kunde').visible).toBe(false)
    expect(getSubphaseVisibilityForRolle('vs_kontakt_laeuft', 'kunde').visible).toBe(false)
    expect(getSubphaseVisibilityForRolle('qc_nicht_bestanden', 'kunde').visible).toBe(false)
  })

  it('SV sieht technische Stellungnahme (er muss sie ja hochladen)', () => {
    const r = getSubphaseVisibilityForRolle('technische_stellungnahme_angefordert', 'sv')
    expect(r.visible).toBe(true)
    expect(r.labelOverride).toBe('Stellungnahme angefordert — bitte hochladen')
  })

  it('Makler sieht Main-Path in Kunde-freundlicher Sprache', () => {
    const r = getSubphaseVisibilityForRolle('anschlussschreiben_versendet', 'makler')
    expect(r.visible).toBe(true)
  })

  it('unbekannte Subphase → alle Rollen hidden', () => {
    for (const rolle of ALL_ROLLES) {
      expect(getSubphaseVisibilityForRolle('unbekannt_xyz', rolle).visible).toBe(false)
    }
  })
})

describe('buildPhasePipelineData', () => {
  it('liefert exakt 10 Phasen in fester Reihenfolge', () => {
    const data = buildPhasePipelineData(
      { id: 'f1', aktuelle_phase: null },
      'admin',
    )
    expect(data.length).toBe(10)
    expect(data.map((p) => p.phase)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('markiert die aktuelle Subphase als active und alle vorherigen Phasen als done', () => {
    const data = buildPhasePipelineData(
      { id: 'f1', aktuelle_phase: 'warten_auf_vs' }, // Phase 5
      'admin',
    )
    const phase1 = data.find((p) => p.phase === 1)!
    const phase5 = data.find((p) => p.phase === 5)!
    const phase6 = data.find((p) => p.phase === 6)!
    expect(phase1.state).toBe('done')
    expect(phase5.state).toBe('active')
    expect(phase6.state).toBe('upcoming')
  })

  it('filtert Subphasen-Visibility per Rolle', () => {
    const adminData = buildPhasePipelineData(
      { id: 'f1', aktuelle_phase: 'ruege_1_versandt' },
      'admin',
    )
    const kundeData = buildPhasePipelineData(
      { id: 'f1', aktuelle_phase: 'ruege_1_versandt' },
      'kunde',
    )
    const adminPhase6 = adminData.find((p) => p.phase === 6)!
    const kundePhase6 = kundeData.find((p) => p.phase === 6)!
    // Admin sieht alle Subphasen sichtbar, Kunde bestimmte nicht (technische_stellungnahme_*)
    const adminSichtbar = adminPhase6.subphases!.filter((s) => s.visible).length
    const kundeSichtbar = kundePhase6.subphases!.filter((s) => s.visible).length
    expect(adminSichtbar).toBeGreaterThan(kundeSichtbar)
  })

  it('setzt Phase 10 auf done wenn fall.abgeschlossen_am gesetzt ist', () => {
    const data = buildPhasePipelineData(
      {
        id: 'f1',
        aktuelle_phase: 'auszahlungen_verteilt',
        abgeschlossen_am: '2026-04-19T12:00:00Z',
      },
      'admin',
    )
    const phase10 = data.find((p) => p.phase === 10)!
    expect(phase10.state).toBe('done')
  })

  it('verwendet reached-Timeline für pünktlichere Done-Markierung', () => {
    const data = buildPhasePipelineData(
      {
        id: 'f1',
        aktuelle_phase: 'warten_auf_vs',
        reached: [
          { subphase: 'fallakte_angelegt', at: '2026-04-01T10:00:00Z' },
          { subphase: 'termin_bestaetigt', at: '2026-04-01T11:00:00Z' },
          { subphase: 'anschlussschreiben_versendet', at: '2026-04-10T09:00:00Z' },
        ],
      },
      'admin',
    )
    const phase5 = data.find((p) => p.phase === 5)!
    const versendet = phase5.subphases!.find((s) => s.id === 'anschlussschreiben_versendet')!
    const wartend = phase5.subphases!.find((s) => s.id === 'warten_auf_vs')!
    expect(versendet.state).toBe('done')
    expect(versendet.reachedAt).toBe('2026-04-10T09:00:00Z')
    expect(wartend.state).toBe('active')
  })

  it('Phase-Labels kommen aus PHASE_META', () => {
    const data = buildPhasePipelineData(
      { id: 'f1', aktuelle_phase: null },
      'admin',
    )
    expect(data[0].name).toBe('Ersterfassung & Termin')
    expect(data[9].name).toBe('Auszahlung & Abschluss')
  })

  it('markiert frühere Subphasen derselben Haupt-Phase als done (Insertion-Order)', () => {
    // warten_auf_vs ist innerhalb Phase 5 NACH anschlussschreiben_versendet
    // definiert — ohne reached-Timeline muss buildPhasePipelineData das
    // aus der Insertion-Order ableiten, sonst zeigt die UI „Warten auf VS"
    // aktiv, aber „Anschlussschreiben versendet" fälschlich als ausstehend.
    const data = buildPhasePipelineData(
      { id: 'f1', aktuelle_phase: 'warten_auf_vs' },
      'admin',
    )
    const phase5 = data.find((p) => p.phase === 5)!
    const versendet = phase5.subphases!.find((s) => s.id === 'anschlussschreiben_versendet')!
    const wartend = phase5.subphases!.find((s) => s.id === 'warten_auf_vs')!
    expect(versendet.state).toBe('done')
    expect(wartend.state).toBe('active')
  })
})

// CMM-44 MP-4b: 4-Hauptphasen-Pipeline aus getClaimLifecycle. Loest die
// 10-Phasen/52-Subphasen-Matrix fuer die Fallakte-Anzeige ab. KEINE Klage-
// Hauptphase (B-1); abschluss zeigt den terminalen Substate; die aktive Phase
// traegt den aktuellen ClaimSubPhase als einzigen Sub-Step.
function lc(mainPhase: ClaimMainPhase, subPhase: ClaimSubPhase): ClaimLifecycle {
  return { mainPhase, subPhase, aktiveSideQuests: [], aktiverAuftrag: null }
}

describe('buildClaimPhasePipeline (CMM-44 MP-4b: 4-Phasen-Modell)', () => {
  it('liefert exakt 4 Hauptphasen in fester Reihenfolge mit Labels', () => {
    const data = buildClaimPhasePipeline(lc('erfassung', 'sa_offen'), 'admin')
    expect(data.length).toBe(4)
    expect(data.map((p) => p.phase)).toEqual([1, 2, 3, 4])
    expect(data.map((p) => p.name)).toEqual([
      'Erfassung',
      'Begutachtung',
      'Regulierung',
      'Abschluss',
    ])
  })

  it('erfassung aktiv: Phase 1 active mit Substate-Label, Rest upcoming', () => {
    const data = buildClaimPhasePipeline(lc('erfassung', 'vollmacht_offen'), 'admin')
    expect(data[0].state).toBe('active')
    expect(data[1].state).toBe('upcoming')
    expect(data[3].state).toBe('upcoming')
    expect(data[0].subphases?.[0].label).toBe('Vollmacht offen')
    expect(data[0].subphases?.[0].state).toBe('active')
  })

  it('begutachtung aktiv: erfassung done, begutachtung active, Substate gesetzt', () => {
    const data = buildClaimPhasePipeline(lc('begutachtung', 'besichtigung'), 'sv')
    expect(data[0].state).toBe('done')
    expect(data[1].state).toBe('active')
    expect(data[1].subphases?.[0].label).toBe('Besichtigung')
    expect(data[2].state).toBe('upcoming')
    // Fruehere (done) Phasen tragen keinen Substate (keine Historie im Lifecycle).
    expect(data[0].subphases).toBeUndefined()
  })

  it('Kanzlei-Uebergabe-Interim ist begutachtung-Tail (KEINE eigene Hauptphase, B-10)', () => {
    const data = buildClaimPhasePipeline(lc('begutachtung', 'kanzlei_uebergabe'), 'kb')
    expect(data[1].state).toBe('active')
    expect(data[1].subphases?.[0].label).toBe('Kanzlei-Übergabe läuft')
    expect(data[2].state).toBe('upcoming') // regulierung erst bei lexdrive_case_id
  })

  it('regulierung aktiv: erfassung+begutachtung done, regulierung active', () => {
    const data = buildClaimPhasePipeline(lc('regulierung', 'versicherungskontakt'), 'admin')
    expect(data[0].state).toBe('done')
    expect(data[1].state).toBe('done')
    expect(data[2].state).toBe('active')
    expect(data[2].subphases?.[0].label).toBe('Versicherungskontakt')
    expect(data[3].state).toBe('upcoming')
  })

  it('abschluss terminal (storniert): alle 4 done, Abschluss zeigt terminalen Substate', () => {
    const data = buildClaimPhasePipeline(lc('abschluss', 'storniert'), 'admin')
    expect(data.every((p) => p.state === 'done')).toBe(true)
    expect(data[3].subphases?.[0].label).toBe('Storniert')
    expect(data[3].subphases?.[0].state).toBe('done')
  })

  it('Klage ist abschluss-Substate, KEINE 5. Hauptphase (B-1/B-5)', () => {
    const data = buildClaimPhasePipeline(lc('abschluss', 'klage_rechtsstreit'), 'kunde')
    expect(data.length).toBe(4)
    expect(data[3].subphases?.[0].label).toBe('An die Klage übergeben')
  })

  it('nur die aktive Hauptphase traegt einen Substate', () => {
    const data = buildClaimPhasePipeline(lc('regulierung', 'auszahlung'), 'admin')
    const mitSubstate = data.filter((p) => p.subphases && p.subphases.length > 0)
    expect(mitSubstate.length).toBe(1)
    expect(mitSubstate[0].phase).toBe(3)
    expect(mitSubstate[0].subphases![0].label).toBe('Auszahlung')
  })
})

describe('buildClaimPhasePipeline — Rollen-Labels (MP-5 DE-2)', () => {
  const ALLE: ClaimSubPhase[] = ['sa_offen','vollmacht_offen','onboarding_offen','termin','besichtigung','gutachten','kanzlei_uebergabe','versicherungskontakt','auszahlung','erfolgreich_reguliert','storniert','klage_rechtsstreit','verjaehrt']

  it('interne Rollen sehen das technische Default-Label', () => {
    for (const rolle of ['admin','kb','sv'] as Rolle[]) {
      const d = buildClaimPhasePipeline(lc('erfassung','sa_offen'), rolle)
      expect(d[0].subphases?.[0].label).toBe('SA-Unterschrift offen')
    }
  })

  it('kunde + makler sehen das kundenfreundliche Label', () => {
    for (const rolle of ['kunde','makler'] as Rolle[]) {
      const d = buildClaimPhasePipeline(lc('erfassung','sa_offen'), rolle)
      expect(d[0].subphases?.[0].label).toBe('Schaden wird erfasst')
    }
  })

  it('versicherungskontakt: kunde-Label verbirgt interne Ops-Details', () => {
    const d = buildClaimPhasePipeline(lc('regulierung','versicherungskontakt'), 'kunde')
    expect(d[2].subphases?.[0].label).toBe('Kanzlei klärt mit der Versicherung')
  })

  it('jede Rolle sieht den aktiven Substate (visible=true)', () => {
    for (const rolle of ['admin','kb','sv','kunde','makler'] as Rolle[]) {
      const d = buildClaimPhasePipeline(lc('begutachtung','gutachten'), rolle)
      expect(d[1].subphases?.[0].visible).toBe(true)
    }
  })

  it('jeder der 13 Substates liefert ein nicht-leeres kunde-Label (kein Map-Loch)', () => {
    for (const s of ALLE) {
      const d = buildClaimPhasePipeline(lc(mainPhaseOf(s), s), 'kunde')
      const active = d.find((p) => p.subphases && p.subphases.length)!
      expect(active.subphases![0].label.length).toBeGreaterThan(0)
    }
  })
})
