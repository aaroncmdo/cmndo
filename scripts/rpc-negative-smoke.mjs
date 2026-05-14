// Ad-hoc Smoke: anon-Key versucht REVOKEd Functions aufzurufen.
// Erwartung: alle 4 in #953 revokten Functions geben permission denied.
// Plus: 5 RLS-Helper-Functions weiter aufrufbar.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const revoked = [
  ['increment_offene_faelle', { sv_id_param: '00000000-0000-0000-0000-000000000000' }],
  ['delete_gutachter_komplett', { p_sv_id: '00000000-0000-0000-0000-000000000000' }],
  ['link_lead_data_to_fall', { p_lead_id: '00000000-0000-0000-0000-000000000000', p_fall_id: '00000000-0000-0000-0000-000000000000' }],
  ['delete_fall_komplett', { p_fall_id: '00000000-0000-0000-0000-000000000000' }],
  ['mark_expired_leads', {}],
  ['cron_dsgvo_hard_delete', {}],
]
console.log('=== Anon-RPC Negative-Smoke (alle sollten permission denied) ===')
let pass = 0, fail = 0
for (const [fn, args] of revoked) {
  const { data, error } = await sb.rpc(fn, args)
  if (error && (error.code === '42501' || error.message?.includes('permission denied'))) {
    console.log(`  ✅ ${fn}: BLOCKIERT (${error.code || ''} ${error.message?.slice(0, 50)})`)
    pass++
  } else {
    console.log(`  🚨 ${fn}: OFFEN! ${error ? error.message : 'data='+JSON.stringify(data).slice(0,60)}`)
    fail++
  }
}
console.log()
console.log('=== Anon-RPC Helper-Funktionen (sollten weiter funktionieren) ===')
for (const fn of ['is_admin', 'is_staff', 'is_sv', 'is_kanzlei', 'get_user_rolle']) {
  const { data, error } = await sb.rpc(fn)
  if (error) {
    console.log(`  🚨 ${fn}: BLOCKIERT! ${error.message?.slice(0, 60)}`)
    fail++
  } else {
    console.log(`  ✅ ${fn}: aufrufbar (data=${JSON.stringify(data)})`)
    pass++
  }
}
console.log()
console.log(`Result: ${pass} PASS, ${fail} FAIL`)
process.exit(fail > 0 ? 1 : 0)
