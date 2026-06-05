// Sub-A2 Verify: planeTermin (vorschlagen, assignee=null) → max 3 verteilte Slots
// auf einem echten Schadenort. Beweist die end-to-end-Komposition (findeBestePerson
// → verteile3Slots → freieSlots). Run: cp ../../../.env.local .env.local && npx tsx scripts/verify-engine-planetermin.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { planeTermin } = await import('@/lib/termine/engine')
const db = createAdminClient()

const { data: sv } = await db.from('sachverstaendige')
  .select('standort_lat, standort_lng').not('standort_lat', 'is', null).limit(1).maybeSingle()
if (!sv) { console.log(JSON.stringify({ verdict: 'SKIP', grund: 'kein SV mit Standort' })); process.exit(0) }

const res = await planeTermin({
  bezug: { typ: 'lead', id: 'verify' }, quelle: 'self_service', assigneeTyp: 'sachverstaendiger',
  schadenort: { lat: Number(sv.standort_lat), lng: Number(sv.standort_lng) }, modus: 'vorschlagen', db,
})
const out = res.ok && res.kind === 'slots'
  ? {
      verdict: res.vorschlaege.length > 0 ? 'PASS' : 'CHECK',
      anzahlSlots: res.vorschlaege.length,
      anzahlSVs: new Set(res.vorschlaege.map((v) => v.assignee.id)).size,
      slots: res.vorschlaege.map((v) => ({ sv: v.assignee.id.slice(0, 8), von: v.von, score: v.score })),
    }
  : { verdict: 'CHECK', res }
console.log(JSON.stringify(out, null, 2))
