import { describe, it, expect } from 'vitest'
import {
  normalisiereBezug,
  buildSummary,
  buildDescription,
  resolveTerminKontext,
  type KontextFelder,
} from './kalender-kontext'

const LEERFELDER: KontextFelder = {
  claimNummer: null,
  fahrzeugHersteller: null,
  fahrzeugModell: null,
  kennzeichen: null,
  kundeName: null,
  kundeTelefon: null,
  schadenortAdresse: null,
  fallId: null,
}

// DB-Stub: liefert die claims-Zeile fuer .from('claims'), sonst null. ladeKunde
// (leads/profiles) wird mit lead_id=null + geschaedigter=null gar nicht erst getriggert.
const claimDbStub = (claim: Record<string, unknown> | null) =>
  ({
    from: (t: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: t === 'claims' ? claim : null }) }),
      }),
    }),
  }) as never

// CMM-50: DB-Stub der NUR fuer v_claim_full eine Zeile liefert (faelle → null). Damit faellt der
// alte faelle-Reader auf LEER (RED), der neue vcf-Reader liefert reichen Kontext (GREEN).
const vcfDbStub = (row: Record<string, unknown> | null) =>
  ({
    from: (t: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: t === 'v_claim_full' ? row : null }) }),
      }),
    }),
  }) as never

describe('normalisiereBezug — faelle-freier bezug-Fallback (claim_id → lead_id)', () => {
  it('explizites bezug hat Vorrang vor claim_id', () => {
    expect(normalisiereBezug({ bezug_typ: 'claim', bezug_id: 'B', claim_id: 'C', lead_id: 'L' })).toEqual({
      typ: 'claim',
      id: 'B',
    })
  })
  it('faellt auf claim_id zurueck wenn bezug fehlt', () => {
    expect(normalisiereBezug({ bezug_typ: null, bezug_id: null, claim_id: 'C', lead_id: 'L' })).toEqual({
      typ: 'claim',
      id: 'C',
    })
  })
  it('faellt auf lead_id zurueck wenn weder bezug noch claim_id gesetzt', () => {
    expect(normalisiereBezug({ bezug_typ: null, bezug_id: null, claim_id: null, lead_id: 'L' })).toEqual({
      typ: 'lead',
      id: 'L',
    })
  })
  it('leer wenn nichts gesetzt', () => {
    expect(normalisiereBezug({ bezug_typ: null, bezug_id: null })).toEqual({ typ: null, id: null })
  })
  it('bezug_id ohne bezug_typ ist unvollstaendig → claim_id-Fallback', () => {
    expect(normalisiereBezug({ bezug_typ: null, bezug_id: 'B', claim_id: 'C' })).toEqual({ typ: 'claim', id: 'C' })
  })
})

describe('buildSummary', () => {
  it('rich: "Fahrzeug (Kennzeichen) — Ort · Claim-Nr"', () => {
    expect(
      buildSummary(
        { ...LEERFELDER, fahrzeugHersteller: 'VW', fahrzeugModell: 'Golf', kennzeichen: 'K-AB 123', claimNummer: 'CMD-7' },
        'Domstr. 1',
      ),
    ).toBe('VW Golf (K-AB 123) — Domstr. 1 · CMD-7')
  })
  it('degradiert ohne Fahrzeug auf "Schadenbesichtigung"', () => {
    expect(buildSummary({ ...LEERFELDER }, null)).toBe('Schadenbesichtigung')
  })
  it('location hat Vorrang vor schadenortAdresse', () => {
    expect(buildSummary({ ...LEERFELDER, schadenortAdresse: 'Schadenstr. 9' }, 'Werkstatt 5')).toBe(
      'Schadenbesichtigung — Werkstatt 5',
    )
  })
})

describe('buildDescription', () => {
  it('enthaelt den Fallakte-Link nur wenn fallId gesetzt ist', () => {
    const mit = buildDescription({ ...LEERFELDER, fallId: 'abc' }, null, 'https://x.de')
    expect(mit).toContain('Fallakte: https://x.de/gutachter/fall/abc')
    const ohne = buildDescription({ ...LEERFELDER }, null, 'https://x.de')
    expect(ohne).not.toContain('Fallakte:')
  })
  it('listet Kunde/Telefon/Kennzeichen/Fahrzeug/Adresse wenn vorhanden', () => {
    const d = buildDescription(
      { ...LEERFELDER, kundeName: 'Max M.', kundeTelefon: '0170', kennzeichen: 'K-AB 1', fahrzeugHersteller: 'VW', fahrzeugModell: 'Golf' },
      'Domstr. 1',
      'https://x.de',
    )
    expect(d).toContain('Kunde: Max M.')
    expect(d).toContain('Telefon: 0170')
    expect(d).toContain('Kennzeichen: K-AB 1')
    expect(d).toContain('Fahrzeug: VW Golf')
    expect(d).toContain('Adresse: Domstr. 1')
  })
})

describe('resolveTerminKontext — Delegation-Sicherheit (bezug-Fallback end-to-end)', () => {
  it('bezuglos aber claim_id → reicher claim-Kontext statt generischem Titel', async () => {
    const db = claimDbStub({
      claim_nummer: 'CMD-2026-0042',
      schadenort_adresse: 'Hauptstr. 1, Köln',
      schadenort_ort: 'Köln',
      lead_id: null,
      geschaedigter_user_id: null,
    })
    const kontext = await resolveTerminKontext(
      { bezug_typ: null, bezug_id: null, claim_id: 'claim-123', lead_id: null, besichtigungsort_adresse: null },
      db,
    )
    expect(kontext.summary).toContain('CMD-2026-0042')
    expect(kontext.summary).toContain('Hauptstr. 1, Köln')
    expect(kontext.location).toBe('Hauptstr. 1, Köln')
  })

  it('besichtigungsort_adresse hat Vorrang als location', async () => {
    const db = claimDbStub({
      claim_nummer: 'CMD-1',
      schadenort_adresse: 'Schadenstr. 9',
      schadenort_ort: null,
      lead_id: null,
      geschaedigter_user_id: null,
    })
    const kontext = await resolveTerminKontext(
      { bezug_typ: 'claim', bezug_id: 'c1', claim_id: null, lead_id: null, besichtigungsort_adresse: 'Werkstatt-Adresse 5' },
      db,
    )
    expect(kontext.location).toBe('Werkstatt-Adresse 5')
    expect(kontext.summary).toContain('Werkstatt-Adresse 5')
  })

  it('voellig bezuglos (kein claim/lead/fall) → generischer Titel, kein Crash', async () => {
    const db = claimDbStub(null)
    const kontext = await resolveTerminKontext(
      { bezug_typ: null, bezug_id: null, claim_id: null, lead_id: null, besichtigungsort_adresse: null },
      db,
    )
    expect(kontext.summary).toBe('Schadenbesichtigung')
    expect(kontext.description).toContain('Claimondo-Auftrag')
    expect(kontext.location).toBeUndefined()
  })
})

describe('resolveTerminKontext — fall-bezug liest v_claim_full (CMM-50, vehicles-SSoT)', () => {
  it('fall-bezug → Fahrzeug/Kennzeichen/Claim-Nr/Ort aus v_claim_full (nicht faelle)', async () => {
    const db = vcfDbStub({
      kennzeichen: 'K-XY 99',
      fahrzeug_hersteller: 'BMW',
      fahrzeug_modell: 'X3',
      claim_nummer: 'CMD-2026-0001',
      schadenort_adresse: 'Ringstr. 2, Köln',
      schadenort_ort: 'Köln',
      lead_id: null,
      kunde_id: null,
    })
    const kontext = await resolveTerminKontext(
      { bezug_typ: 'fall', bezug_id: 'fall-1', claim_id: null, lead_id: null, besichtigungsort_adresse: null },
      db,
    )
    expect(kontext.summary).toBe('BMW X3 (K-XY 99) — Ringstr. 2, Köln · CMD-2026-0001')
    expect(kontext.location).toBe('Ringstr. 2, Köln')
    expect(kontext.description).toContain('Kennzeichen: K-XY 99')
    expect(kontext.description).toContain('Fahrzeug: BMW X3')
  })

  it('fall-bezug ohne vcf-Treffer → generisch, kein Crash, fallId-Deep-Link bleibt', async () => {
    const db = vcfDbStub(null)
    const kontext = await resolveTerminKontext(
      { bezug_typ: 'fall', bezug_id: 'fall-x', claim_id: null, lead_id: null, besichtigungsort_adresse: null },
      db,
    )
    expect(kontext.summary).toBe('Schadenbesichtigung')
    expect(kontext.description).toContain('Fallakte:') // fallId gesetzt → Deep-Link
  })
})
