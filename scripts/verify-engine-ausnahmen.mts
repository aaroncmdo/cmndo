// P2.1b Verify: Verfuegbarkeits-Ausnahmen fliessen in v_belegung -> Engine vakanz-bewusst.
// Injiziert eine urlaub-Ausnahme (400+ Tage entfernt, kollidiert mit nichts), prueft, dass
// pruefeBelegung von 'frei' auf 'belegt' kippt + ladeBelegung ein 'ausnahme'-Fenster (status
// 'urlaub', kein Ort) zeigt, und raeumt IMMER auf (try/finally).
// Run (controller): cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-ausnahmen.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { ladeBelegung, pruefeBelegung } = await import('@/lib/termine/engine')
const db = createAdminClient()

const { data: sv } = await db.from('sachverstaendige').select('id').limit(1).maybeSingle()
const svId = (sv?.id as string | undefined) ?? ''
const a = { typ: 'sachverstaendiger' as const, id: svId }
const von = '2027-07-01T00:00:00Z'
const bis = '2027-07-08T00:00:00Z'

let res: Record<string, unknown> = { skipped: true, grund: 'kein SV' }
if (svId) {
  const frei_vorher = await pruefeBelegung(a, von, bis, db)
  const { data: ins } = await db
    .from('verfuegbarkeits_ausnahmen')
    .insert({ assignee_typ: 'sachverstaendiger', assignee_id: svId, von, bis, typ: 'urlaub', grund: 'VERIFY-P21B-mts' })
    .select('id')
    .single()
  try {
    const belegt_nachher = await pruefeBelegung(a, von, bis, db)
    const fenster = await ladeBelegung(a, von, bis, db)
    const ausnahme = fenster.find((f) => f.belegungTyp === 'ausnahme')
    res = {
      svId,
      frei_vorher,
      belegt_nachher,
      ausnahme_status: ausnahme?.status ?? null,
      ausnahme_kein_ort: ausnahme ? ausnahme.standortLat === null : false,
      VERDICT:
        frei_vorher === 'frei' &&
        belegt_nachher === 'belegt' &&
        ausnahme?.status === 'urlaub' &&
        ausnahme?.standortLat === null
          ? 'GRUEN'
          : 'FEHLER',
    }
  } finally {
    if (ins?.id) await db.from('verfuegbarkeits_ausnahmen').delete().eq('id', ins.id)
  }
}
console.log(JSON.stringify(res, null, 2))
