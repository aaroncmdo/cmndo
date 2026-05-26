// CMM-44 Claim-Phasen-SSoT (P0 Task 4): Parity-Probe (read-only).
//
// Verifiziert, dass der SQL-Spiegel `v_claim_phase` bitgleich zur TS-Aggregation
// `getClaimLifecycle` (src/lib/claims/lifecycle.ts) ist — fuer JEDEN Claim, auf
// Live-Daten. 0 Divergenzen = Parity haelt. In P6 wird genau dieser Vergleich zum
// permanenten CI-Gate (`check:claim-phase-parity`).
//
// Warum nicht getClaimLifecycleForClaim direkt aufrufen? Der Loader = (curl-/
// supabase-geladene Sub-Entity-Inputs) + die *pure* getClaimLifecycle. supabase-js
// scheidet hier aus (node fetch/undici haengt gegen Supabase, IPv6 — siehe
// probe-cmm65-ts.mjs). Also: wir laden die IDENTISCHEN Inputs wie der Loader via
// `curl -4`, bauen den ClaimLifecycleInput exakt wie getClaimLifecycleForClaim und
// rufen die ECHTE getClaimLifecycle auf (kein Logik-Duplikat). lifecycle.ts hat nur
// `import type`-Deps -> Node-24-Type-Strip laedt sie ohne Pfad-Alias-Aufloesung.
//
// Loader-Input-Assembly (src/lib/claims/get-claim-lifecycle-for-claim.ts), die wir
// hier spiegeln:
//   - lead: nur wenn faelle.lead_id gesetzt UND leads-Row existiert; sonst null.
//     { sa_unterschrieben, vollmacht_signiert_am } aus leads, onboarding_complete
//     aus faelle.
//   - auftraege: getAlleAuftraege = alle auftraege per fall_id, ORDER reihenfolge ASC.
//   - kanzleiFall: getKanzleiFall = kanzlei_faelle per fall_id (UNIQUE, maybeSingle).
//
// Usage:  node scripts/probe-claim-phase-parity.mjs
// Exit 0 = 0 Divergenzen (Parity haelt). Exit 1 = Divergenz / Fehler (CI-Gate-tauglich).
//
// Bei ruhigem Pool ausfuehren (Migrations/Parallel-Sessions koennen 5432 belasten).

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { getClaimLifecycle } from '../src/lib/claims/lifecycle.ts'

// ── env (.env.local liegt im Repo-/Worktree-Root, gitignored) ────────────────
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const envVal = (re) => {
  const line = env.split(/\r?\n/).find((l) => re.test(l) && !l.trimStart().startsWith('#'))
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : undefined
}
const URL_ = envVal(/^NEXT_PUBLIC_SUPABASE_URL\s*=/)
const KEY = envVal(/^SUPABASE_SERVICE_ROLE_KEY\s*=/) || envVal(/SERVICE_ROLE\w*\s*=/)
if (!URL_ || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SERVICE_ROLE key in .env.local')
  process.exit(1)
}

// ── REST-Fetch via curl -4 (IPv4 erzwingen; node fetch haengt hier) ──────────
function fetchAll(path) {
  const out = execFileSync(
    'curl',
    [
      '-4', '-s', '-m', '40',
      `${URL_}/rest/v1/${path}`,
      '-H', `apikey: ${KEY}`,
      '-H', `Authorization: Bearer ${KEY}`,
      '-H', 'Accept: application/json',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  let json
  try {
    json = JSON.parse(out)
  } catch {
    throw new Error(`Non-JSON response for ${path}: ${out.slice(0, 300)}`)
  }
  if (!Array.isArray(json)) {
    // PostgREST-Fehlerobjekt { message, code, ... }
    throw new Error(`PostgREST error for ${path}: ${JSON.stringify(json).slice(0, 300)}`)
  }
  return json
}

console.log('== CMM-44 P0 Parity-Probe: v_claim_phase (SQL) vs getClaimLifecycle (TS) ==\n')

// ── Bulk-Reads (5 Queries, pool-schonend) ────────────────────────────────────
const LIM = 'limit=100000'
const faelle = fetchAll(`faelle?select=id,lead_id,onboarding_complete&${LIM}`)
const auftraege = fetchAll(`auftraege?select=fall_id,typ,status,reihenfolge&order=reihenfolge.asc&${LIM}`)
const kanzleiFaelle = fetchAll(`kanzlei_faelle?select=fall_id,status,ausgezahlt_am&${LIM}`)
const viewRows = fetchAll(`v_claim_phase?select=claim_id,main_phase,sub_phase&${LIM}`)

const leadIds = [...new Set(faelle.map((f) => f.lead_id).filter(Boolean))]
const leads = leadIds.length
  ? fetchAll(
      `leads?select=id,sa_unterschrieben,vollmacht_signiert_am&id=in.(${leadIds.join(',')})&${LIM}`,
    )
  : []

console.log(
  `geladen: ${faelle.length} faelle · ${auftraege.length} auftraege · ` +
    `${kanzleiFaelle.length} kanzlei_faelle · ${leads.length} leads · ${viewRows.length} v_claim_phase-Zeilen\n`,
)

// ── Indizes ──────────────────────────────────────────────────────────────────
const leadById = new Map(leads.map((l) => [l.id, l]))
const auftraegeByFall = new Map()
for (const a of auftraege) {
  if (!auftraegeByFall.has(a.fall_id)) auftraegeByFall.set(a.fall_id, [])
  auftraegeByFall.get(a.fall_id).push(a) // bereits reihenfolge ASC (order im Query)
}
const kanzleiByFall = new Map()
let kanzleiDupes = 0
for (const kf of kanzleiFaelle) {
  if (kanzleiByFall.has(kf.fall_id)) kanzleiDupes++
  else kanzleiByFall.set(kf.fall_id, kf)
}
const viewByClaim = new Map(viewRows.map((v) => [v.claim_id, v]))

// ── Coverage-Checks (View ist FROM faelle -> 1 Zeile pro fall) ───────────────
const fehltImView = faelle.filter((f) => !viewByClaim.has(f.id)).map((f) => f.id)
const faelleIds = new Set(faelle.map((f) => f.id))
const verwaisteViewRows = viewRows.filter((v) => !faelleIds.has(v.claim_id)).map((v) => v.claim_id)

// ── Pro Fall: Loader-Input nachbauen + getClaimLifecycle vs View ─────────────
const divergenzen = []
let verglichen = 0
for (const f of faelle) {
  const view = viewByClaim.get(f.id)
  if (!view) continue // schon als Coverage-Luecke erfasst

  // lead-Assembly EXAKT wie getClaimLifecycleForClaim:
  let lead = null
  if (f.lead_id) {
    const leadRow = leadById.get(f.lead_id)
    if (leadRow) {
      lead = {
        sa_unterschrieben: leadRow.sa_unterschrieben ?? null,
        vollmacht_signiert_am: leadRow.vollmacht_signiert_am ?? null,
        onboarding_complete: f.onboarding_complete ?? null,
      }
    }
  }
  const fallAuftraege = auftraegeByFall.get(f.id) ?? []
  const kanzleiFall = kanzleiByFall.get(f.id) ?? null

  const ts = getClaimLifecycle({ lead, auftraege: fallAuftraege, kanzleiFall })
  verglichen++

  if (ts.mainPhase !== view.main_phase || ts.subPhase !== view.sub_phase) {
    divergenzen.push({
      claim_id: f.id,
      ts: `${ts.mainPhase}/${ts.subPhase}`,
      view: `${view.main_phase}/${view.sub_phase}`,
    })
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`verglichen: ${verglichen} claims`)
console.log(`Divergenzen (main_phase/sub_phase): ${divergenzen.length}`)
console.log(`faelle ohne v_claim_phase-Zeile   : ${fehltImView.length}`)
console.log(`v_claim_phase-Zeilen ohne fall    : ${verwaisteViewRows.length}`)
if (kanzleiDupes) console.log(`WARN: ${kanzleiDupes} doppelte kanzlei_faelle.fall_id (sollte UNIQUE sein)`)

if (divergenzen.length) {
  console.log('\n-- Divergenzen (claim_id: TS vs VIEW) --')
  for (const d of divergenzen.slice(0, 50)) {
    console.log(`  ${d.claim_id}:  TS=${d.ts}   VIEW=${d.view}`)
  }
  if (divergenzen.length > 50) console.log(`  ... (+${divergenzen.length - 50} weitere)`)
}
if (fehltImView.length) {
  console.log('\n-- faelle ohne View-Zeile (erste 20) --')
  console.log('  ' + fehltImView.slice(0, 20).join('\n  '))
}
if (verwaisteViewRows.length) {
  console.log('\n-- verwaiste View-Zeilen (erste 20) --')
  console.log('  ' + verwaisteViewRows.slice(0, 20).join('\n  '))
}

const ok = divergenzen.length === 0 && fehltImView.length === 0 && verwaisteViewRows.length === 0
console.log(`\n${ok ? 'PARITY OK — 0 Divergenzen.' : 'PARITY FAIL.'}`)
process.exit(ok ? 0 : 1)
