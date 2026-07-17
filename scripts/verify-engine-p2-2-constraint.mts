// P2.2 Verify: assignee-Exclusion-Constraint blockt Doppelbuchung end-to-end + Non-Regression.
// Run (controller): cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-p2-2-constraint.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const db = createAdminClient()
const ids: string[] = []

// Jahr 2099 -> kollidiert mit keiner realen Buchung.
const W_A = '2099-03-01T09:00:00Z', W_B = '2099-03-01T11:00:00Z'   // Basis-Fenster
const O_A = '2099-03-01T10:00:00Z', O_B = '2099-03-01T12:00:00Z'   // ueberlappt W
const S_A = '2099-03-01T13:00:00Z', S_B = '2099-03-01T14:00:00Z'   // separat

type Row = Record<string, unknown>
// Hinweis: ein durch den Exclusion-Constraint geblockter Insert gibt in supabase-js ein
// { error }-Objekt zurueck (KEIN throw) -> der try-Body laeuft weiter, finally raeumt auf.
// Geblockte Inserts liefern data=null -> werden NICHT in ids gepusht (nichts zu loeschen).
async function ins(row: Row) {
  const r = await db.from('gutachter_termine').insert(row).select('id').single()
  if (r.data?.id) ids.push(r.data.id as string)
  return r
}

let res: Record<string, unknown> = {}
try {
  const { data: kb } = await db.from('profiles').select('id').eq('rolle', 'kundenbetreuer').limit(1).maybeSingle()
  const { data: sv } = await db.from('sachverstaendige').select('id').limit(1).maybeSingle()
  const kbId = kb?.id as string | undefined
  const svId = sv?.id as string | undefined

  // (A) assignee-gekeyt: zwei ueberlappende KB-Buchungen -> 2. abgelehnt. + neue Spalten (D).
  const a1 = await ins({ assignee_typ: 'kundenbetreuer', assignee_id: kbId, typ: 'kb_beratung',
    start_zeit: W_A, end_zeit: W_B, status: 'reserviert', quelle: 'self_service', reserviert_bis: '2099-03-01T09:15:00Z' })
  const a2 = await ins({ assignee_typ: 'kundenbetreuer', assignee_id: kbId, typ: 'kb_beratung',
    start_zeit: O_A, end_zeit: O_B, status: 'reserviert' })
  const assignee_double_blocked = a2.error?.code === '23P01'

  // (C) Non-Overlap akzeptiert + bezug-Paar beschreibbar.
  const a3 = await ins({ assignee_typ: 'kundenbetreuer', assignee_id: kbId, typ: 'kb_beratung',
    start_zeit: S_A, end_zeit: S_B, status: 'reserviert', bezug_typ: 'lead', bezug_id: '00000000-0000-0000-0000-0000000000aa' })
  const nonoverlap_ok = !a3.error && !!a3.data?.id

  // (B) Legacy-Pfad: sv_id-only (assignee_id NULL) -> Normalize -> Constraint blockt Overlap.
  const l1 = await ins({ sv_id: svId, typ: 'sv_begutachtung', start_zeit: W_A, end_zeit: W_B, status: 'bestaetigt' })
  const l2 = await ins({ sv_id: svId, typ: 'sv_begutachtung', start_zeit: O_A, end_zeit: O_B, status: 'bestaetigt' })
  const legacy_double_blocked = l2.error?.code === '23P01'

  // Haerten gegen false-green: die geblockten Faelle (a2/l2) sind nur aussagekraeftig, wenn der
  // jeweils ERSTE Insert (a1/l1) wirklich durchlief. Sonst koennte "blocked" = "alles kaputt" sein.
  const a1_ok = !a1.error && !!a1.data?.id
  const l1_ok = !l1.error && !!l1.data?.id

  // Normalize hat assignee auf l1 gefuellt? + neue Spalten auf a1 lesbar?
  const { data: l1row } = await db.from('gutachter_termine').select('assignee_typ, assignee_id').eq('id', l1.data?.id ?? '').maybeSingle()
  const normalize_ok = l1row?.assignee_typ === 'sachverstaendiger' && l1row?.assignee_id === svId
  const { data: a1row } = await db.from('gutachter_termine').select('quelle, reserviert_bis').eq('id', a1.data?.id ?? '').maybeSingle()
  const columns_ok = a1row?.quelle === 'self_service' && a1row?.reserviert_bis != null

  res = {
    kbId, svId, a1_ok, l1_ok, assignee_double_blocked, nonoverlap_ok, legacy_double_blocked, normalize_ok, columns_ok,
    VERDICT: a1_ok && l1_ok && assignee_double_blocked && nonoverlap_ok && legacy_double_blocked && normalize_ok && columns_ok ? 'GRUEN' : 'FEHLER',
  }
} finally {
  if (ids.length) await db.from('gutachter_termine').delete().in('id', ids)
  // Guertel + Hosentraeger: Reste abgestuerzter Vorlaeufe. notiz_intern ist aus gutachter_termine
  // ausgelagert (Kunde-Leak-Fix) -> stattdessen ueber das 2099-Testfenster raeumen (keine reale Buchung).
  await db.from('gutachter_termine').delete().gte('start_zeit', '2099-03-01').lt('start_zeit', '2099-03-02')
}
console.log(JSON.stringify(res, null, 2))
