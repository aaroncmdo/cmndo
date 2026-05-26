// CMM-44 Claim-Phasen-SSoT (P0 Task 2): Unit-Coverage fuer die Aggregations-Logik
// getClaimLifecycle. Das ist die EINE Phase-Quelle (4 Hauptphasen + Subphasen aus
// Lead/Auftrag/Kanzleifall). Die Live-Parity-Probe (probe-claim-phase-parity.mjs)
// beweist nur, dass v_claim_phase == getClaimLifecycle auf den AKTUELLEN Daten —
// die decken aber nur erfassung + regulierung ab. Diese Tests decken die uebrigen
// Branches (begutachtung, auszahlung, abschluss, Prioritaet, Fallback) synthetisch
// ab. In P6 baut der B<->C-Konsistenz-Test hierauf auf.

import { describe, it, expect } from 'vitest'
import { getClaimLifecycle, type ClaimLifecycleInput } from './lifecycle'
import type { AuftragRow } from '@/lib/auftrag/queries'
import type { KanzleiFallRow } from '@/lib/kanzlei-fall/queries'

const TS = '2026-05-01T10:00:00.000Z'

function mkAuftrag(p: Partial<AuftragRow> & Pick<AuftragRow, 'typ' | 'status'>): AuftragRow {
  return {
    id: p.id ?? `a-${p.typ}-${p.status}`,
    fall_id: p.fall_id ?? 'fall-1',
    sv_id: p.sv_id ?? 'sv-1',
    typ: p.typ,
    status: p.status,
    reihenfolge: p.reihenfolge ?? 1,
    vorheriger_auftrag_id: p.vorheriger_auftrag_id ?? null,
    gutachten_url: p.gutachten_url ?? null,
    gutachten_final_freigegeben: p.gutachten_final_freigegeben ?? false,
    abgeschlossen_am: p.abgeschlossen_am ?? null,
    zurueckweisung_grund: p.zurueckweisung_grund ?? null,
    zurueckgewiesen_am: p.zurueckgewiesen_am ?? null,
    erstellt_am: p.erstellt_am ?? TS,
    updated_at: p.updated_at ?? TS,
  }
}

function mkKanzlei(p: Partial<KanzleiFallRow> & Pick<KanzleiFallRow, 'status'>): KanzleiFallRow {
  return {
    id: p.id ?? 'kf-1',
    fall_id: p.fall_id ?? 'fall-1',
    status: p.status,
    vs_kontakt_am: p.vs_kontakt_am ?? TS,
    ausgezahlt_am: p.ausgezahlt_am ?? null,
    erstellt_am: p.erstellt_am ?? TS,
    updated_at: p.updated_at ?? TS,
  }
}

const noLead: ClaimLifecycleInput = { lead: null, auftraege: [], kanzleiFall: null }

describe('getClaimLifecycle — Erfassung (Lead-Lifecycle)', () => {
  it('sa_offen wenn Lead nichts unterschrieben hat', () => {
    const r = getClaimLifecycle({
      lead: { sa_unterschrieben: false, vollmacht_signiert_am: null, onboarding_complete: null },
      auftraege: [],
      kanzleiFall: null,
    })
    expect(r.mainPhase).toBe('erfassung')
    expect(r.subPhase).toBe('sa_offen')
  })

  it('vollmacht_offen wenn SA unterschrieben, Vollmacht offen', () => {
    const r = getClaimLifecycle({
      lead: { sa_unterschrieben: true, vollmacht_signiert_am: null, onboarding_complete: null },
      auftraege: [],
      kanzleiFall: null,
    })
    expect(r.mainPhase).toBe('erfassung')
    expect(r.subPhase).toBe('vollmacht_offen')
  })

  it('onboarding_offen sobald Vollmacht signiert ist', () => {
    const r = getClaimLifecycle({
      lead: { sa_unterschrieben: true, vollmacht_signiert_am: TS, onboarding_complete: false },
      auftraege: [],
      kanzleiFall: null,
    })
    expect(r.mainPhase).toBe('erfassung')
    expect(r.subPhase).toBe('onboarding_offen')
  })

  it('vollmacht_signiert_am hat Vorrang vor sa_unterschrieben (Precedence wie die View)', () => {
    const r = getClaimLifecycle({
      lead: { sa_unterschrieben: false, vollmacht_signiert_am: TS, onboarding_complete: null },
      auftraege: [],
      kanzleiFall: null,
    })
    expect(r.subPhase).toBe('onboarding_offen')
  })
})

describe('getClaimLifecycle — Begutachtung (Auftrag-Lifecycle)', () => {
  for (const status of ['termin', 'besichtigung', 'gutachten'] as const) {
    it(`begutachtung/${status} bei aktivem Erstgutachten (status=${status}), kein Kanzleifall`, () => {
      const auftrag = mkAuftrag({ typ: 'erstgutachten', status })
      const r = getClaimLifecycle({
        lead: { sa_unterschrieben: true, vollmacht_signiert_am: TS, onboarding_complete: true },
        auftraege: [auftrag],
        kanzleiFall: null,
      })
      expect(r.mainPhase).toBe('begutachtung')
      expect(r.subPhase).toBe(status)
      expect(r.aktiverAuftrag).toBe(auftrag)
    })
  }

  it('abgeschlossenes Erstgutachten OHNE Kanzleifall faellt zurueck auf erfassung (dokumentiert IST-Verhalten; View spiegelt das)', () => {
    const r = getClaimLifecycle({
      lead: { sa_unterschrieben: true, vollmacht_signiert_am: TS, onboarding_complete: true },
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen' })],
      kanzleiFall: null,
    })
    // status === 'abgeschlossen' faellt durch den Begutachtungs-Guard -> Lead-Branch.
    expect(r.mainPhase).toBe('erfassung')
    expect(r.subPhase).toBe('onboarding_offen')
  })
})

describe('getClaimLifecycle — Regulierung & Abschluss (Kanzlei-Lifecycle)', () => {
  it('regulierung/versicherungskontakt sobald Kanzleifall existiert', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen' })],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt' }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('versicherungskontakt')
  })

  it('regulierung/auszahlung wenn Kanzlei auszahlung, aber ausgezahlt_am noch null', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [],
      kanzleiFall: mkKanzlei({ status: 'auszahlung', ausgezahlt_am: null }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('auszahlung')
  })

  it('Kanzleifall hat Vorrang vor aktivem Erstgutachten (Prioritaet regulierung > begutachtung) — der Live-Daten-Fall', () => {
    const r = getClaimLifecycle({
      lead: { sa_unterschrieben: true, vollmacht_signiert_am: TS, onboarding_complete: true },
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'termin' })],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt' }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('versicherungskontakt')
  })

  it('abschluss wenn Kanzlei ausgezahlt UND alle Auftraege abgeschlossen', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen' })],
      kanzleiFall: mkKanzlei({ status: 'auszahlung', ausgezahlt_am: TS }),
    })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('abgeschlossen')
  })

  it('abschluss auch bei 0 Auftraegen (every() vacuously true — wie das NOT EXISTS der View)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [],
      kanzleiFall: mkKanzlei({ status: 'auszahlung', ausgezahlt_am: TS }),
    })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('abgeschlossen')
  })

  it('NICHT abschluss wenn ausgezahlt, aber noch ein Auftrag offen -> regulierung/auszahlung', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [
        mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen', reihenfolge: 1 }),
        mkAuftrag({ typ: 'nachbesichtigung', status: 'besichtigung', reihenfolge: 2 }),
      ],
      kanzleiFall: mkKanzlei({ status: 'auszahlung', ausgezahlt_am: TS }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('auszahlung')
  })

  it('Side-Quests (Nachbesichtigung) sind in Regulierung sichtbar, aendern die Hauptphase nicht', () => {
    const nachbesichtigung = mkAuftrag({ typ: 'nachbesichtigung', status: 'termin', reihenfolge: 2 })
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen', reihenfolge: 1 }), nachbesichtigung],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt' }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.aktiveSideQuests).toContainEqual(nachbesichtigung)
  })
})

describe('getClaimLifecycle — Fallback', () => {
  it('ohne Lead/Auftrag/Kanzlei -> erfassung/sa_offen (Fallback, wie die View ELSE-Zweige)', () => {
    const r = getClaimLifecycle(noLead)
    expect(r.mainPhase).toBe('erfassung')
    expect(r.subPhase).toBe('sa_offen')
    expect(r.aktiveSideQuests).toEqual([])
    expect(r.aktiverAuftrag).toBeNull()
  })
})
