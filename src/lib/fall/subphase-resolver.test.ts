// AAR-538 (C1): Unit-Tests für resolveSubphase
// CMM-44 MP-2: Re-based auf die Owning-Sub-Entities (kanzleiFall / auftraege /
// gutachten / claim / lead / gutachter_termine) statt der sterbenden
// v_faelle_mit_aktuellem_termin-View. Die erwarteten Subphasen-Outputs sind
// IDENTISCH zur AAR-538-Treffermenge (DE-1/DE-2: kein Eindampfen) — nur die
// Input-Quelle pro Trigger-Feld wandert auf die §8-Owning-Entity.

import { describe, it, expect } from 'vitest'
import {
  resolveSubphase,
  type ClaimTriggers,
  type LeadTriggers,
  type KanzleiFallTriggers,
  type AuftragTriggers,
  type GutachtenTriggers,
  type GutachterTerminRow,
} from './subphase-resolver'

const NOW = new Date('2026-04-19T12:00:00Z')

// ─── Sub-Entity-Factories (nur Trigger-Felder; alles andere default null) ─────
const claim = (o: Partial<ClaimTriggers> = {}): ClaimTriggers => ({ operative_status: 'in_bearbeitung', ...o })
const lead = (o: Partial<LeadTriggers> = {}): LeadTriggers => ({ ...o })
const kf = (o: Partial<KanzleiFallTriggers> = {}): KanzleiFallTriggers => ({ status: 'versicherungskontakt', ...o })
const auftrag = (o: Partial<AuftragTriggers> = {}): AuftragTriggers => ({ typ: 'erstgutachten', status: 'gutachten', ...o })
const gutachten = (o: Partial<GutachtenTriggers> = {}): GutachtenTriggers => ({ ...o })
const termin = (o: Partial<GutachterTerminRow> = {}): GutachterTerminRow => ({ status: 'bestaetigt', ...o })

describe('resolveSubphase — Erweiterung 1: Quotierung 6f.x (kanzleiFall)', () => {
  it('6f.1 Quote angekündigt', () => {
    const r = resolveSubphase({
      kanzleiFall: kf({ vs_reaktion_typ: 'quotiert', vs_quote_prozent: 60 }),
      now: NOW,
    })
    expect(r.phase).toBe(6)
    expect(r.subphase).toBe('6f.1')
  })

  it('6f.2 Quote akzeptiert', () => {
    const r = resolveSubphase({
      kanzleiFall: kf({ vs_reaktion_typ: 'quotiert', vs_quote_prozent: 60, vs_quote_akzeptiert_am: '2026-04-10T00:00:00Z' }),
      now: NOW,
    })
    expect(r.subphase).toBe('6f.2')
  })

  it('6f.3 Quote ausgezahlt', () => {
    const r = resolveSubphase({
      kanzleiFall: kf({
        vs_reaktion_typ: 'quotiert',
        vs_quote_prozent: 60,
        vs_quote_akzeptiert_am: '2026-04-10T00:00:00Z',
        vs_quote_betrag_ausgezahlt: 1200,
      }),
      now: NOW,
    })
    expect(r.subphase).toBe('6f.3')
  })
})

describe('resolveSubphase — Erweiterung 2: Rüge-2-SLA 7.5a / 7.5b (kanzleiFall)', () => {
  it('7.5a — Rüge 2 versendet, 3d her → warten', () => {
    const r = resolveSubphase({
      kanzleiFall: kf({ ruege_counter: 2, ruege_gesendet_am: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() }),
      now: NOW,
    })
    expect(r.subphase).toBe('7.5a')
  })

  it('7.5b — Rüge 2 versendet, 8d her → Breach', () => {
    const r = resolveSubphase({
      kanzleiFall: kf({ ruege_counter: 2, ruege_gesendet_am: new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString() }),
      now: NOW,
    })
    expect(r.subphase).toBe('7.5b')
  })
})

describe('resolveSubphase — Erweiterung 3: Stellungnahme-Conditional (auftraege + kanzleiFall)', () => {
  it('7.1 bei technisch', () => {
    const r = resolveSubphase({
      auftraege: [auftrag({ technische_stellungnahme_status: 'beauftragt' })],
      kanzleiFall: kf({ vs_kuerzungs_typ: 'technisch' }),
      now: NOW,
    })
    expect(r.subphase).toBe('7.1')
  })

  it('7.1 bei gemischt', () => {
    const r = resolveSubphase({
      auftraege: [auftrag({ technische_stellungnahme_status: 'beauftragt' })],
      kanzleiFall: kf({ vs_kuerzungs_typ: 'gemischt' }),
      now: NOW,
    })
    expect(r.subphase).toBe('7.1')
  })

  it('argumentativ springt NICHT in 7.1 (fällt auf 6b durch)', () => {
    const r = resolveSubphase({
      auftraege: [auftrag({ technische_stellungnahme_status: 'beauftragt' })],
      kanzleiFall: kf({ vs_kuerzungs_typ: 'argumentativ', vs_reaktion_typ: 'gekuerzt', kuerzungs_betrag: 1500 }),
      now: NOW,
    })
    expect(r.subphase).toBe('6b')
  })
})

describe('resolveSubphase — Erweiterung 4: kb_filmcheck_bestanden Event (auftraege + webhook)', () => {
  it('4.5 wenn Webhook-Event vorhanden', () => {
    const r = resolveSubphase({
      auftraege: [auftrag({ filmcheck_ok: true })],
      webhook_events: [
        { event_type: 'kb_filmcheck_bestanden', fall_id: 'test-fall-id', processed_at: '2026-04-18T10:00:00Z', source: 'manual_kb' },
      ],
      now: NOW,
    })
    expect(r.phase).toBe(4)
    expect(r.subphase).toBe('4.5')
  })

  it('4.4 wenn nur filmcheck_ok, aber kein Event', () => {
    const r = resolveSubphase({
      auftraege: [auftrag({ filmcheck_ok: true })],
      now: NOW,
    })
    expect(r.subphase).toBe('4.4')
  })
})

describe('resolveSubphase — Erweiterung 5: Auszahlungs-Split 8.1/8.2a/8.2b/8.3 (claim; DE-4-pending)', () => {
  it('8.1 beide offen', () => {
    const r = resolveSubphase({ claim: claim({ regulierung_betrag: 5000 }), now: NOW })
    expect(r.subphase).toBe('8.1')
  })

  it('8.2a Kunde gezahlt, SV offen', () => {
    const r = resolveSubphase({
      claim: claim({ regulierung_betrag: 5000, auszahlung_kunde_eingegangen_am: '2026-04-15T00:00:00Z' }),
      now: NOW,
    })
    expect(r.subphase).toBe('8.2a')
  })

  it('8.2b SV gezahlt, Kunde offen', () => {
    const r = resolveSubphase({
      claim: claim({ regulierung_betrag: 5000, auszahlung_gutachter_eingegangen_am: '2026-04-15T00:00:00Z' }),
      now: NOW,
    })
    expect(r.subphase).toBe('8.2b')
  })

  it('8.3 beide gezahlt', () => {
    const r = resolveSubphase({
      claim: claim({
        regulierung_betrag: 5000,
        auszahlung_kunde_eingegangen_am: '2026-04-15T00:00:00Z',
        auszahlung_gutachter_eingegangen_am: '2026-04-15T00:00:00Z',
      }),
      now: NOW,
    })
    expect(r.subphase).toBe('8.3')
  })
})

describe('resolveSubphase — Kern-Pfade', () => {
  it('6a VS reguliert (kanzleiFall)', () => {
    const r = resolveSubphase({ kanzleiFall: kf({ vs_reaktion_typ: 'voll_reguliert' }), now: NOW })
    expect(r.subphase).toBe('6a')
  })

  it('6b VS kürzt (kanzleiFall)', () => {
    const r = resolveSubphase({ kanzleiFall: kf({ vs_reaktion_typ: 'gekuerzt', kuerzungs_betrag: 1200 }), now: NOW })
    expect(r.subphase).toBe('6b')
  })

  it('6c VS lehnt ab (kanzleiFall)', () => {
    const r = resolveSubphase({ kanzleiFall: kf({ vs_reaktion_typ: 'abgelehnt' }), now: NOW })
    expect(r.subphase).toBe('6c')
  })

  it('6d VS schweigt 14d (kanzleiFall.anschlussschreiben_sendedatum)', () => {
    const r = resolveSubphase({
      kanzleiFall: kf({ anschlussschreiben_sendedatum: new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString() }),
      now: NOW,
    })
    expect(r.subphase).toBe('6d')
  })

  it('9.1 Fall geschlossen (claim.abgeschlossen_am)', () => {
    const r = resolveSubphase({
      claim: claim({ abgeschlossen_am: '2026-04-18T00:00:00Z', google_review_gesendet: true }),
      now: NOW,
    })
    expect(r.subphase).toBe('9.1')
  })

  it('Fallback 1 bei leerem Input', () => {
    const r = resolveSubphase({ now: NOW })
    expect(r.phase).toBe(1)
    expect(r.subphase).toBe('1')
  })
})

describe('resolveSubphase — Begutachtung re-based (auftraege + gutachten + Termin)', () => {
  it('4.2 Gutachten hochgeladen (auftraege.gutachten_url)', () => {
    const r = resolveSubphase({
      auftraege: [auftrag({ status: 'gutachten', gutachten_url: 'https://x/g.pdf' })],
      now: NOW,
    })
    expect(r.phase).toBe(4)
    expect(r.subphase).toBe('4.2')
  })

  it('4.3 OCR extrahiert (gutachten.ocr_status)', () => {
    const r = resolveSubphase({
      auftraege: [auftrag({ status: 'gutachten', gutachten_url: 'https://x/g.pdf' })],
      gutachten: [gutachten({ ocr_status: 'fertig' })],
      now: NOW,
    })
    expect(r.subphase).toBe('4.3')
  })

  it('4.1 Gutachten in Bearbeitung (Termin durchgeführt)', () => {
    const r = resolveSubphase({
      gutachter_termine: [termin({ durchgefuehrt_am: '2026-04-18T09:00:00Z' })],
      now: NOW,
    })
    expect(r.subphase).toBe('4.1')
  })

  it('3.2 SV vor Ort', () => {
    const r = resolveSubphase({
      gutachter_termine: [termin({ sv_angekommen_am: '2026-04-19T08:00:00Z' })],
      now: NOW,
    })
    expect(r.subphase).toBe('3.2')
  })

  // A1-Bug: der aktTermin-Filter schloss nur storniert/verlegt/verschoben aus, NICHT
  // 'abgesagt' (Kunden-Absage, api/kunde/termin/absagen) und 'abgelehnt' (SV-Ablehnung /
  // slot-ttl-cleanup). Folge: die Fallakte zeigte nach der Absage weiter eine TOTE Subphase
  // ("SV vor Ort") anhand alter Tracking-Felder, obwohl kein Termin mehr steht.
  // Erwartung: ein toter Termin verhaelt sich exakt wie GAR KEIN Termin.
  describe('toter Termin darf keine Subphase mehr tragen', () => {
    const ohneTermin = resolveSubphase({ now: NOW }).subphase

    it.each(['abgesagt', 'abgelehnt', 'storniert', 'verlegt', 'verschoben'])(
      'Status %s -> wie ohne Termin (nicht mehr 3.2)',
      (status) => {
        const r = resolveSubphase({
          gutachter_termine: [termin({ status, sv_angekommen_am: '2026-04-19T08:00:00Z' })],
          now: NOW,
        })
        expect(r.subphase).not.toBe('3.2')
        expect(r.subphase).toBe(ohneTermin)
      },
    )
  })
})

describe('resolveSubphase — Vorbereitung re-based (lead + claim + Termin)', () => {
  it('2.4 FIN-Call ausstehend (lead.fin, ohne cardentity_enriched_at)', () => {
    const r = resolveSubphase({ lead: lead({ fin: 'WVWZZZ1234567890' }), now: NOW })
    expect(r.subphase).toBe('2.4')
  })

  it('2.3 ZB1 hochgeladen (lead.zb1_status), FIN offen', () => {
    const r = resolveSubphase({ lead: lead({ zb1_status: 'hochgeladen' }), now: NOW })
    expect(r.subphase).toBe('2.3')
  })

  it('2.2 Vollmacht bestätigt (claim.vollmacht_status)', () => {
    const r = resolveSubphase({ claim: claim({ vollmacht_status: 'bestaetigt' }), now: NOW })
    expect(r.subphase).toBe('2.2')
  })

  it('2.1 Vollmacht ausstehend (claim.sa_unterschrieben_am + service_typ=komplett)', () => {
    const r = resolveSubphase({
      claim: claim({ sa_unterschrieben_am: '2026-04-10T00:00:00Z', service_typ: 'komplett', vollmacht_status: 'ausstehend' }),
      now: NOW,
    })
    expect(r.subphase).toBe('2.1')
  })
})

describe('resolveSubphase — Trigger-Fields + next_hint', () => {
  it('liefert Trigger-Fields für 6b mit allen Kürzungs-Metadaten', () => {
    const r = resolveSubphase({
      kanzleiFall: kf({ vs_reaktion_typ: 'gekuerzt', kuerzungs_betrag: 1800, vs_kuerzung_grund: 'Stundenverrechnungssatz', vs_kuerzungs_typ: 'technisch' }),
      now: NOW,
    })
    const names = r.trigger_fields.map((t) => t.name)
    expect(names).toContain('vs_reaktion_typ')
    expect(names).toContain('kuerzungs_betrag')
    expect(names).toContain('vs_kuerzung_grund')
    expect(names).toContain('vs_kuerzungs_typ')
  })

  it('liefert next_hint passend zur Subphase', () => {
    const r = resolveSubphase({ kanzleiFall: kf({ vs_reaktion_typ: 'quotiert', vs_quote_prozent: 60 }), now: NOW })
    expect(r.next_hint).toContain('Quote')
  })
})

// WS6/Kasko-Fix (17.07.): Direct-Reparatur-Gate — kasko/selbstzahler haben keinen
// SV-/Kanzlei-Prozess; der Resolver zeigte die §8-SA-/Termin-Strecke. Phase 9 gewinnt weiter.
describe('resolveSubphase — Direct-Reparatur (kasko/selbstzahler)', () => {
  it('kasko ohne Werkstatt -> r.1 Werkstattwahl offen', () => {
    const r = resolveSubphase({ claim: claim({ abrechnungsweg: 'kasko' }), now: NOW })
    expect(r.phase).toBe(1)
    expect(r.subphase).toBe('r.1')
    expect(r.label).toContain('Werkstattwahl')
  })

  it('selbstzahler + Werkstatt -> r.2; rt angefragt -> r.2; bestaetigt -> r.3; erledigt -> r.4', () => {
    expect(resolveSubphase({ claim: claim({ abrechnungsweg: 'selbstzahler', reparatur_werkstatt_id: 'w-1' }), now: NOW }).subphase).toBe('r.2')
    expect(resolveSubphase({ claim: claim({ abrechnungsweg: 'kasko' }), reparatur_termine: [{ status: 'angefragt' }], now: NOW }).subphase).toBe('r.2')
    expect(resolveSubphase({ claim: claim({ abrechnungsweg: 'kasko' }), reparatur_termine: [{ status: 'bestaetigt' }], now: NOW }).subphase).toBe('r.3')
    expect(resolveSubphase({ claim: claim({ abrechnungsweg: 'kasko' }), reparatur_termine: [{ status: 'erledigt' }], now: NOW }).subphase).toBe('r.4')
  })

  it('abgeschlossen_am gewinnt weiter (Phase 9 vor R-Gate)', () => {
    const r = resolveSubphase({
      claim: claim({ abrechnungsweg: 'kasko', abgeschlossen_am: '2026-04-01T00:00:00Z', google_review_gesendet: true }),
      now: NOW,
    })
    expect(r.phase).toBe(9)
  })

  it('haftpflicht bleibt auf der §8-Strecke (kein R-Gate)', () => {
    const r = resolveSubphase({ claim: claim({ abrechnungsweg: 'haftpflicht' }), now: NOW })
    expect(r.subphase).not.toMatch(/^r\./)
  })
})
