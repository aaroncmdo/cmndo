// scripts/cleanup-push-flow.mjs — räumt die Test-Rows weg, die smoke-push-flow
// hinterlassen hat: anfragen + leads + benachrichtigungen mit kontakt_name LIKE
// 'PushFlow Smoke %'.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, ''),
      ]
    }),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: rows, error } = await sb
  .from('anfragen')
  .select('id, lead_id, kontakt_name')
  .like('kontakt_name', 'PushFlow Smoke %')

if (error) {
  console.error('FAIL select:', error.message)
  process.exit(1)
}
if (!rows?.length) {
  console.log('nichts zu räumen')
  process.exit(0)
}

console.log(
  `räume ${rows.length} anfragen + ${rows.filter((r) => r.lead_id).length} leads + alle ` +
    'benachrichtigungen mit passendem link',
)

const leadIds = rows.map((r) => r.lead_id).filter(Boolean)
const anfrageIds = rows.map((r) => r.id)

if (leadIds.length) {
  const links = leadIds.map((id) => `/dispatch/leads/${id}`)
  const { error: nErr } = await sb
    .from('benachrichtigungen')
    .delete()
    .in('link', links)
  if (nErr) console.error('FAIL delete benachrichtigungen:', nErr.message)

  const { error: e1 } = await sb.from('leads').delete().in('id', leadIds)
  if (e1) console.error('FAIL delete leads:', e1.message)
}
const { error: e2 } = await sb.from('anfragen').delete().in('id', anfrageIds)
if (e2) console.error('FAIL delete anfragen:', e2.message)
else console.log('done')
