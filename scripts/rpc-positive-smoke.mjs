// Service-Role RPC Smoke — ruft die 4 RPCs als service-role auf, mit
// nicht-existierenden IDs damit nichts gelöscht/manipuliert wird.
// Erwartung: kein "permission denied"; Functions melden ggf. "row not found"
// oder ähnliches — das ist OK weil wir Function-Body-Path testen, nicht Daten.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] })
)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const NIL = '00000000-0000-0000-0000-000000000000'
const tests = [
  {
    label: 'increment_offene_faelle (NIL-SV)',
    call: () => admin.rpc('increment_offene_faelle', { sv_id_param: NIL }),
    okIfError: (e) => false, // expect kein Error, weil increment auf 0 rows = silent no-op
  },
  {
    label: 'delete_gutachter_komplett (NIL-SV)',
    call: () => admin.rpc('delete_gutachter_komplett', { p_sv_id: NIL }),
    okIfError: (e) => true, // SQL-Function wirft evtl. wegen "no row found" — auch OK
  },
  {
    label: 'link_lead_data_to_fall (NIL-Lead, NIL-Fall)',
    call: () => admin.rpc('link_lead_data_to_fall', { p_lead_id: NIL, p_fall_id: NIL }),
    okIfError: (e) => true,
  },
  {
    label: 'delete_fall_komplett (NIL-Fall)',
    call: () => admin.rpc('delete_fall_komplett', { p_fall_id: NIL }),
    okIfError: (e) => true,
  },
]

console.log('=== Service-Role RPC Positive-Smoke ===')
console.log('(Functions sind als service-role aufrufbar — Permission-Layer ok)')
console.log()
let permissionDenied = 0
let success = 0
let otherError = 0
for (const t of tests) {
  const { data, error } = await t.call()
  if (error?.code === '42501') {
    console.log(`  🚨 ${t.label}: BLOCKIERT (${error.code})`)
    permissionDenied++
  } else if (error) {
    console.log(`  ${t.okIfError(error) ? '✅' : '❓'} ${t.label}: ${error.code || ''} ${error.message?.slice(0, 70)}`)
    if (t.okIfError(error)) success++
    else otherError++
  } else {
    console.log(`  ✅ ${t.label}: OK${data !== null && data !== undefined ? ' (data=' + JSON.stringify(data).slice(0, 60) + ')' : ''}`)
    success++
  }
}
console.log()
console.log(`Result: ${success} acceptable, ${permissionDenied} permission-denied, ${otherError} unexpected`)
process.exit(permissionDenied > 0 ? 1 : 0)
