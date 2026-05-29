// CMM-44 Claim-Phasen-SSoT — Parity-Probe (read-only).
//
// Verifiziert, dass der SQL-Spiegel `v_claim_phase` bitgleich zur TS-Aggregation
// `getClaimLifecycle` (src/lib/claims/lifecycle.ts) ist — fuer JEDEN Claim, auf
// Live-Daten. 0 Divergenzen = Parity haelt. Wird in MP-9 zum permanenten CI-Gate
// (`check:claim-phase-parity`).
//
// CMM-44 MP-8b: claims-zentrisch. claims.id != faelle.id (Link faelle.claim_id ->
// claims.id). v_claim_phase ist jetzt `FROM claims` (Key claims.id). Wir laden die
// IDENTISCHEN Inputs wie der claims-zentrische Read-Path und rufen die ECHTE
// getClaimLifecycle (kein Logik-Duplikat). lifecycle.ts hat nur `import type`-Deps
// -> Node-24-Type-Strip laedt sie ohne Pfad-Alias-Aufloesung.
//
// Input-Assembly (mirror der claims-zentrischen v_claim_phase / getClaimLifecycleForClaim):
//   - lead: nur wenn claims.lead_id gesetzt UND leads-Row existiert; sonst null.
//     { sa_unterschrieben, vollmacht_signiert_am } aus leads (onboarding_complete
//     wird von getClaimLifecycle nicht genutzt).
//   - auftraege: alle auftraege per claim_id, ORDER reihenfolge ASC.
//   - kanzleiFall: kanzlei_faelle per claim_id (UNIQUE, maybeSingle).
//   - claimStatus: claims.status (terminaler abschluss).
//
// Usage:  node scripts/probe-claim-phase-parity.mjs
// Exit 0 = 0 Divergenzen (Parity haelt). Exit 1 = Divergenz / Fehler (CI-Gate-tauglich).
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
    throw new Error(`PostgREST error for ${path}: ${JSON.stringify(json).slice(0, 300)}`)
  }
  return json
}

console.log('== CMM-44 Parity-Probe: v_claim_phase (SQL) vs getClaimLifecycle (TS) — claims-zentrisch ==\n')

// ── Bulk-Reads (claims-zentrisch, pool-schonend) ─────────────────────────────
const LIM = 'limit=100000'
const claims = fetchAll(`claims?select=id,status,lead_id&${LIM}`)
const auftraege = fetchAll(`auftraege?select=claim_id,typ,status,reihenfolge&order=reihenfolge.asc&${LIM}`)
const kanzleiFaelle = fetchAll(`kanzlei_faelle?select=claim_id,status,ausgezahlt_am,lexdrive_case_id&${LIM}`)
const viewRows = fetchAll(`v_claim_phase?select=claim_id,main_phase,sub_phase&${LIM}`)

const leadIds = [...new Set(claims.map((c) => c.lead_id).filter(Boolean))]
const leads = leadIds.length
  ? fetchAll(`leads?select=id,sa_unterschrieben,vollmacht_signiert_am&id=in.(${leadIds.join(',')})&${LIM}`)
  : []

console.log(
  `geladen: ${claims.length} claims · ${auftraege.length} auftraege · ` +
    `${kanzleiFaelle.length} kanzlei_faelle · ${leads.length} leads · ${viewRows.length} v_claim_phase-Zeilen\n`,
)

// ── Indizes (claim_id-gekeyt) ────────────────────────────────────────────────
const leadById = new Map(leads.map((l) => [l.id, l]))
const auftraegeByClaim = new Map()
for (const a of auftraege) {
  if (!a.claim_id) continue
  if (!auftraegeByClaim.has(a.claim_id)) auftraegeByClaim.set(a.claim_id, [])
  auftraegeByClaim.get(a.claim_id).push(a) // bereits reihenfolge ASC (order im Query)
}
const kanzleiByClaim = new Map()
let kanzleiDupes = 0
for (const kf of kanzleiFaelle) {
  if (!kf.claim_id) continue
  if (kanzleiByClaim.has(kf.claim_id)) kanzleiDupes++
  else kanzleiByClaim.set(kf.claim_id, kf)
}
const viewByClaim = new Map(viewRows.map((v) => [v.claim_id, v]))
const claimIdSet = new Set(claims.map((c) => c.id))

// ── Coverage-Checks (View ist FROM claims -> 1 Zeile pro claim) ──────────────
const fehltImView = claims.filter((c) => !viewByClaim.has(c.id)).map((c) => c.id)
const verwaisteViewRows = viewRows.filter((v) => !claimIdSet.has(v.claim_id)).map((v) => v.claim_id)

// ── Pro Claim: Input nachbauen + getClaimLifecycle vs View ───────────────────
const divergenzen = []
let verglichen = 0
for (const c of claims) {
  const view = viewByClaim.get(c.id)
  if (!view) continue // schon als Coverage-Luecke erfasst

  let lead = null
  if (c.lead_id) {
    const leadRow = leadById.get(c.lead_id)
    if (leadRow) {
      lead = {
        sa_unterschrieben: leadRow.sa_unterschrieben ?? null,
        vollmacht_signiert_am: leadRow.vollmacht_signiert_am ?? null,
        onboarding_complete: null,
      }
    }
  }
  const claimAuftraege = auftraegeByClaim.get(c.id) ?? []
  const kanzleiFall = kanzleiByClaim.get(c.id) ?? null

  const ts = getClaimLifecycle({ lead, auftraege: claimAuftraege, kanzleiFall, claimStatus: c.status ?? null })
  verglichen++

  if (ts.mainPhase !== view.main_phase || ts.subPhase !== view.sub_phase) {
    divergenzen.push({
      claim_id: c.id,
      ts: `${ts.mainPhase}/${ts.subPhase}`,
      view: `${view.main_phase}/${view.sub_phase}`,
    })
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`verglichen: ${verglichen} claims`)
console.log(`Divergenzen (main_phase/sub_phase): ${divergenzen.length}`)
console.log(`claims ohne v_claim_phase-Zeile   : ${fehltImView.length}`)
console.log(`v_claim_phase-Zeilen ohne claim   : ${verwaisteViewRows.length}`)
if (kanzleiDupes) console.log(`WARN: ${kanzleiDupes} doppelte kanzlei_faelle.claim_id (sollte UNIQUE sein)`)

if (divergenzen.length) {
  console.log('\n-- Divergenzen (claim_id: TS vs VIEW) --')
  for (const d of divergenzen.slice(0, 50)) {
    console.log(`  ${d.claim_id}:  TS=${d.ts}   VIEW=${d.view}`)
  }
  if (divergenzen.length > 50) console.log(`  ... (+${divergenzen.length - 50} weitere)`)
}
if (fehltImView.length) {
  console.log('\n-- claims ohne View-Zeile (erste 20) --')
  console.log('  ' + fehltImView.slice(0, 20).join('\n  '))
}
if (verwaisteViewRows.length) {
  console.log('\n-- verwaiste View-Zeilen (erste 20) --')
  console.log('  ' + verwaisteViewRows.slice(0, 20).join('\n  '))
}

const ok = divergenzen.length === 0 && fehltImView.length === 0 && verwaisteViewRows.length === 0
console.log(`\n${ok ? 'PARITY OK — 0 Divergenzen.' : 'PARITY FAIL.'}`)
process.exit(ok ? 0 : 1)
