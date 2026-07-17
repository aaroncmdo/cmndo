// P2.3b Verify: bestaetige() Geocoding-Garantie gegen die echte DB + echte Geocoder.
// Run (controller): cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-p2-3b-bestaetige.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { bestaetige } = await import('@/lib/termine/engine')
const db = createAdminClient()
const ids: string[] = []

async function insTermin(extra: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from('gutachter_termine')
    .insert({ assignee_typ: 'sachverstaendiger', typ: 'sv_begutachtung', status: 'reserviert', ...extra })
    .select('id').single()
  if (error) throw new Error('insert: ' + error.message)
  ids.push(data!.id as string)
  return data!.id as string
}

let res: Record<string, unknown> = {}
try {
  const { data: sv } = await db.from('sachverstaendige').select('id').limit(1).maybeSingle()
  const svId = sv?.id as string
  const A = { assignee_id: svId, sv_id: svId }

  // (A) Vor-Ort mit Adresse (keine Coords) -> geocodet + bestätigt + quelle 'termin'
  const idA = await insTermin({ ...A, start_zeit: '2099-06-01T09:00:00Z', end_zeit: '2099-06-01T11:00:00Z',
    besichtigungsort_adresse: 'Domkloster 4, 50667 Köln' })
  const rA = await bestaetige(idA, { db })
  const { data: rowA } = await db.from('gutachter_termine').select('status, besichtigungsort_lat, besichtigungsort_lng').eq('id', idA).maybeSingle()
  const a_ok = rA.ok && (rA as { quelle?: string }).quelle === 'termin'
    && rowA?.status === 'bestaetigt' && rowA?.besichtigungsort_lat != null && rowA?.besichtigungsort_lng != null

  // (B) Remote (video) ohne Ort -> bestätigt ohne Geocoding, quelle 'remote'
  const idB = await insTermin({ ...A, start_zeit: '2099-06-01T12:00:00Z', end_zeit: '2099-06-01T13:00:00Z', kanal: 'video' })
  const rB = await bestaetige(idB, { db })
  const { data: rowB } = await db.from('gutachter_termine').select('status, besichtigungsort_lat').eq('id', idB).maybeSingle()
  const b_ok = rB.ok && (rB as { quelle?: string }).quelle === 'remote' && rowB?.status === 'bestaetigt' && rowB?.besichtigungsort_lat == null

  // (C) Vor-Ort ohne Ziel (kein besichtigungsort, kein bezug) -> refuse, Status bleibt reserviert
  const idC = await insTermin({ ...A, start_zeit: '2099-06-01T14:00:00Z', end_zeit: '2099-06-01T15:00:00Z' })
  const rC = await bestaetige(idC, { db })
  const { data: rowC } = await db.from('gutachter_termine').select('status').eq('id', idC).maybeSingle()
  const c_ok = !rC.ok && (rC as { code?: string }).code === 'kein_ziel' && rowC?.status === 'reserviert'

  res = {
    svId,
    a_geocodet_bestaetigt: a_ok, a_lat: rowA?.besichtigungsort_lat,
    b_remote_bestaetigt: b_ok,
    c_refused_kein_ziel: c_ok,
    VERDICT: a_ok && b_ok && c_ok ? 'GRUEN' : 'FEHLER',
  }
} finally {
  if (ids.length) await db.from('gutachter_termine').delete().in('id', ids)
  // Reste abgestuerzter Vorlaeufe ueber das 2099-Testfenster (notiz_intern ausgelagert, Kunde-Leak-Fix).
  await db.from('gutachter_termine').delete().gte('start_zeit', '2099-06-01').lt('start_zeit', '2099-06-02')
}
console.log(JSON.stringify(res, null, 2))
