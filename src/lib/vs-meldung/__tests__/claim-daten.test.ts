import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = {
  claim: null as Record<string, unknown> | null,
  parties: [] as Array<Record<string, unknown>>,
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
          eq: async () => ({ data: db.parties, error: null }),
        }),
      }
    },
  }),
}))

beforeEach(() => {
  db.claim = null
  db.parties = []
})

describe('ladeVsMeldungDaten', () => {
  it('mappt Claim + Parteien in die Melde-Struktur', async () => {
    db.claim = {
      id: 'c1',
      claim_nummer: 'CLM-2026-00635',
      unfall_datum: '2026-07-13',
      hergang_kunde_text: 'Gegner fuhr auf.',
      gegner_versicherung_id: 'v1',
    }
    db.parties = [
      {
        rolle: 'geschaedigter',
        kennzeichen: 'B-FL 202',
        firmen: { name: 'Test-Flotte GmbH' },
        vehicles: { hersteller: 'BMW', modell: '320d' },
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
    db.claim = { id: 'c1', claim_nummer: null, unfall_datum: null, hergang_kunde_text: null, gegner_versicherung_id: null }
    db.parties = [
      { rolle: 'geschaedigter', firmen: [{ name: 'Array-Firma GmbH' }], vehicles: [{ hersteller: 'VW', modell: 'Golf' }] },
      { rolle: 'verursacher', personen: [{ vorname: 'Erika', nachname: 'Musterfrau' }] },
    ]

    const { ladeVsMeldungDaten } = await import('../claim-daten')
    const d = await ladeVsMeldungDaten('c1')

    expect(d!.geschaedigt.firmaName).toBe('Array-Firma GmbH')
    expect(d!.geschaedigt.fahrzeug).toBe('VW Golf')
    expect(d!.gegner.name).toBe('Erika Musterfrau')
  })

  it('Platzhalter-Hersteller "Unbekannt" wird nicht als Fahrzeugname ausgegeben', async () => {
    db.claim = { id: 'c1', claim_nummer: null, unfall_datum: null, hergang_kunde_text: null, gegner_versicherung_id: null }
    db.parties = [{ rolle: 'geschaedigter', vehicles: { hersteller: 'Unbekannt', modell: null } }]

    const { ladeVsMeldungDaten } = await import('../claim-daten')
    const d = await ladeVsMeldungDaten('c1')
    expect(d!.geschaedigt.fahrzeug).toBeNull()
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
