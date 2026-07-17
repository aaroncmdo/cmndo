// P2.3c Verify: sageAb / verlege / entscheideVerlegung gegen die echte DB (inkl. Constraint).
// Run (controller): cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-p2-3c-transitions.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { verlege, entscheideVerlegung, sageAb } = await import('@/lib/termine/engine')
const db = createAdminClient()
const ids: string[] = []

async function insBestaetigt(svId: string, von: string, bis: string): Promise<string> {
  const { data, error } = await db.from('gutachter_termine').insert({
    assignee_typ: 'sachverstaendiger', assignee_id: svId, sv_id: svId,
    typ: 'sv_begutachtung', status: 'bestaetigt', start_zeit: von, end_zeit: bis,
  }).select('id').single()
  if (error) throw new Error('insert: ' + error.message)
  ids.push(data!.id as string)
  return data!.id as string
}
async function statusOf(id: string): Promise<{ status: string | null; cancelled: boolean; quelle: string | null }> {
  const { data } = await db.from('gutachter_termine').select('status, cancelled_at, verlegung_quelle_id').eq('id', id).maybeSingle()
  return { status: (data?.status as string) ?? null, cancelled: data?.cancelled_at != null, quelle: (data?.verlegung_quelle_id as string) ?? null }
}

let res: Record<string, unknown> = {}
try {
  const { data: sv } = await db.from('sachverstaendige').select('id').limit(1).maybeSingle()
  const svId = sv?.id as string

  // (1) verlege propose: alt -> verlegt, neu -> verlegung_pending
  const altId = await insBestaetigt(svId, '2099-07-01T09:00:00Z', '2099-07-01T10:00:00Z')
  const rV = await verlege(altId, { neuVon: '2099-07-01T11:00:00Z', neuBis: '2099-07-01T12:00:00Z', grund: 'SV verschiebt' })
  let neuId = ''
  if (rV.ok) { neuId = rV.neuerTerminId; ids.push(neuId) }
  const sAlt1 = await statusOf(altId)
  const sNeu1 = await statusOf(neuId)
  const verlege_ok = rV.ok && sAlt1.status === 'verlegt' && sNeu1.status === 'verlegung_pending' && sNeu1.quelle === altId

  // (2) entscheideVerlegung bestaetigen: neu -> bestaetigt, alt -> verschoben + cancelled
  const rE = await entscheideVerlegung(neuId, 'bestaetigen')
  const sAlt2 = await statusOf(altId)
  const sNeu2 = await statusOf(neuId)
  const entscheide_ok = rE.ok && sNeu2.status === 'bestaetigt' && sAlt2.status === 'verschoben' && sAlt2.cancelled

  // (3) sageAb: neu -> abgesagt + cancelled
  const rA = await sageAb(neuId, { grund: 'Test-Cleanup' })
  const sNeu3 = await statusOf(neuId)
  const sageab_ok = rA.ok && sNeu3.status === 'abgesagt' && sNeu3.cancelled

  // (4) Konflikt: B + C bestaetigt (getrennte Fenster); verlege(B -> C-Fenster) -> belegt + B-Rollback
  const bId = await insBestaetigt(svId, '2099-07-01T14:00:00Z', '2099-07-01T15:00:00Z')
  const cId = await insBestaetigt(svId, '2099-07-01T16:00:00Z', '2099-07-01T17:00:00Z')
  const rK = await verlege(bId, { neuVon: '2099-07-01T16:00:00Z', neuBis: '2099-07-01T17:00:00Z' })
  if (rK.ok) ids.push(rK.neuerTerminId) // sollte NICHT passieren
  const sB = await statusOf(bId)
  const konflikt_ok = !rK.ok && (rK as { code?: string }).code === 'belegt' && sB.status === 'bestaetigt'

  res = {
    svId, verlege_ok, entscheide_ok, sageab_ok, konflikt_ok,
    VERDICT: verlege_ok && entscheide_ok && sageab_ok && konflikt_ok ? 'GRUEN' : 'FEHLER',
  }
} finally {
  if (ids.length) await db.from('gutachter_termine').delete().in('id', ids)
  // Reste abgestuerzter Vorlaeufe ueber das 2099-Testfenster (notiz_intern ausgelagert, Kunde-Leak-Fix).
  await db.from('gutachter_termine').delete().gte('start_zeit', '2099-07-01').lt('start_zeit', '2099-07-02')
}
console.log(JSON.stringify(res, null, 2))
