// AAR-538 (C1): Unit-Tests für resolveSubphase
// Deckt alle 6 Erweiterungen aus dem AAR-538 Kommentar + Kern-Pfade ab.

import { describe, it, expect } from 'vitest'
import { resolveSubphase, type FallRow } from './subphase-resolver'

const baseFall = (overrides: Partial<FallRow> = {}): FallRow => ({
  id: 'test-fall-id',
  status: 'ersterfassung',
  ...overrides,
})

const NOW = new Date('2026-04-19T12:00:00Z')

describe('resolveSubphase — Erweiterung 1: Quotierung 6f.x', () => {
  it('6f.1 Quote angekündigt', () => {
    const r = resolveSubphase({
      fall: baseFall({ vs_reaktion_typ: 'quotiert', vs_quote_prozent: 60 }),
      now: NOW,
    })
    expect(r.phase).toBe(6)
    expect(r.subphase).toBe('6f.1')
  })

  it('6f.2 Quote akzeptiert', () => {
    const r = resolveSubphase({
      fall: baseFall({
        vs_reaktion_typ: 'quotiert',
        vs_quote_prozent: 60,
        vs_quote_akzeptiert_am: '2026-04-10T00:00:00Z',
      }),
      now: NOW,
    })
    expect(r.subphase).toBe('6f.2')
  })

  it('6f.3 Quote ausgezahlt', () => {
    const r = resolveSubphase({
      fall: baseFall({
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

describe('resolveSubphase — Erweiterung 2: Rüge-2-SLA 7.5a / 7.5b', () => {
  it('7.5a — Rüge 2 versendet, 3d her → warten', () => {
    const r = resolveSubphase({
      fall: baseFall({
        ruege_counter: 2,
        ruege_gesendet_am: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      now: NOW,
    })
    expect(r.subphase).toBe('7.5a')
  })

  it('7.5b — Rüge 2 versendet, 8d her → Breach', () => {
    const r = resolveSubphase({
      fall: baseFall({
        ruege_counter: 2,
        ruege_gesendet_am: new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      now: NOW,
    })
    expect(r.subphase).toBe('7.5b')
  })
})

describe('resolveSubphase — Erweiterung 3: Stellungnahme-Conditional', () => {
  it('7.1 bei technisch', () => {
    const r = resolveSubphase({
      fall: baseFall({ technische_stellungnahme_status: 'beauftragt', vs_kuerzungs_typ: 'technisch' }),
      now: NOW,
    })
    expect(r.subphase).toBe('7.1')
  })

  it('7.1 bei gemischt', () => {
    const r = resolveSubphase({
      fall: baseFall({ technische_stellungnahme_status: 'beauftragt', vs_kuerzungs_typ: 'gemischt' }),
      now: NOW,
    })
    expect(r.subphase).toBe('7.1')
  })

  it('argumentativ springt NICHT in 7.1 (fällt auf 6b durch)', () => {
    const r = resolveSubphase({
      fall: baseFall({
        technische_stellungnahme_status: 'beauftragt',
        vs_kuerzungs_typ: 'argumentativ',
        vs_reaktion_typ: 'gekuerzt',
        kuerzungs_betrag: 1500,
      }),
      now: NOW,
    })
    expect(r.subphase).toBe('6b')
  })
})

describe('resolveSubphase — Erweiterung 4: kb_filmcheck_bestanden Event', () => {
  it('4.5 wenn Webhook-Event vorhanden', () => {
    const r = resolveSubphase({
      fall: baseFall({ filmcheck_ok: true }),
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
      fall: baseFall({ filmcheck_ok: true }),
      now: NOW,
    })
    expect(r.subphase).toBe('4.4')
  })
})

describe('resolveSubphase — Erweiterung 5: Auszahlungs-Split 8.1/8.2a/8.2b/8.3', () => {
  it('8.1 beide offen', () => {
    const r = resolveSubphase({
      fall: baseFall({ regulierung_betrag: 5000 }),
      now: NOW,
    })
    expect(r.subphase).toBe('8.1')
  })

  it('8.2a Kunde gezahlt, SV offen', () => {
    const r = resolveSubphase({
      fall: baseFall({
        regulierung_betrag: 5000,
        auszahlung_kunde_eingegangen_am: '2026-04-15T00:00:00Z',
      }),
      now: NOW,
    })
    expect(r.subphase).toBe('8.2a')
  })

  it('8.2b SV gezahlt, Kunde offen', () => {
    const r = resolveSubphase({
      fall: baseFall({
        regulierung_betrag: 5000,
        auszahlung_gutachter_eingegangen_am: '2026-04-15T00:00:00Z',
      }),
      now: NOW,
    })
    expect(r.subphase).toBe('8.2b')
  })

  it('8.3 beide gezahlt', () => {
    const r = resolveSubphase({
      fall: baseFall({
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
  it('6a VS reguliert', () => {
    const r = resolveSubphase({
      fall: baseFall({ vs_reaktion_typ: 'voll_reguliert' }),
      now: NOW,
    })
    expect(r.subphase).toBe('6a')
  })

  it('6b VS kürzt', () => {
    const r = resolveSubphase({
      fall: baseFall({ vs_reaktion_typ: 'gekuerzt', kuerzungs_betrag: 1200 }),
      now: NOW,
    })
    expect(r.subphase).toBe('6b')
  })

  it('6c VS lehnt ab', () => {
    const r = resolveSubphase({
      fall: baseFall({ vs_reaktion_typ: 'abgelehnt' }),
      now: NOW,
    })
    expect(r.subphase).toBe('6c')
  })

  it('6d VS schweigt 14d', () => {
    const r = resolveSubphase({
      fall: baseFall({
        anschlussschreiben_sendedatum: new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      now: NOW,
    })
    expect(r.subphase).toBe('6d')
  })

  it('9.1 Fall geschlossen', () => {
    const r = resolveSubphase({
      fall: baseFall({ abgeschlossen_am: '2026-04-18T00:00:00Z', google_review_gesendet: true }),
      now: NOW,
    })
    expect(r.subphase).toBe('9.1')
  })

  it('Fallback 1 bei unbekanntem Status', () => {
    const r = resolveSubphase({ fall: baseFall(), now: NOW })
    expect(r.phase).toBe(1)
    expect(r.subphase).toBe('1')
  })
})

describe('resolveSubphase — Trigger-Fields + next_hint', () => {
  it('liefert Trigger-Fields für 6b mit allen Kürzungs-Metadaten', () => {
    const r = resolveSubphase({
      fall: baseFall({
        vs_reaktion_typ: 'gekuerzt',
        kuerzungs_betrag: 1800,
        vs_kuerzung_grund: 'Stundenverrechnungssatz',
        vs_kuerzungs_typ: 'technisch',
      }),
      now: NOW,
    })
    const names = r.trigger_fields.map((t) => t.name)
    expect(names).toContain('vs_reaktion_typ')
    expect(names).toContain('kuerzungs_betrag')
    expect(names).toContain('vs_kuerzung_grund')
    expect(names).toContain('vs_kuerzungs_typ')
  })

  it('liefert next_hint passend zur Subphase', () => {
    const r = resolveSubphase({
      fall: baseFall({ vs_reaktion_typ: 'quotiert', vs_quote_prozent: 60 }),
      now: NOW,
    })
    expect(r.next_hint).toContain('Quote')
  })
})
