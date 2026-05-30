// AAR-566 (B3): Tests für Visibility-Matrix.

import { describe, expect, it } from 'vitest'
import {
  SUBPHASE_VISIBILITY,
  PHASE_META,
  buildClaimPhasePipeline,
  substateLabelForRolle,
} from './subphase-visibility'
import type { Rolle } from '@/components/shared/fall-phases/types'
import { mainPhaseOf, type ClaimLifecycle, type ClaimMainPhase, type ClaimSubPhase } from '@/lib/claims/lifecycle'

const ALL_ROLLES: Rolle[] = ['admin', 'kb', 'sv', 'kunde', 'makler']

describe('substateLabelForRolle (MP-5b — von ClaimStepper für kunde genutzt)', () => {
  it('kunde + makler bekommen das kundenfreundliche Label', () => {
    expect(substateLabelForRolle('vollmacht_offen', 'kunde')).toBe('Unterlagen werden vorbereitet')
    expect(substateLabelForRolle('versicherungskontakt', 'makler')).toBe('Kanzlei klärt mit der Versicherung')
  })
  it('interne Rollen bekommen das technische Default-Label', () => {
    expect(substateLabelForRolle('vollmacht_offen', 'admin')).toBe('Vollmacht offen')
    expect(substateLabelForRolle('versicherungskontakt', 'sv')).toBe('Versicherungskontakt')
  })
})

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

// CMM-44 MP-4b: 4-Hauptphasen-Pipeline aus getClaimLifecycle. Loest die
// 10-Phasen/52-Subphasen-Matrix fuer die Fallakte-Anzeige ab. KEINE Klage-
// Hauptphase (B-1); abschluss zeigt den terminalen Substate; die aktive Phase
// traegt den aktuellen ClaimSubPhase als einzigen Sub-Step.
function lc(
  mainPhase: ClaimMainPhase,
  subPhase: ClaimSubPhase,
  serviceTyp?: string | null,
): ClaimLifecycle {
  return { mainPhase, subPhase, aktiveSideQuests: [], aktiverAuftrag: null, serviceTyp }
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

describe('buildClaimPhasePipeline — AAR-939 nur_gutachter blendet Regulierung aus', () => {
  it('nur_gutachter: 3 Phasen (Erfassung -> Begutachtung -> Abschluss), keine Regulierung', () => {
    const data = buildClaimPhasePipeline(lc('begutachtung', 'gutachten', 'nur_gutachter'), 'kunde')
    expect(data.length).toBe(3)
    expect(data.map((p) => p.name)).toEqual(['Erfassung', 'Begutachtung', 'Abschluss'])
    // Phase-Badges 1..3 (kein 4er-Sprung trotz weggelassener Regulierung)
    expect(data.map((p) => p.phase)).toEqual([1, 2, 3])
  })

  it('nur_gutachter im Terminal: Abschluss ist die letzte Phase + done', () => {
    const data = buildClaimPhasePipeline(lc('abschluss', 'termin_durchgefuehrt', 'nur_gutachter'), 'kunde')
    expect(data.length).toBe(3)
    expect(data.map((p) => p.name)).toEqual(['Erfassung', 'Begutachtung', 'Abschluss'])
    expect(data.every((p) => p.state === 'done')).toBe(true)
  })

  it('komplett-Service (kein nur_gutachter): unveraendert 4 Phasen inkl. Regulierung', () => {
    const data = buildClaimPhasePipeline(lc('regulierung', 'versicherungskontakt', 'komplett'), 'admin')
    expect(data.length).toBe(4)
    expect(data.map((p) => p.name)).toContain('Regulierung')
  })

  it('serviceTyp undefined: Default = 4 Phasen (Rueckwaerts-Kompatibilitaet)', () => {
    const data = buildClaimPhasePipeline(lc('begutachtung', 'gutachten'), 'kunde')
    expect(data.length).toBe(4)
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
