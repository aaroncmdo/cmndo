// Identitaets-Engine §12 Login-Tor — Slice B INTEGRATIONSTEST (echte DB).
//
// Beweist die riskante Logik gegen das echte Schema + die echte match_person_candidates-RPC:
//   1. Orphan + matchender Account anlegen  -> Match-Engine liefert Kandidat
//   2. confirmOrphanPersonIsMe              -> Re-Point + canonical-Tombstone
//   3. verifizieren: Partei re-gepointet, previous_person_id gesetzt, Orphan getombstoned,
//      claim_parties.user_id UNVERAENDERT (KEIN Access-Grant, §2), Match schliesst Orphan danach aus.
//   4. Teardown: alle Test-personen/-parties wieder weg (afterAll, try/catch).
//
// GEGATET: laeuft NUR mit RUN_DB_INTEGRATION=1 + Service-Creds in der Env — sonst describe.skip
// (CI / normaler `vitest run` ueberspringt es -> kein Prod-Hit, kein Seed-Rest). Manuell:
//   set -a; source <main>/.env.local; set +a; RUN_DB_INTEGRATION=1 npx vitest run \
//     src/lib/personen/__tests__/confirm-orphan-match.integration.test.ts
//
// Fixture haengt an einem BESTEHENDEN Claim (kleinster Footprint: +1 Partei, +2 Personen,
// alle in afterAll geloescht). Der anonymisiere_claim_party-Trigger ist ein No-Op solange
// ist_anonymisiert=false bleibt (tut es).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { findOrphanPersonMatchesForUser } from '../find-orphan-matches'
import { confirmOrphanPersonIsMe } from '../confirm-orphan-match'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RUN = process.env.RUN_DB_INTEGRATION === '1' && !!URL && !!KEY

// Ein bestehender Claim, an den die Test-Partei kurz angehaengt wird (read 2026-06-03).
const EXISTING_CLAIM_ID = '4fbee510-cf44-4feb-92a5-23f74cf7047b'

const d = RUN ? describe : describe.skip

d('confirmOrphanPersonIsMe (DB-Integration)', () => {
  let db: SupabaseClient
  const tag = `ZZ_SLICEB_INTEG_${Date.now()}`
  const testUserId = crypto.randomUUID()
  let acctId: string | null = null
  let orphanId: string | null = null
  let partyId: string | null = null

  beforeAll(async () => {
    db = createClient(URL!, KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: acct, error: e1 } = await db
      .from('personen')
      .insert({ user_id: testUserId, vorname: 'Integ', nachname: tag, geburtsdatum: '1980-01-01', email: `${tag.toLowerCase()}@slice-b-test.invalid` })
      .select('id')
      .single()
    if (e1) throw new Error(`account insert: ${e1.message}`)
    acctId = acct!.id as string

    const { data: orphan, error: e2 } = await db
      .from('personen')
      .insert({ user_id: null, vorname: 'Integ', nachname: tag, geburtsdatum: '1980-01-01' })
      .select('id')
      .single()
    if (e2) throw new Error(`orphan insert: ${e2.message}`)
    orphanId = orphan!.id as string

    const { data: party, error: e3 } = await db
      .from('claim_parties')
      .insert({
        claim_id: EXISTING_CLAIM_ID,
        person_id: orphanId,
        user_id: null,
        rolle: 'zeuge',
        quelle: 'manuell_kb',
        adresse_land: 'DE',
        hat_personenschaden: false,
        ist_aktiv: true,
        ist_anonymisiert: false,
        ist_eingeladen_via_airdrop: false,
        ist_fahrer: false,
        ist_gewerbe: false,
        ist_halter: false,
      })
      .select('id')
      .single()
    if (e3) throw new Error(`party insert: ${e3.message}`)
    partyId = party!.id as string
  })

  afterAll(async () => {
    if (partyId) await db.from('claim_parties').delete().eq('id', partyId)
    const ids = [acctId, orphanId].filter(Boolean) as string[]
    if (ids.length) await db.from('personen').delete().in('id', ids)
  })

  it('Match-Engine liefert den Orphan als Kandidat (stark, name+gebdat)', async () => {
    const r = await findOrphanPersonMatchesForUser({ db, userId: testUserId, minTier: 'stark' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const hit = r.matches.find((m) => m.personId === orphanId)
      expect(hit, 'Orphan sollte Kandidat sein').toBeTruthy()
      expect(hit!.tier).toBe('stark')
    }
  })

  it('Confirm re-pointed die Partei, setzt previous_person_id + Tombstone, laesst user_id UNVERAENDERT', async () => {
    const r = await confirmOrphanPersonIsMe({ db, userId: testUserId, orphanPersonId: orphanId! })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.repointedParties).toBeGreaterThanOrEqual(1)

    const { data: party } = await db
      .from('claim_parties')
      .select('person_id, previous_person_id, user_id')
      .eq('id', partyId!)
      .single()
    expect(party!.person_id).toBe(acctId)
    expect(party!.previous_person_id).toBe(orphanId)
    expect(party!.user_id).toBeNull() // §2: KEIN Access-Grant

    const { data: orphan } = await db
      .from('personen')
      .select('canonical_person_id')
      .eq('id', orphanId!)
      .single()
    expect(orphan!.canonical_person_id).toBe(acctId)
  })

  it('nach Confirm ist der Orphan kein Match-Kandidat mehr (canonical-Filter)', async () => {
    const r = await findOrphanPersonMatchesForUser({ db, userId: testUserId, minTier: 'stark' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.matches.find((m) => m.personId === orphanId)).toBeFalsy()
  })
})
