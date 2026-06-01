// CMM-44 Claim-Phasen-SSoT (P0 Task 2): Unit-Coverage fuer die Aggregations-Logik
// getClaimLifecycle. Das ist die EINE Phase-Quelle (4 Hauptphasen + Subphasen aus
// Lead/Auftrag/Kanzleifall). Die Live-Parity-Probe (probe-claim-phase-parity.mjs)
// beweist nur, dass v_claim_phase == getClaimLifecycle auf den AKTUELLEN Daten —
// die decken aber nur erfassung + regulierung ab. Diese Tests decken die uebrigen
// Branches (begutachtung, auszahlung, abschluss, Prioritaet, Fallback) synthetisch
// ab. In P6 baut der B<->C-Konsistenz-Test hierauf auf.

import { describe, it, expect } from 'vitest'
import { getClaimLifecycle, getVisibleMainPhases, toClaimMainPhase, toClaimSubPhase, type ClaimLifecycleInput } from './lifecycle'
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
    // CMM-44 MP-3: lexdrive_case_id triggert den regulierung-Eintritt (B-10).
    lexdrive_case_id: p.lexdrive_case_id ?? null,
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

describe('getClaimLifecycle — Kanzlei-Uebergabe, Regulierung & Abschluss (MP-3)', () => {
  it('Interim: Kanzleifall existiert, aber lexdrive_case_id null -> begutachtung/kanzlei_uebergabe (B-10)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen' })],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt' }), // ohne lexdrive_case_id
    })
    expect(r.mainPhase).toBe('begutachtung')
    expect(r.subPhase).toBe('kanzlei_uebergabe')
  })

  it('regulierung/versicherungskontakt sobald lexdrive_case_id gesetzt ist (B-10)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen' })],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt', lexdrive_case_id: 'LX-1' }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('versicherungskontakt')
  })

  it('regulierung/auszahlung wenn Kanzlei auszahlung + lexdrive gesetzt', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [],
      kanzleiFall: mkKanzlei({ status: 'auszahlung', ausgezahlt_am: null, lexdrive_case_id: 'LX-1' }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('auszahlung')
  })

  it('lexdrive-Kanzleifall hat Vorrang vor aktivem Erstgutachten (regulierung > begutachtung)', () => {
    const r = getClaimLifecycle({
      lead: { sa_unterschrieben: true, vollmacht_signiert_am: TS, onboarding_complete: true },
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'termin' })],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt', lexdrive_case_id: 'LX-1' }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('versicherungskontakt')
  })

  it('B-12: Auszahlung (ausgezahlt_am gesetzt) kippt NICHT selbst in abschluss -> bleibt regulierung/auszahlung', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen' })],
      kanzleiFall: mkKanzlei({ status: 'auszahlung', ausgezahlt_am: TS, lexdrive_case_id: 'LX-1' }),
      // KEIN terminaler claimStatus
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('auszahlung')
  })

  it('abschluss/erfolgreich_reguliert bei claimStatus=reguliert_vollstaendig (B-11), ueberschreibt Auszahlung', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen' })],
      kanzleiFall: mkKanzlei({ status: 'auszahlung', ausgezahlt_am: TS, lexdrive_case_id: 'LX-1' }),
      claimStatus: 'reguliert_vollstaendig',
    })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('erfolgreich_reguliert')
  })

  it('abschluss/storniert bei claimStatus=storniert (B-7) — terminal ueberschreibt alles', () => {
    const r = getClaimLifecycle({
      lead: { sa_unterschrieben: false, vollmacht_signiert_am: null, onboarding_complete: null },
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'termin' })],
      kanzleiFall: null,
      claimStatus: 'storniert',
    })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('storniert')
  })

  it('terminale Substates klage_rechtsstreit + verjaehrt (B-5)', () => {
    expect(getClaimLifecycle({ lead: null, auftraege: [], kanzleiFall: null, claimStatus: 'klage_rechtsstreit' }).subPhase).toBe('klage_rechtsstreit')
    expect(getClaimLifecycle({ lead: null, auftraege: [], kanzleiFall: null, claimStatus: 'verjaehrt' }).subPhase).toBe('verjaehrt')
  })

  it('aktiver claimStatus=null (Dispatch lebt auf work_state) loest KEIN abschluss aus', () => {
    // D2/T1.1b: dispatch_done/in_bearbeitung sind work_state, NICHT mehr claims.status.
    // Aktive Claims haben status=NULL -> faellt durch wie zuvor dispatch_done.
    const r = getClaimLifecycle({
      lead: { sa_unterschrieben: true, vollmacht_signiert_am: TS, onboarding_complete: true },
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'termin' })],
      kanzleiFall: null,
      claimStatus: null,
    })
    expect(r.mainPhase).toBe('begutachtung')
    expect(r.subPhase).toBe('termin')
  })

  it('Side-Quests (Nachbesichtigung) sind in Regulierung sichtbar, aendern die Hauptphase nicht', () => {
    const nachbesichtigung = mkAuftrag({ typ: 'nachbesichtigung', status: 'termin', reihenfolge: 2 })
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen', reihenfolge: 1 }), nachbesichtigung],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt', lexdrive_case_id: 'LX-1' }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.aktiveSideQuests).toContainEqual(nachbesichtigung)
  })
})

describe('getClaimLifecycle — MP-8 Terminal-Vokabular & Status-Regulierung', () => {
  it('abschluss/abgelehnt_final bei claimStatus=abgelehnt_final (finale Ablehnung)', () => {
    const r = getClaimLifecycle({ ...noLead, claimStatus: 'abgelehnt_final' })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('abgelehnt_final')
  })

  it('abschluss/an_externe_kanzlei bei claimStatus=an_externe_kanzlei_uebergeben', () => {
    const r = getClaimLifecycle({ ...noLead, claimStatus: 'an_externe_kanzlei_uebergeben' })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('an_externe_kanzlei')
  })

  it('regulierung/versicherungskontakt bei claimStatus=in_kommunikation_vs (ohne Kanzleifall)', () => {
    const r = getClaimLifecycle({ ...noLead, claimStatus: 'in_kommunikation_vs' })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('versicherungskontakt')
  })

  it('regulierung/nachforderung bei einfacher Ablehnung (claimStatus=abgelehnt)', () => {
    const r = getClaimLifecycle({ ...noLead, claimStatus: 'abgelehnt' })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('nachforderung')
  })

  it('lexdrive-Regulierung hat Vorrang vor Status-Regulierung (auszahlung schlaegt nachforderung)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [],
      kanzleiFall: mkKanzlei({ status: 'auszahlung', lexdrive_case_id: 'LX-1' }),
      claimStatus: 'abgelehnt',
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('auszahlung')
  })

  it('Status-Regulierung hat Vorrang vor Kanzlei-Uebergabe-Interim', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen' })],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt' }),
      claimStatus: 'in_kommunikation_vs',
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('versicherungskontakt')
  })

  it('Status-Regulierung hat Vorrang vor aktivem Erstgutachten (begutachtung)', () => {
    const r = getClaimLifecycle({
      lead: { sa_unterschrieben: true, vollmacht_signiert_am: TS, onboarding_complete: true },
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'termin' })],
      kanzleiFall: null,
      claimStatus: 'in_kommunikation_vs',
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('versicherungskontakt')
  })

  it('finale Ablehnung (terminal) schlaegt die Status-Regulierung der einfachen Ablehnung', () => {
    const r = getClaimLifecycle({ ...noLead, claimStatus: 'abgelehnt_final' })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('abgelehnt_final')
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

// CMM-44 MP-4c: Guards die rohe v_claim_phase-Strings (main_phase/sub_phase) sicher
// in die getypten ClaimMainPhase/ClaimSubPhase casten — die Listen/Kanban-Reader
// lesen die View als string, buildClaimPhasePipeline braucht aber die echten Typen.
describe('toClaimMainPhase / toClaimSubPhase (CMM-44 MP-4c: View-String -> Typ-Guard)', () => {
  it('toClaimMainPhase laesst gueltige Hauptphasen durch', () => {
    expect(toClaimMainPhase('begutachtung')).toBe('begutachtung')
    expect(toClaimMainPhase('abschluss')).toBe('abschluss')
  })
  it('toClaimMainPhase faellt bei null/undefined/unbekannt auf erfassung zurueck', () => {
    expect(toClaimMainPhase(null)).toBe('erfassung')
    expect(toClaimMainPhase(undefined)).toBe('erfassung')
    expect(toClaimMainPhase('garbage')).toBe('erfassung')
  })
  it('toClaimSubPhase laesst gueltige Subphasen durch', () => {
    expect(toClaimSubPhase('storniert')).toBe('storniert')
    expect(toClaimSubPhase('kanzlei_uebergabe')).toBe('kanzlei_uebergabe')
  })
  it('toClaimSubPhase faellt bei null/unbekannt auf sa_offen zurueck', () => {
    expect(toClaimSubPhase(null)).toBe('sa_offen')
    expect(toClaimSubPhase('nope')).toBe('sa_offen')
  })
})

// AAR-939: Sicht-Filter fuer die Stepper/Pipeline-Renderer — nur_gutachter ohne
// Regulierungs-Phase. Beeinflusst NICHT die Phasen-Ableitung (getClaimLifecycle).
describe('getVisibleMainPhases (AAR-939: nur_gutachter ohne Regulierung)', () => {
  it('nur_gutachter -> 3 Phasen ohne regulierung', () => {
    expect(getVisibleMainPhases('nur_gutachter')).toEqual(['erfassung', 'begutachtung', 'abschluss'])
  })
  it('komplett / sonstige service_typ -> alle 4 Phasen', () => {
    expect(getVisibleMainPhases('komplett')).toEqual(['erfassung', 'begutachtung', 'regulierung', 'abschluss'])
  })
  it('null / undefined -> alle 4 Phasen (Default, Rueckwaerts-Kompatibilitaet)', () => {
    expect(getVisibleMainPhases(null)).toEqual(['erfassung', 'begutachtung', 'regulierung', 'abschluss'])
    expect(getVisibleMainPhases(undefined)).toEqual(['erfassung', 'begutachtung', 'regulierung', 'abschluss'])
  })
})

// AAR-939 3c: der renamte Terminal-Status. Muss bitgleich zur v_claim_phase-View
// sein (gleiche Migration 20260530221245). Beweist, dass der Auto-Close-Status den
// Claim in die Abschluss-Phase hebt.
describe('getClaimLifecycle — AAR-939 Terminal termin_durchgefuehrt', () => {
  it('claimStatus termin_durchgefuehrt -> abschluss/termin_durchgefuehrt (nur_gutachter-Endzustand)', () => {
    const r = getClaimLifecycle({ lead: null, auftraege: [], kanzleiFall: null, claimStatus: 'termin_durchgefuehrt' })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('termin_durchgefuehrt')
  })
  it('Terminal ueberschreibt einen noch offenen Erstgutachten-Auftrag (kein Upload noetig)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'termin' })],
      kanzleiFall: null,
      claimStatus: 'termin_durchgefuehrt',
    })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('termin_durchgefuehrt')
  })
})
