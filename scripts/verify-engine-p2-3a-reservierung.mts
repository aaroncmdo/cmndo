// P2.3a Verify: reserviere() gegen die echte DB — race-sicher ueber den Exclusion-Constraint.
// Run (controller): cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-p2-3a-reservierung.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { reserviere } = await import('@/lib/termine/engine')
const db = createAdminClient()
const ids: string[] = []

// Jahr 2099 -> kollidiert mit keiner realen Buchung.
const W_A = '2099-05-01T09:00:00Z', W_B = '2099-05-01T11:00:00Z'   // Basis
const O_A = '2099-05-01T10:00:00Z', O_B = '2099-05-01T12:00:00Z'   // ueberlappt W
const S_A = '2099-05-01T13:00:00Z', S_B = '2099-05-01T14:00:00Z'   // separat

let res: Record<string, unknown> = {}
try {
  const { data: sv } = await db.from('sachverstaendige').select('id').limit(1).maybeSingle()
  const svId = sv?.id as string | undefined
  const assignee = { typ: 'sachverstaendiger' as const, id: svId! }

  // (1) reserviere ok + Dual-Write + reserviert_bis
  const r1 = await reserviere({ assignee, von: W_A, bis: W_B, quelle: 'self_service', db })
  if (r1.ok) ids.push(r1.terminId)
  let dualwrite_ok = false
  let reserviert_bis_set = false
  if (r1.ok) {
    const { data: row } = await db.from('gutachter_termine')
      .select('assignee_typ, assignee_id, sv_id, status, reserviert_bis, quelle')
      .eq('id', r1.terminId).maybeSingle()
    dualwrite_ok = row?.assignee_id === svId && row?.sv_id === svId
      && row?.assignee_typ === 'sachverstaendiger' && row?.status === 'reserviert' && row?.quelle === 'self_service'
    reserviert_bis_set = row?.reserviert_bis != null
  }

  // (2) ueberlappend -> belegt (Constraint greift)
  const r2 = await reserviere({ assignee, von: O_A, bis: O_B, quelle: 'dispatch', db })
  if (r2.ok) ids.push(r2.terminId) // sollte NICHT passieren
  const overlap_belegt = !r2.ok && r2.code === 'belegt'

  // (3) separat -> ok (kein Ueber-Blocken)
  const r3 = await reserviere({ assignee, von: S_A, bis: S_B, quelle: 'manuell', db })
  if (r3.ok) ids.push(r3.terminId)
  const separate_ok = r3.ok === true

  res = {
    svId,
    r1_ok: r1.ok, dualwrite_ok, reserviert_bis_set,
    overlap_belegt, separate_ok,
    VERDICT: r1.ok && dualwrite_ok && reserviert_bis_set && overlap_belegt && separate_ok ? 'GRUEN' : 'FEHLER',
  }
} finally {
  if (ids.length) await db.from('gutachter_termine').delete().in('id', ids)
}
console.log(JSON.stringify(res, null, 2))
