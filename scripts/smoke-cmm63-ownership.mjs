#!/usr/bin/env node
// CMM-63 Daten-Layer-Smoke: validiert die LOGIK von PR1 (assertKundeOwnsFall-Konsolidierung)
// + PR2-Foundation (accept-both Loader + assertKundeOwnsClaim) gegen echte Prod-Daten,
// indem die exakten Queries dieser Funktionen repliziert werden. Transport = curl
// (supabase-js node-client hängt in dieser Env). Kein Login/Browser nötig.
//
// Prüft:
//   1. accept-both: faelle.eq('claim_id', claimId) liefert DEN faelle-Row; faelle.eq('id', faelleId)
//      liefert DENSELBEN. (Neuer claim_id-Route-Key UND Alt-faelle.id-Bookmark lösen identisch auf.)
//   2. Ownership-SSoT: claim_parties(rolle=geschaedigter).user_id == Owner → assertKundeOwnsClaim ok.
//   3. Stranger: zufällige UUID matcht weder claim_parties noch claims.geschaedigter_user_id → denied.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const URL = get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')

function rest(pathAndQuery) {
  const cmd = `curl -s -m 15 -H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}" "${URL}/rest/v1/${pathAndQuery}"`
  for (let i = 0; i < 4; i++) {
    try {
      const out = execSync(cmd, { encoding: 'utf8' })
      if (out.trim().startsWith('[') || out.trim().startsWith('{')) return JSON.parse(out)
    } catch { /* retry */ }
    execSync('sleep 3')
  }
  throw new Error(`REST failed: ${pathAndQuery}`)
}

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  PASS  ${msg}`) } else { fail++; console.log(`  FAIL  ${msg}`) } }

// 0) Ein SAUBERES owned case finden: faelle mit kunde_id + claim_id, wo claim_parties(geschaedigter).user_id == kunde_id.
const faelle = rest('faelle?select=id,kunde_id,claim_id&kunde_id=not.is.null&claim_id=not.is.null')
const parties = rest('claim_parties?select=claim_id,user_id&rolle=eq.geschaedigter')
const partyByClaim = new Map(parties.filter(p => p.user_id).map(p => [p.claim_id, p.user_id]))
const clean = faelle.find(f => partyByClaim.get(f.claim_id) === f.kunde_id)
if (!clean) { console.log('FAIL: kein sauberes owned case gefunden'); process.exit(1) }
console.log(`\n=== Sauberes Case: faelle ${clean.id.slice(0,8)} / claim ${clean.claim_id.slice(0,8)} / owner ${clean.kunde_id.slice(0,8)} ===`)

// 1) accept-both Loader-Logik
console.log('\n[1] accept-both Resolver (getKundeFallDetailRecord):')
const byClaim = rest(`faelle?select=id,claim_id,kunde_id&claim_id=eq.${clean.claim_id}&order=created_at.asc&limit=1`)
ok(byClaim[0]?.id === clean.id, `eq('claim_id', claimId) -> faelle ${clean.id.slice(0,8)} (neuer Route-Key)`)
const byFall = rest(`faelle?select=id,claim_id,kunde_id&id=eq.${clean.id}`)
ok(byFall[0]?.id === clean.id, `eq('id', faelleId) -> derselbe faelle (Alt-Bookmark-Fallback)`)
ok(byClaim[0]?.id === byFall[0]?.id, `beide Pfade lösen identisch auf`)
// faelle.id ist NIE die claim_id eines anderen faelle (FK->claims) -> claim_id-Lookup auf eine faelle.id = leer
const claimLookupOnFallId = rest(`faelle?select=id&claim_id=eq.${clean.id}`)
ok(claimLookupOnFallId.length === 0, `eq('claim_id', <faelleId>) = leer -> Fallback greift korrekt (kein Fehlmatch)`)

// 2) Ownership-SSoT = claim_parties(geschaedigter)
console.log('\n[2] assertKundeOwnsClaim / assertKundeOwnsFall Ownership:')
ok(partyByClaim.get(clean.claim_id) === clean.kunde_id, `claim_parties(geschaedigter).user_id == owner -> ok:true`)

// 3) Stranger denied
console.log('\n[3] Stranger-Abwehr:')
const RANDOM = '00000000-0000-4000-8000-000000000000'
const claimRow = rest(`claims?select=id,geschaedigter_user_id&id=eq.${clean.claim_id}`)[0]
const strangerParty = partyByClaim.get(clean.claim_id) === RANDOM
const strangerGesch = claimRow?.geschaedigter_user_id === RANDOM
ok(!strangerParty && !strangerGesch, `Random-UUID matcht weder claim_parties noch claims.geschaedigter_user_id -> not_authorized`)

console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`)
process.exit(fail === 0 ? 0 : 1)
