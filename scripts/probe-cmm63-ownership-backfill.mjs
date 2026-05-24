#!/usr/bin/env node
// CMM-63 SP-C precondition: is claims.geschaedigter_user_id + claim_parties(geschaedigter)
// fully backfilled vs faelle.kunde_id? If there is a gap, switching the kunde ownership
// filter off faelle.kunde_id would lock those customers out portal-wide.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

const die = (m) => { console.error('FAIL:', m); process.exit(1) }

// 1. faelle rows with a kunde_id set (the customers who currently have access)
const { data: faelle, error: fe } = await svc
  .from('faelle')
  .select('id, kunde_id, claim_id')
if (fe) die('faelle read: ' + fe.message)

const withKunde = faelle.filter((f) => f.kunde_id)
console.log(`faelle total=${faelle.length}  with kunde_id=${withKunde.length}  with claim_id=${faelle.filter((f)=>f.claim_id).length}`)

// 2. claims.geschaedigter_user_id
const { data: claims, error: ce } = await svc
  .from('claims')
  .select('id, geschaedigter_user_id')
if (ce) die('claims read: ' + ce.message)
const claimGesch = new Map(claims.map((c) => [c.id, c.geschaedigter_user_id]))
console.log(`claims total=${claims.length}  with geschaedigter_user_id=${claims.filter((c)=>c.geschaedigter_user_id).length}`)

// 3. claim_parties (geschaedigter) with user_id
const { data: parties, error: pe } = await svc
  .from('claim_parties')
  .select('claim_id, user_id, rolle')
  .eq('rolle', 'geschaedigter')
if (pe) die('claim_parties read: ' + pe.message)
const partyUser = new Map()
for (const p of parties) if (p.user_id) partyUser.set(p.claim_id, p.user_id)
console.log(`claim_parties(geschaedigter) total=${parties.length}  with user_id=${[...partyUser.keys()].length}`)

// 4. GAP analysis: for every faelle with kunde_id, does the canonical SSoT carry that owner?
let gapNoClaim = 0, gapClaimMismatch = 0, gapPartyMissing = 0, ok = 0
const gaps = []
for (const f of withKunde) {
  if (!f.claim_id) { gapNoClaim++; gaps.push(`faelle ${f.id}: kunde_id=${f.kunde_id} but NO claim_id`); continue }
  const cg = claimGesch.get(f.claim_id)
  const pu = partyUser.get(f.claim_id)
  const claimOk = cg === f.kunde_id
  const partyOk = pu === f.kunde_id
  if (!claimOk) { gapClaimMismatch++; gaps.push(`faelle ${f.id}: kunde_id=${f.kunde_id} but claims.geschaedigter_user_id=${cg ?? 'NULL'}`) }
  if (!partyOk) { gapPartyMissing++; gaps.push(`faelle ${f.id}: kunde_id=${f.kunde_id} but claim_parties(geschaedigter).user_id=${pu ?? 'NULL'}`) }
  if (claimOk && partyOk) ok++
}
console.log(`\n=== GAP (relative to ${withKunde.length} faelle-with-kunde_id) ===`)
console.log(`fully covered (claims AND claim_parties)=${ok}`)
console.log(`gap: no claim_id=${gapNoClaim}  claims.geschaedigter_user_id mismatch=${gapClaimMismatch}  claim_parties geschaedigter missing=${gapPartyMissing}`)
if (gaps.length) { console.log('\nDETAIL:'); gaps.slice(0, 40).forEach((g) => console.log('  ' + g)) }
console.log('\nDONE')
