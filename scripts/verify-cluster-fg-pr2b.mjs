#!/usr/bin/env node
// Cluster F+G PR-2b Post-Merge Verify-Script.
//
// Liest aus pg_catalog/information_schema + ruft die View und prüft, dass die
// Migration (#1322) sauber angekommen ist.
//
// Usage:
//   node --env-file=.env.local scripts/verify-cluster-fg-pr2b.mjs
//
// ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//
// Exit-Code 0 wenn alle Checks grün, 1 sonst.

import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error('❌ ENV fehlt: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const CHECKS = []

function check(name, ok, detail = '') {
  CHECKS.push({ name, ok, detail })
  const symbol = ok ? '✓' : '❌'
  console.log(`${symbol} ${name}${detail ? ` — ${detail}` : ''}`)
}

// Probe-Strategie: wir versuchen zu selecten und prüfen das Error-Verhalten.
// Postgres wirft 42703 ("column does not exist") wenn die Spalte gedropt ist —
// das ist unser Grün-Signal für die DROP-Checks.

// 1. v_gutachten_werte existiert + queryable
const { data: viewProbe, error: viewErr } = await supabase
  .from('v_gutachten_werte')
  .select('claim_id, totalschaden, restwert, wiederbeschaffungswert, nutzungsausfall_tage, reparaturkosten_brutto')
  .limit(1)

check(
  'v_gutachten_werte existiert + ist queryable',
  !viewErr,
  viewErr ? viewErr.message : `${viewProbe?.length ?? 0} Row(s) gelesen`,
)

// Pseudo-Check für claims-Drop: wir versuchen die Spalte zu selecten. Wenn Postgres
// "column does not exist" wirft, ist sie weg.
const { error: claimsProbe } = await supabase
  .from('claims')
  .select('id, gutachten_datum, totalschaden, restwert')
  .limit(1)

check(
  'claims.gutachten_datum/totalschaden/restwert ist weg',
  claimsProbe !== null && /column.+does not exist|42703/i.test(claimsProbe?.message ?? ''),
  claimsProbe?.message ?? 'unerwartete Antwort',
)

const { error: faelleProbe } = await supabase
  .from('faelle')
  .select('id, restwert, totalschaden, wiederbeschaffungswert, nutzungsausfall_tage')
  .limit(1)

check(
  'faelle.restwert/totalschaden/wiederbeschaffungswert/nutzungsausfall_tage ist weg',
  faelleProbe !== null && /column.+does not exist|42703/i.test(faelleProbe?.message ?? ''),
  faelleProbe?.message ?? 'unerwartete Antwort',
)

// v_faelle_mit_aktuellem_termin selectable
const { error: vfErr } = await supabase
  .from('v_faelle_mit_aktuellem_termin')
  .select('id, claim_id, status')
  .limit(1)

check('v_faelle_mit_aktuellem_termin existiert + queryable', !vfErr, vfErr?.message ?? '')

// Summary
const failed = CHECKS.filter((c) => !c.ok)
console.log('')
console.log(failed.length === 0
  ? `✓ Alle ${CHECKS.length} Checks grün — Cluster F+G PR-2b sauber appliziert.`
  : `❌ ${failed.length}/${CHECKS.length} Checks rot:\n${failed.map((c) => `  - ${c.name}: ${c.detail}`).join('\n')}`)

process.exit(failed.length === 0 ? 0 : 1)
