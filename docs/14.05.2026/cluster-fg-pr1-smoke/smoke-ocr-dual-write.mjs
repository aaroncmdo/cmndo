#!/usr/bin/env node
// Cluster F+G PR-1 Smoke: OCR-Re-Run loest apply_gutachten_ocr aus,
// danach: claims.* und gutachten.* haben identische Werte (Dual-Write).
//
// Usage:
//   SMOKE_CLAIM_ID=<uuid> node docs/14.05.2026/cluster-fg-pr1-smoke/smoke-ocr-dual-write.mjs

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY)
  throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein')

const admin = createClient(SUPABASE_URL, SERVICE_KEY)
const CLAIM_ID = process.env.SMOKE_CLAIM_ID
if (!CLAIM_ID) throw new Error('SMOKE_CLAIM_ID env-var muss gesetzt sein')

const COLS =
  'reparaturkosten_brutto, restwert, wiederbeschaffungswert, gutachten_fin, gutachten_lohnsatz_ak_eur, gutachten_ocr_processed_at'

// 1) Vorher-Werte aus beiden Tabellen + View
const { data: claimsBefore } = await admin.from('claims').select(COLS).eq('id', CLAIM_ID).maybeSingle()
const { data: gutachtenBefore } = await admin
  .from('gutachten')
  .select(COLS)
  .eq('claim_id', CLAIM_ID)
  .maybeSingle()
const { data: viewBefore } = await admin
  .from('v_gutachten_werte')
  .select(COLS)
  .eq('claim_id', CLAIM_ID)
  .maybeSingle()
console.log('Before:')
console.log('  claims:   ', claimsBefore)
console.log('  gutachten:', gutachtenBefore)
console.log('  view:     ', viewBefore)

// 2) apply_gutachten_ocr mit Test-Payload aufrufen
const testValues = {
  gutachten_ocr_processed_at: new Date().toISOString(),
  reparaturkosten_brutto: 9999.99,
  restwert: 1234.56,
  gutachten_fin: 'SMOKE-TEST-FIN-CFG',
  gutachten_lohnsatz_ak_eur: 88.5,
}
const { error: rpcError } = await admin.rpc('apply_gutachten_ocr', {
  p_claim_id: CLAIM_ID,
  p_values: testValues,
})
if (rpcError) {
  console.error('RPC-Error:', rpcError)
  process.exit(1)
}
console.log('\n✓ apply_gutachten_ocr ohne Error')

// 3) Nachher-Werte vergleichen
const { data: claimsAfter } = await admin.from('claims').select(COLS).eq('id', CLAIM_ID).maybeSingle()
const { data: gutachtenAfter } = await admin
  .from('gutachten')
  .select(COLS)
  .eq('claim_id', CLAIM_ID)
  .maybeSingle()
const { data: viewAfter } = await admin
  .from('v_gutachten_werte')
  .select(COLS)
  .eq('claim_id', CLAIM_ID)
  .maybeSingle()

console.log('\nAfter:')
console.log('  claims:   ', claimsAfter)
console.log('  gutachten:', gutachtenAfter)
console.log('  view:     ', viewAfter)

const ok =
  String(claimsAfter?.reparaturkosten_brutto) === String(gutachtenAfter?.reparaturkosten_brutto) &&
  String(claimsAfter?.restwert) === String(gutachtenAfter?.restwert) &&
  claimsAfter?.gutachten_fin === gutachtenAfter?.gutachten_fin &&
  String(viewAfter?.reparaturkosten_brutto) === String(claimsAfter?.reparaturkosten_brutto) &&
  Number(viewAfter?.reparaturkosten_brutto) === 9999.99

if (!existsSync(__dirname)) mkdirSync(__dirname, { recursive: true })
writeFileSync(
  join(__dirname, 'result.json'),
  JSON.stringify({ ok, testValues, claimsAfter, gutachtenAfter, viewAfter }, null, 2),
)

console.log(
  ok
    ? '\n✓ Dual-Write OK — claims + gutachten + view identisch'
    : '\n❌ Dual-Write FAIL — siehe result.json',
)
process.exit(ok ? 0 : 1)
