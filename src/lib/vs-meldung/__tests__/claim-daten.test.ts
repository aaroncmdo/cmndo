import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = {
  claim: null as Record<string, unknown> | null,
  parties: [] as Array<Record<string, unknown>>,
  partiesError: null as { message: string } | null,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'claims') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: db.claim, error: null }) }),
          }),
        }
      }
      // claim_parties: .select(...).eq(...) ist direkt awaitable (Liste)
      return {
        select: () => ({
          eq: async () => ({ data: db.parties, error: db.partiesError }),
        }),
      }
    },
  }),
}))

beforeEach(() => {
  db.claim = null
  db.parties = []
  db.partiesError = null
})

describe('ladeVsMeldungDaten', () => {
  it('mappt Claim + Parteien in die Melde-Struktur', async () => {
    db.claim = {
      id: 'c1',
      claim_nummer: 'CLM-2026-00635',
      schadentag: '2026-07-13',
      hergang_kunde_text: 'Gegner fuhr auf.',
      gegner_versicherung_id: 'v1',
    }
    // ECHTE Spaltennamen: vehicles hat modell_haupttyp (kein 'modell') + kennzeichen_aktuell.
    db.parties = [
      {
        rolle: 'geschaedigter',
        kennzeichen: 'B-FL 202',
        firmen: { name: 'Test-Flotte GmbH' },
        vehicles: { hersteller: 'BMW', modell_haupttyp: '320d', kennzeichen_aktuell: 'B-FL 202' },
      },
      {
        rolle: 'verursacher',
        kennzeichen: 'B-XX 9999',
        versicherungsnummer: 'POL-123',
        versicherungs_aktenzeichen: 'AZ-9',
        personen: { vorname: 'Max', nachname: 'Mustermann' },
      },
    ]

    const { ladeVsMeldungDaten } = await import('../claim-daten')
    const d = await ladeVsMeldungDaten('c1')

    expect(d).not.toBeNull()
    expect(d!.claimNummer).toBe('CLM-2026-00635')
    expect(d!.gegnerVersicherungId).toBe('v1') // Task 7 liest sie hier — kein zweiter Query
    expect(d!.geschaedigt.firmaName).toBe('Test-Flotte GmbH')
    expect(d!.geschaedigt.kennzeichen).toBe('B-FL 202')
    expect(d!.geschaedigt.fahrzeug).toBe('BMW 320d')
    expect(d!.gegner.name).toBe('Max Mustermann')
    expect(d!.gegner.kennzeichen).toBe('B-XX 9999')
    expect(d!.gegner.versicherungsnummer).toBe('POL-123')
    expect(d!.gegner.versicherungsAktenzeichen).toBe('AZ-9')
    expect(d!.hergang).toBe('Gegner fuhr auf.')
  })

  it('normalisiert eingebettete Relationen, die als Array kommen (Supabase-Cardinality)', async () => {
    db.claim = { id: 'c1', claim_nummer: null, schadentag: null, hergang_kunde_text: null, gegner_versicherung_id: null }
    db.parties = [
      { rolle: 'geschaedigter', firmen: [{ name: 'Array-Firma GmbH' }], vehicles: [{ hersteller: 'VW', modell_haupttyp: 'Golf' }] },
      { rolle: 'verursacher', personen: [{ vorname: 'Erika', nachname: 'Musterfrau' }] },
    ]

    const { ladeVsMeldungDaten } = await import('../claim-daten')
    const d = await ladeVsMeldungDaten('c1')

    expect(d!.geschaedigt.firmaName).toBe('Array-Firma GmbH')
    expect(d!.geschaedigt.fahrzeug).toBe('VW Golf')
    expect(d!.gegner.name).toBe('Erika Musterfrau')
  })

  it('Platzhalter-Hersteller "Unbekannt" wird nicht als Fahrzeugname ausgegeben', async () => {
    db.claim = { id: 'c1', claim_nummer: null, schadentag: null, hergang_kunde_text: null, gegner_versicherung_id: null }
    db.parties = [{ rolle: 'geschaedigter', vehicles: { hersteller: 'Unbekannt', modell_haupttyp: null } }]

    const { ladeVsMeldungDaten } = await import('../claim-daten')
    const d = await ladeVsMeldungDaten('c1')
    expect(d!.geschaedigt.fahrzeug).toBeNull()
  })

  it('nutzt kennzeichen_aktuell des Fahrzeugs, wenn claim_parties.kennzeichen NULL ist', async () => {
    db.claim = { id: 'c1', claim_nummer: null, schadentag: null, hergang_kunde_text: null, gegner_versicherung_id: null }
    db.parties = [{ rolle: 'geschaedigter', kennzeichen: null, vehicles: { kennzeichen_aktuell: 'B-FL 202' } }]

    const { ladeVsMeldungDaten } = await import('../claim-daten')
    const d = await ladeVsMeldungDaten('c1')
    expect(d!.geschaedigt.kennzeichen).toBe('B-FL 202')
  })

  it('bei einem Parteien-Query-Fehler -> null (NIE mit leeren Parteien senden)', async () => {
    db.claim = { id: 'c1', claim_nummer: 'CLM-1', schadentag: null, hergang_kunde_text: null, gegner_versicherung_id: 'v1' }
    db.partiesError = { message: 'column vehicles.modell does not exist' }

    const { ladeVsMeldungDaten } = await import('../claim-daten')
    // Der Claim existiert, aber ohne Parteien darf keine Meldung entstehen:
    expect(await ladeVsMeldungDaten('c1')).toBeNull()
  })

  it('unbekannter Claim -> null', async () => {
    const { ladeVsMeldungDaten } = await import('../claim-daten')
    expect(await ladeVsMeldungDaten('gibts-nicht')).toBeNull()
  })
})

describe('UnfallmeldungVs — Betreff', () => {
  // Grosszuegiger Timeout: der Import zieht react-email rein, was bei kaltem Transform-Cache
  // (CI!) deutlich laenger braucht als das 5s-Default — sonst flaket der Test nur dort.
  it('nennt Kennzeichen des Gegners und die Police', { timeout: 30_000 }, async () => {
    const { subject } = await import('@/lib/email/google/templates/UnfallmeldungVs')
    const s = subject({
      claimId: 'c1',
      claimNummer: 'CLM-2026-00635',
      unfallDatum: '2026-07-13',
      hergang: null,
      gegnerVersicherungId: 'v1',
      geschaedigt: { firmaName: 'Test-Flotte GmbH', kennzeichen: 'B-FL 202', fahrzeug: null },
      gegner: {
        name: 'Max Mustermann',
        kennzeichen: 'B-XX 9999',
        versicherungsnummer: 'POL-123',
        versicherungsAktenzeichen: null,
      },
    })
    expect(s).toContain('B-XX 9999')
    expect(s).toContain('POL-123')
    expect(s).toMatch(/Schadenmeldung|Haftpflichtschaden/)
  })
})
