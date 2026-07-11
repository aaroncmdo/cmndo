// CMM-44 Claim-Phasen-SSoT (P0 Task 2): Unit-Coverage fuer die Aggregations-Logik
// getClaimLifecycle. Das ist die EINE Phase-Quelle (4 Hauptphasen + Subphasen aus
// Lead/Auftrag/Kanzleifall). Die Live-Parity-Probe (probe-claim-phase-parity.mjs)
// beweist nur, dass v_claim_phase == getClaimLifecycle auf den AKTUELLEN Daten —
// die decken aber nur erfassung + regulierung ab. Diese Tests decken die uebrigen
// Branches (begutachtung, auszahlung, abschluss, Prioritaet, Fallback) synthetisch
// ab. In P6 baut der B<->C-Konsistenz-Test hierauf auf.

import { describe, it, expect } from 'vitest'
import { getClaimLifecycle, getVisibleMainPhases, toClaimMainPhase, toClaimSubPhase, mainPhaseOf, type ClaimLifecycleInput } from './lifecycle'
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
    // CMM-74 b2: filmcheck_ok fuer die filmcheck/qc-pruefung-Verfeinerung im Begutachtungs-Block.
    filmcheck_ok: p.filmcheck_ok ?? null,
  }
}

function mkKanzlei(p: Partial<KanzleiFallRow> & Pick<KanzleiFallRow, 'status'>): KanzleiFallRow {
  return {
    id: p.id ?? 'kf-1',
    fall_id: p.fall_id ?? 'fall-1',
    status: p.status,
    // Aaron 03.07.: vs_kontakt_am ist jetzt ein Regulierungs-Signal → Default null (opt-in),
    // damit Interim-/Begutachtungs-Cases ohne explizites VS-Kontakt-Datum predictable bleiben.
    vs_kontakt_am: p.vs_kontakt_am ?? null,
    ausgezahlt_am: p.ausgezahlt_am ?? null,
    erstellt_am: p.erstellt_am ?? TS,
    updated_at: p.updated_at ?? TS,
    // CMM-44 MP-3: lexdrive_case_id triggert den regulierung-Eintritt (B-10).
    lexdrive_case_id: p.lexdrive_case_id ?? null,
    // CMM-74 b2: Regulierungs-Trigger fuer die operativen Sub-Phasen vs-kuerzt/anschlussschreiben.
    vs_reaktion_typ: p.vs_reaktion_typ ?? null,
    anschlussschreiben_am: p.anschlussschreiben_am ?? null,
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

// CMM-74 b2 §1: die 5 operativen Sub-Phasen, die die SQL-Spiegel-View v_claim_phase
// (Migration 20260602083708) schon emittiert — getClaimLifecycle muss bitgleich
// ableiten (Parity-Gate). Precedence (nach terminal): nachbesichtigung-laeuft >
// vs-kuerzt > anschlussschreiben(pre-lexdrive) > lexdrive > status-regulierung >
// kanzlei_uebergabe > filmcheck/qc-pruefung/gutachten > lead.
describe('getClaimLifecycle — CMM-74 b2: operative Sub-Phasen (+5, v_claim_phase-Parity)', () => {
  it('regulierung/nachbesichtigung-laeuft bei aktivem Nachbesichtigungs-Auftrag', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [
        mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen', reihenfolge: 1 }),
        mkAuftrag({ typ: 'nachbesichtigung', status: 'termin', reihenfolge: 2 }),
      ],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt' }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('nachbesichtigung-laeuft')
  })

  it('nachbesichtigung-laeuft hat Vorrang vor lexdrive-Regulierung (View: nb.active zuerst)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'nachbesichtigung', status: 'besichtigung', reihenfolge: 2 })],
      kanzleiFall: mkKanzlei({ status: 'auszahlung', lexdrive_case_id: 'LX-1' }),
    })
    expect(r.subPhase).toBe('nachbesichtigung-laeuft')
  })

  it('regulierung/vs-kuerzt bei kanzlei_faelle.vs_reaktion_typ=gekuerzt', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt', vs_reaktion_typ: 'gekuerzt' }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('vs-kuerzt')
  })

  it('regulierung/anschlussschreiben bei anschlussschreiben_am (pre-lexdrive)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt', anschlussschreiben_am: TS }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('anschlussschreiben')
  })

  it('anschlussschreiben gilt NUR pre-lexdrive — mit lexdrive_case_id schlaegt die lexdrive-Regulierung', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt', anschlussschreiben_am: TS, lexdrive_case_id: 'LX-1' }),
    })
    expect(r.subPhase).toBe('versicherungskontakt')
  })

  it('begutachtung/filmcheck bei Erstgutachten status=gutachten + gutachten_url (ohne filmcheck_ok)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'gutachten', gutachten_url: 'https://x' })],
      kanzleiFall: null,
    })
    expect(r.mainPhase).toBe('begutachtung')
    expect(r.subPhase).toBe('filmcheck')
  })

  it('begutachtung/qc-pruefung bei filmcheck_ok=true', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'gutachten', gutachten_url: 'https://x', filmcheck_ok: true })],
      kanzleiFall: null,
    })
    expect(r.mainPhase).toBe('begutachtung')
    expect(r.subPhase).toBe('qc-pruefung')
  })

  it('Erstgutachten status=gutachten OHNE gutachten_url bleibt gutachten (kein vorzeitiger Filmcheck)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'gutachten' })],
      kanzleiFall: null,
    })
    expect(r.subPhase).toBe('gutachten')
  })

  it('terminal schlaegt nachbesichtigung-laeuft (Abschluss-Vorrang bleibt)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'nachbesichtigung', status: 'termin' })],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt' }),
      claimStatus: 'reguliert_vollstaendig',
    })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('erfolgreich_reguliert')
  })

  it('mainPhaseOf bildet die 5 neuen Sub-Phasen korrekt ab', () => {
    expect(mainPhaseOf('filmcheck')).toBe('begutachtung')
    expect(mainPhaseOf('qc-pruefung')).toBe('begutachtung')
    expect(mainPhaseOf('vs-kuerzt')).toBe('regulierung')
    expect(mainPhaseOf('anschlussschreiben')).toBe('regulierung')
    expect(mainPhaseOf('nachbesichtigung-laeuft')).toBe('regulierung')
  })

  it('mainPhaseOf: alle Reparatur-Sub-Phasen => erfassung (SQL-konsistent, Fix 2)', () => {
    expect(mainPhaseOf('reparatur_werkstattwahl')).toBe('erfassung')
    expect(mainPhaseOf('reparatur_terminfindung')).toBe('erfassung')
    expect(mainPhaseOf('reparatur_laeuft')).toBe('erfassung')
    expect(mainPhaseOf('reparatur_fertig')).toBe('erfassung')
  })
})

// Aaron 03.07.: DATA-DRIVEN Regulierung — die KB-nativen Aktionen (kanzleiVsKontaktErfasst →
// kf.vs_kontakt_am; kanzleiAuszahlungEingegangen → kf.status='auszahlung'/ausgezahlt_am) treiben
// die Phase jetzt OHNE lexdrive_case_id. Vorher gated hinter LexDrive (B-10). Bitgleich zur
// v_claim_phase-Migration 20260703161208.
describe('getClaimLifecycle — data-driven Regulierung ohne LexDrive (Aaron 03.07.)', () => {
  it('regulierung/versicherungskontakt bei kf.vs_kontakt_am (KB-VS-Kontakt), OHNE lexdrive', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen' })],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt', vs_kontakt_am: TS }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('versicherungskontakt')
  })

  it('regulierung/auszahlung bei kf.status=auszahlung, OHNE lexdrive', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [],
      kanzleiFall: mkKanzlei({ status: 'auszahlung', vs_kontakt_am: null }),
    })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('auszahlung')
  })

  it('regulierung/auszahlung bei kf.ausgezahlt_am gesetzt, OHNE lexdrive', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt', ausgezahlt_am: TS, vs_kontakt_am: null }),
    })
    expect(r.subPhase).toBe('auszahlung')
  })

  it('Interim bleibt kanzlei_uebergabe OHNE Regulierungs-Signal (kein vs_kontakt_am/auszahlung/lexdrive)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'abgeschlossen' })],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt', vs_kontakt_am: null }),
    })
    expect(r.mainPhase).toBe('begutachtung')
    expect(r.subPhase).toBe('kanzlei_uebergabe')
  })

  it('Auszahlung (data-driven) schlaegt vs_kontakt_am (weiteste Regulierungs-Sub-Phase)', () => {
    const r = getClaimLifecycle({
      lead: null,
      auftraege: [],
      kanzleiFall: mkKanzlei({ status: 'auszahlung', vs_kontakt_am: TS }),
    })
    expect(r.subPhase).toBe('auszahlung')
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

// Unified Stepper (Aaron, "ein Stepper am Claim"): getClaimLifecycle nimmt den WEITESTEN von
// zwei Kandidaten — operative_status (Engine-Cursor) und Milestone-Kaskade (Sub-Entity-Felder)
// — gemessen am globalen SUB_ORDER. operativeStatus liftet haengende Milestones; ein bereits
// gesetzter Milestone (kanzlei_fall) wird NIE von einem zurueckgebliebenen operative gedrueckt.
describe('getClaimLifecycle — Unified Stepper (furthest-signal-wins)', () => {
  const lead = { sa_unterschrieben: true, vollmacht_signiert_am: TS, onboarding_complete: true }
  it('sv-termin -> begutachtung/termin (auch OHNE erstgutachten-Auftrag — behebt Erfassung-Haenger)', () => {
    const r = getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'sv-termin' })
    expect(r.mainPhase).toBe('begutachtung')
    expect(r.subPhase).toBe('termin')
  })
  it('gutachten-eingegangen -> begutachtung/gutachten', () => {
    expect(getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'gutachten-eingegangen' }).subPhase).toBe('gutachten')
  })
  it('Begutachtung-Sub via Auftrag verfeinert: gutachten-eingegangen + filmcheck_ok -> qc-pruefung', () => {
    const r = getClaimLifecycle({
      lead, kanzleiFall: null, operativeStatus: 'gutachten-eingegangen',
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'gutachten', gutachten_url: 'https://x', filmcheck_ok: true })],
    })
    expect(r.subPhase).toBe('qc-pruefung')
  })
  it('anschlussschreiben -> regulierung/anschlussschreiben', () => {
    const r = getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'anschlussschreiben' })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('anschlussschreiben')
  })
  it('zahlung-eingegangen -> regulierung/auszahlung (kein Auto-Abschluss)', () => {
    expect(getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'zahlung-eingegangen' }).mainPhase).toBe('regulierung')
  })
  it('operative Erfassung-Bucket -> Lead-Sub (ersterfassung + Vollmacht signiert -> onboarding_offen)', () => {
    expect(getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'ersterfassung' }).subPhase).toBe('onboarding_offen')
  })
  it('operative=abgeschlossen + claimStatus reguliert_vollstaendig -> abschluss/erfolgreich_reguliert', () => {
    const r = getClaimLifecycle({ lead: null, auftraege: [], kanzleiFall: null, operativeStatus: 'abgeschlossen', claimStatus: 'reguliert_vollstaendig' })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('erfolgreich_reguliert')
  })
  it('terminal claimStatus schlaegt operative_status (storniert ueberschreibt sv-termin)', () => {
    const r = getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'sv-termin', claimStatus: 'storniert' })
    expect(r.mainPhase).toBe('abschluss')
    expect(r.subPhase).toBe('storniert')
  })
  it('reg-signal (in_kommunikation_vs) hebt operative=sv-termin auf Regulierung', () => {
    const r = getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'sv-termin', claimStatus: 'in_kommunikation_vs' })
    expect(r.mainPhase).toBe('regulierung')
    expect(r.subPhase).toBe('versicherungskontakt')
  })
  it('reg-signal greift NICHT zurueck wenn operative bereits >= regulierung (auszahlung bleibt)', () => {
    const r = getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'zahlung-eingegangen', claimStatus: 'abgelehnt' })
    expect(r.subPhase).toBe('auszahlung')
  })
  it('operativeStatus NULL -> bestehende Milestone-Kaskade (Backward-Compat: aktiver Erstgutachten -> begutachtung)', () => {
    const r = getClaimLifecycle({ lead, auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'termin' })], kanzleiFall: null, operativeStatus: null })
    expect(r.mainPhase).toBe('begutachtung')
    expect(r.subPhase).toBe('termin')
  })
  it('Milestone gewinnt ueber zurueckgebliebenen operative_status: kanzlei_fall + operative=ersterfassung -> kanzlei_uebergabe (KEINE Regression)', () => {
    // Live-Befund (27.06.): 7 Claims mit operative=ersterfassung haben einen kanzlei_fall
    // (Cursor nie advanced). Furthest-wins haelt sie auf begutachtung/kanzlei_uebergabe statt
    // sie auf erfassung zurueckzudruecken (was operative-primary getan haette).
    const r = getClaimLifecycle({
      lead: { sa_unterschrieben: true, vollmacht_signiert_am: null, onboarding_complete: null },
      auftraege: [],
      kanzleiFall: mkKanzlei({ status: 'versicherungskontakt' }), // ohne lexdrive_case_id
      operativeStatus: 'ersterfassung',
    })
    expect(r.mainPhase).toBe('begutachtung')
    expect(r.subPhase).toBe('kanzlei_uebergabe')
  })
  it('Begutachtung-Milestone (Auftrag mit gutachten_url -> filmcheck) gewinnt ueber operative=sv-termin', () => {
    // operative sagt termin(3); Auftrag-Milestone hat gutachten_url -> filmcheck(6). Furthest -> filmcheck.
    const r = getClaimLifecycle({
      lead, kanzleiFall: null, operativeStatus: 'sv-termin',
      auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'gutachten', gutachten_url: 'https://x' })],
    })
    expect(r.mainPhase).toBe('begutachtung')
    expect(r.subPhase).toBe('filmcheck')
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
