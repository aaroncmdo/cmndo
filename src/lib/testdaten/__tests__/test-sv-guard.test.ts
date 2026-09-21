import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  entscheideTestSvGuard,
  pruefeTestSvKonsistenz,
  istInternesTelefon,
  istDummyTelefon,
  pruefeSendeIsolation,
} from '../test-sv-guard'

// Der Guard sitzt in reserviere() (der einen Buchungs-Chokepoint) und verhindert, dass
// eine interne/Test-Buchung einen echten SV erreicht (und umgekehrt ein echter Kunde einen
// Test-SV). Kern ist die reine Konsistenz-Matrix; das DB-Plumbing ist duennes Glue.
describe('entscheideTestSvGuard — Konsistenz-Matrix (Lead x SV)', () => {
  it('blockt internen/Test-Lead auf ECHTEM SV (genau der Vorfall)', () => {
    expect(entscheideTestSvGuard(true, false).blockieren).toBe(true)
  })
  it('blockt echten Lead auf TEST-SV (umgekehrtes Leck)', () => {
    expect(entscheideTestSvGuard(false, true).blockieren).toBe(true)
  })
  it('laesst intern -> Test durch (Smokes funktionieren weiter)', () => {
    expect(entscheideTestSvGuard(true, true).blockieren).toBe(false)
  })
  it('laesst echt -> echt durch (Normalbetrieb)', () => {
    expect(entscheideTestSvGuard(false, false).blockieren).toBe(false)
  })
})

type Row = { data: Record<string, unknown> | null; error: unknown }
function fakeDb(handlers: Record<string, () => Row>): SupabaseClient {
  const builder = (table: string): unknown => ({
    select: () => builder(table),
    eq: () => builder(table),
    // order/limit: vom claim_parties-Fallback der Identitaets-Aufloesung genutzt.
    order: () => builder(table),
    limit: () => builder(table),
    maybeSingle: async () => (handlers[table] ? handlers[table]() : { data: null, error: null }),
  })
  return { from: (table: string) => builder(table) } as unknown as SupabaseClient
}

describe('pruefeTestSvKonsistenz — bezug-Aufloesung + fail-open', () => {
  it('blockt internen Lead (@claimondo.de) auf echtem SV', async () => {
    const db = fakeDb({
      sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
      leads: () => ({ data: { email: 'aaron.sprafke@claimondo.de', vorname: 'Aaron', nachname: 'Sprafke' }, error: null }),
    })
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'lead', id: 'lead-1' })
    expect(res.blockieren).toBe(true)
    expect(res.grund).toBeTruthy()
  })

  it('laesst echten Lead (icloud.com) auf echtem SV durch', async () => {
    const db = fakeDb({
      sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
      leads: () => ({ data: { email: 'anja.harig@icloud.com', vorname: 'Anja', nachname: 'Harig' }, error: null }),
    })
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'lead', id: 'lead-1' })
    expect(res.blockieren).toBe(false)
  })

  it('loest claim -> lead_id -> lead auf', async () => {
    const db = fakeDb({
      sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
      claims: () => ({ data: { lead_id: 'lead-9' }, error: null }),
      leads: () => ({ data: { email: 'info@claimondo.de', vorname: 'Nicolas', nachname: 'Kitta' }, error: null }),
    })
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'claim', id: 'claim-1' })
    expect(res.blockieren).toBe(true)
  })

  it('kein bezug -> nicht blockieren', async () => {
    const db = fakeDb({})
    expect((await pruefeTestSvKonsistenz(db, 'sv-1', null)).blockieren).toBe(false)
  })

  // E2E-Wegwerf-Fixture (Mig 20260812152026): ein SV, der fuers MATCHING echt sein muss
  // (ist_testaccount=false, sonst filtert ihn applyDispatchableFilter raus), fuer den Guard
  // aber als Test zaehlt. Ohne diesen Zweig war der Finder-Buchungspfad auf prod nicht
  // smokebar — interner Bucher + echter SV = BLOCK, und beide Seiten sind im Test nicht frei
  // waehlbar (s. memory/BROADCAST-finder-buchung-prod-nicht-smokebar.md).
  it('laesst internen Lead auf einer E2E-WEGWERF-FIXTURE durch (ist_testaccount=false!)', async () => {
    const db = fakeDb({
      sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
      e2e_test_fixtures: () => ({ data: { sv_id: 'sv-1' }, error: null }),
      leads: () => ({ data: { email: 'e2e-finder-123@claimondo.de', vorname: 'E2e', nachname: 'Smoke' }, error: null }),
    })
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'lead', id: 'lead-1' })
    expect(res.blockieren).toBe(false)
  })

  // Die Gegenprobe ist die eigentliche Sicherheitsaussage: die Fixture oeffnet NUR fuer
  // interne Identitaeten. Ein echter Kunde darf auf ihr weiterhin NICHT landen.
  it('blockt einen ECHTEN Kunden auf einer E2E-Wegwerf-Fixture (echt -> Test)', async () => {
    const db = fakeDb({
      sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
      e2e_test_fixtures: () => ({ data: { sv_id: 'sv-1' }, error: null }),
      leads: () => ({ data: { email: 'anja.harig@icloud.com', vorname: 'Anja', nachname: 'Harig' }, error: null }),
    })
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'lead', id: 'lead-1' })
    expect(res.blockieren).toBe(true)
  })

  // Und der Vorfall-Schutz bleibt: ein SV, der NICHT als Fixture eingetragen ist, ist fuer
  // interne Buchungen weiterhin gesperrt — genau der Fall vom 03.07.
  it('blockt internen Lead auf echtem SV OHNE Fixture-Eintrag (Vorfall-Schutz intakt)', async () => {
    const db = fakeDb({
      sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
      e2e_test_fixtures: () => ({ data: null, error: null }),
      leads: () => ({ data: { email: 'aaron.sprafke@claimondo.de', vorname: 'Aaron', nachname: 'Sprafke' }, error: null }),
    })
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'lead', id: 'lead-1' })
    expect(res.blockieren).toBe(true)
  })

  // Fallback-Achse (11.08.): 30/79 prod-Claims haben KEINE lead_id — dort war der Guard blind
  // und liess intern<->echt durch (belegt an CLM-2026-01011). 26 davon sind ueber den
  // Geschaedigten der claim_parties aufloesbar.
  it('claim OHNE lead_id -> Fallback claim_parties.user_id -> profiles (blockt intern auf echtem SV)', async () => {
    const db = fakeDb({
      sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
      claims: () => ({ data: { lead_id: null }, error: null }),
      claim_parties: () => ({ data: { user_id: 'user-1', person_id: null }, error: null }),
      profiles: () => ({ data: { email: 'smoke-kunde@claimondo.de', vorname: 'Smoke', nachname: 'Kunde' }, error: null }),
    })
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'fall', id: 'claim-1' })
    expect(res.blockieren).toBe(true)
  })

  it('claim OHNE lead_id -> Fallback ueber person_id -> personen (Gast ohne Account)', async () => {
    const db = fakeDb({
      sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
      claims: () => ({ data: { lead_id: null }, error: null }),
      claim_parties: () => ({ data: { user_id: null, person_id: 'pers-1' }, error: null }),
      personen: () => ({ data: { email: 'aaron.sprafke+smokeq@claimondo.de', vorname: 'Smoke', nachname: 'Quali' }, error: null }),
    })
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'fall', id: 'claim-1' })
    expect(res.blockieren).toBe(true)
  })

  it('claim OHNE lead_id und OHNE party -> fail-open (echter Kunde wird nie ausgesperrt)', async () => {
    const db = fakeDb({
      sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
      claims: () => ({ data: { lead_id: null }, error: null }),
      claim_parties: () => ({ data: null, error: null }),
    })
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'fall', id: 'claim-1' })
    expect(res.blockieren).toBe(false)
  })

  it('Fallback erkennt echten Kunden korrekt als extern (kein False-Positive-Block)', async () => {
    const db = fakeDb({
      sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
      claims: () => ({ data: { lead_id: null }, error: null }),
      claim_parties: () => ({ data: { user_id: 'user-2', person_id: null }, error: null }),
      profiles: () => ({ data: { email: 'anja.harig@icloud.com', vorname: 'Anja', nachname: 'Harig' }, error: null }),
    })
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'fall', id: 'claim-1' })
    expect(res.blockieren).toBe(false)
  })

  it('fail-open: Lookup-Fehler blockt nie eine Buchung', async () => {
    const db = { from() { throw new Error('db down') } } as unknown as SupabaseClient
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'lead', id: 'lead-1' })
    expect(res.blockieren).toBe(false)
  })
})

// Fake fuer .select().ilike() -> Array-Rueckgabe (istInternesTelefon)
function fakeDbList(handlers: Record<string, Array<Record<string, unknown>>>): SupabaseClient {
  const builder = (table: string): unknown => ({
    select: () => builder(table),
    ilike: async () => ({ data: handlers[table] ?? [], error: null }),
  })
  return { from: (table: string) => builder(table) } as unknown as SupabaseClient
}

describe('istInternesTelefon — Telefon-Reverse-Lookup (Send-Guard)', () => {
  it('true wenn ein Lead/Profile mit dem Telefon eine interne Email hat', async () => {
    const db = fakeDbList({
      profiles: [],
      leads: [{ email: 'aaron.sprafke@claimondo.de', telefon: '+495205060708' }],
    })
    expect(await istInternesTelefon('+495205060708', db)).toBe(true)
  })
  it('false bei echtem externen Kunden', async () => {
    const db = fakeDbList({
      profiles: [{ email: 'anja.harig@icloud.com', telefon: '+491600000000' }],
      leads: [],
    })
    expect(await istInternesTelefon('+491600000000', db)).toBe(false)
  })
  it('false bei zu kurzer Nummer (kein Lookup-Versuch)', async () => {
    const db = fakeDbList({ profiles: [], leads: [] })
    expect(await istInternesTelefon('123', db)).toBe(false)
  })
  it('fail-open bei Lookup-Fehler', async () => {
    const db = { from() { throw new Error('db down') } } as unknown as SupabaseClient
    expect(await istInternesTelefon('+495205060708', db)).toBe(false)
  })
})

// 19.09.2026 — Befund B1 (Dashboard-Inventur): MCP-Probelaeufe legen Leads OHNE E-Mail an
// (nur Name + Telefon). Der Guard leitete "intern" bislang allein aus E-Mail/Platzhalter-Name
// ab — ein solcher Lead galt als ECHTER Kunde und reservierte fuenfmal beim echten Partner
// UnfallSafe (25./26.07., 19.09.). Die Telefonnummer ist die zweite Identitaetsachse.
describe('istDummyTelefon — Platzhalter-Nummern (reine Logik)', () => {
  it('erkennt aufsteigende Ziffernfolgen (+4915512345678)', () => {
    expect(istDummyTelefon('+4915512345678')).toBe(true)
  })
  it('erkennt Wiederholungen (000000 / 111111)', () => {
    expect(istDummyTelefon('+49 170 0000000')).toBe(true)
    expect(istDummyTelefon('+491711111111')).toBe(true)
  })
  it('erkennt die nicht vergebene Vorwahl 0123 / +49123', () => {
    expect(istDummyTelefon('+49123456789')).toBe(true)
    expect(istDummyTelefon('0123 987654')).toBe(true)
  })
  it('laesst echte Nummern durch', () => {
    expect(istDummyTelefon('+495205060708')).toBe(false)
    expect(istDummyTelefon('0176 22334455')).toBe(false)
    expect(istDummyTelefon('+380505954949')).toBe(false)
  })
  it('null/leer -> false', () => {
    expect(istDummyTelefon(null)).toBe(false)
    expect(istDummyTelefon('')).toBe(false)
  })
})

// Fake, der BEIDE Zugriffsformen kann: .maybeSingle() (Identitaets-Aufloesung) und
// .ilike() als Liste (Telefon-Reverse-Lookup).
function fakeDbBeides(
  single: Record<string, () => Row>,
  listen: Record<string, Array<Record<string, unknown>>>,
): SupabaseClient {
  const builder = (table: string): unknown => ({
    select: () => builder(table),
    eq: () => builder(table),
    order: () => builder(table),
    limit: () => builder(table),
    maybeSingle: async () => (single[table] ? single[table]() : { data: null, error: null }),
    ilike: async () => ({ data: listen[table] ?? [], error: null }),
  })
  return { from: (table: string) => builder(table) } as unknown as SupabaseClient
}

describe('pruefeTestSvKonsistenz — Telefon als zweite Identitaetsachse (B1, 19.09.)', () => {
  it('blockt Lead OHNE E-Mail mit Platzhalter-Telefon auf echtem SV (der MCP-Probelauf)', async () => {
    const db = fakeDbBeides(
      {
        sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
        leads: () => ({ data: { email: null, vorname: 'Petra', nachname: 'Winters', telefon: '+4915512345678' }, error: null }),
      },
      { profiles: [], leads: [] },
    )
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'lead', id: 'lead-1' })
    expect(res.blockieren).toBe(true)
  })

  it('blockt Lead OHNE E-Mail, dessen Telefon zu einem internen Konto gehoert', async () => {
    const db = fakeDbBeides(
      {
        sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
        leads: () => ({ data: { email: null, vorname: 'Jonas', nachname: 'Berger', telefon: '+495205060708' }, error: null }),
      },
      { profiles: [{ email: 'aaron.sprafke@claimondo.de', telefon: '+495205060708' }], leads: [] },
    )
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'lead', id: 'lead-1' })
    expect(res.blockieren).toBe(true)
  })

  it('laesst Lead OHNE E-Mail mit echter, unbekannter Nummer auf echtem SV durch (kein neuer False-Positive)', async () => {
    const db = fakeDbBeides(
      {
        sachverstaendige: () => ({ data: { ist_testaccount: false }, error: null }),
        leads: () => ({ data: { email: null, vorname: 'Anna', nachname: 'Winter', telefon: '+491573001122' }, error: null }),
      },
      { profiles: [], leads: [] },
    )
    const res = await pruefeTestSvKonsistenz(db, 'sv-1', { typ: 'lead', id: 'lead-1' })
    expect(res.blockieren).toBe(false)
  })
})


// ── pruefeSendeIsolation: die EINE Empfaenger-Pruefung der Versand-Leafs ──────────────
//
// Hintergrund (21.09.2026, auf prod gemessen): der DB-Zweig prueft die E-MAIL des Kontakts
// hinter der Nummer. Alle elf Platzhalter-Nummern im Bestand haben keine E-Mail — deshalb
// gingen 9 von 279 ausgehenden WhatsApps in 60 Tagen an Platzhalter-Nummern raus, alle mit
// Status 'zugestellt'. Die reine Nummern-Pruefung schliesst genau diese Luecke.
describe('pruefeSendeIsolation — Platzhalter UND interne Nummern', () => {
  // Bewusst KEINE neuen Nummern erfunden (Regel 7, Aaron 21.09.): alle hier verwendeten
  // stehen bereits in den Tests darueber.
  const INTERN = '+491735633541'
  const PLATZHALTER = '+491600000000' // sieben Nullen -> sechs-gleiche-Regel

  it('Platzhalter-Nummer wird unterdrueckt, Grund "dummy"', async () => {
    const db = fakeDbList({ profiles: [], leads: [] })
    await expect(pruefeSendeIsolation(PLATZHALTER, db)).resolves.toEqual({
      unterdruecken: true,
      grund: 'dummy',
      kennung: 'dummy-recipient-suppressed',
    })
  })

  it('bei einer Platzhalter-Nummer wird die Datenbank GAR NICHT erst befragt', async () => {
    // Positivkontrolle fuer die Reihenfolge: die reine Pruefung kommt zuerst.
    let befragt = 0
    const spion = {
      from: () => {
        befragt += 1
        return { select: () => ({ ilike: async () => ({ data: [], error: null }) }) }
      },
    } as unknown as SupabaseClient
    await pruefeSendeIsolation(PLATZHALTER, spion)
    expect(befragt).toBe(0)
  })

  it('interne Nummer wird unterdrueckt, Grund "intern"', async () => {
    const db = fakeDbList({
      profiles: [],
      leads: [{ email: 'aaron.sprafke@claimondo.de', telefon: INTERN }],
    })
    await expect(pruefeSendeIsolation(INTERN, db)).resolves.toEqual({
      unterdruecken: true,
      grund: 'intern',
      kennung: 'internal-recipient-suppressed',
    })
  })

  it('echter externer Kunde wird NICHT unterdrueckt — der Guard darf nie einen Kunden kosten', async () => {
    const db = fakeDbList({
      profiles: [{ email: 'anja.harig@icloud.com', telefon: INTERN }],
      leads: [],
    })
    await expect(pruefeSendeIsolation(INTERN, db)).resolves.toEqual({ unterdruecken: false })
  })

  it('Datenbank-Fehler laesst den Send durch (fail-open)', async () => {
    const kaputt = {
      from: () => {
        throw new Error('DB weg')
      },
    } as unknown as SupabaseClient
    await expect(pruefeSendeIsolation(INTERN, kaputt)).resolves.toEqual({ unterdruecken: false })
  })
})
