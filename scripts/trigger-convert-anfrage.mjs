// One-shot: konvertiereAnfrageZuFall manuell für eine offene GFA triggern.
// Zeigt ob der Converter mit gesetztem sa_unterzeichnet_am durchläuft.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }),
)

const ANFRAGE_ID = process.argv[2] ?? 'd1bcca05-d2b7-4647-98e8-c4ee222a7ddc'

const tsx = await import('tsx/esm/api')
tsx.register()
const { konvertiereAnfrageZuFall } = await import('../src/lib/actions/konvertiere-anfrage-zu-fall.ts')

// Service-role nutzen — Server-Action erwartet Admin-Client intern
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
process.env.NEXT_PUBLIC_APP_URL = 'https://app.staging.claimondo.de'

console.log(`▶ Konvertiere Anfrage ${ANFRAGE_ID}`)
const result = await konvertiereAnfrageZuFall(ANFRAGE_ID)
console.log('Result:', JSON.stringify(result, null, 2))

if (result.ok) {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: anfrage } = await admin.from('gutachter_finder_anfragen')
    .select('konvertiert_zu_fall_id, konvertiert_zu_user_id, magic_link_gesendet_am, status')
    .eq('id', ANFRAGE_ID).single()
  console.log('Anfrage nach Konvertierung:', anfrage)

  const { data: fall } = await admin.from('faelle')
    .select('id, fall_nummer, status, service_typ, sv_id, kunde_id, claim_id, sa_unterschrieben_am')
    .eq('id', result.fallId).single()
  console.log('Fall:', fall)
}
