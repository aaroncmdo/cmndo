#!/usr/bin/env node
/**
 * Diagnose ort=null + kunde_name=null Bugs aus Smoke v2.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

console.log('1) Ingenieurbüro Cakmak — standort_plz prüfen')
const { data: sv } = await sb
  .from('sachverstaendige')
  .select('id, firmenname, standort_plz, standort_lat, standort_lng')
  .ilike('firmenname', '%Cakmak%')
  .limit(1)
console.log('  →', sv?.[0])

if (sv?.[0]?.standort_plz) {
  const { data: plz } = await sb.from('plz_geo').select('plz, lat, lng, ort').eq('plz', sv[0].standort_plz).limit(1)
  console.log(`  plz_geo[${sv[0].standort_plz}] →`, plz?.[0])
}

console.log('\n2) Termin heute — lead_id + Lead-Namen prüfen')
const now = new Date()
const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

const { data: termin } = await sb
  .from('gutachter_termine')
  .select('id, start_zeit, status, fall_id, lead_id, sv_id')
  .gte('start_zeit', s)
  .lte('start_zeit', e)
  .limit(3)

for (const t of termin ?? []) {
  console.log(`\n  termin ${t.id} status=${t.status} fall_id=${t.fall_id} lead_id=${t.lead_id}`)
  if (t.lead_id) {
    const { data: lead } = await sb.from('leads').select('id, vorname, nachname, firma_name').eq('id', t.lead_id).limit(1)
    console.log(`    lead →`, lead?.[0])
  }
  if (t.fall_id) {
    const { data: fall } = await sb.from('faelle').select('id, fall_nummer, kunde_user_id').eq('id', t.fall_id).limit(1)
    console.log(`    fall →`, fall?.[0])
  }
}
