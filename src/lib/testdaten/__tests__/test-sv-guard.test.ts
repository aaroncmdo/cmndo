import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { entscheideTestSvGuard, pruefeTestSvKonsistenz, istInternesTelefon } from '../test-sv-guard'

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
      leads: [{ email: 'aaron.sprafke@claimondo.de', telefon: '+491735633541' }],
    })
    expect(await istInternesTelefon('+491735633541', db)).toBe(true)
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
    expect(await istInternesTelefon('+491735633541', db)).toBe(false)
  })
})
