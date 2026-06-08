// Sub-A.2 Shadow-Diff: findBestSV (alt, live) vs findBestSVviaEngine (neu) auf echten
// Lead-Schadenorten. Reine Lese-Vergleiche, KEIN Live-Impact. Beweist Ranglisten-
// Äquivalenz vor dem findBestSV→Thin-Wrapper-Flip (Sub-A.3).
// Run: cp ../../../.env.local .env.local && npx tsx scripts/verify-shadow-findbestsv.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { findBestSV } = await import('@/lib/dispatch/findBestSV')
const { findBestSVviaEngine } = await import('@/lib/dispatch/findBestSV-via-engine')
const db = createAdminClient()

// Reale Schadenorte aus Leads (Sample). Fallback: gutachter_termine-Coords.
let { data: orte } = await db.from('leads')
  .select('id, besichtigungsort_lat, besichtigungsort_lng')
  .not('besichtigungsort_lat', 'is', null).limit(6)
if (!orte?.length) {
  const { data: gt } = await db.from('gutachter_termine')
    .select('id, besichtigungsort_lat, besichtigungsort_lng')
    .not('besichtigungsort_lat', 'is', null).limit(6)
  orte = (gt ?? []).map((g) => ({ id: g.id, besichtigungsort_lat: g.besichtigungsort_lat, besichtigungsort_lng: g.besichtigungsort_lng })) as typeof orte
}
if (!orte?.length) { console.log(JSON.stringify({ verdict: 'SKIP', grund: 'keine Coords' })); process.exit(0) }

type Diff = { id: string; alt: string[]; neu: string[]; altTop1Score?: number; neuTop1Score?: number }
const diffs: Diff[] = []
let top1Match = 0, orderMatch = 0
for (const o of orte) {
  const input = { fallLat: Number(o.besichtigungsort_lat), fallLng: Number(o.besichtigungsort_lng) }
  const [alt, neu] = await Promise.all([findBestSV(input, 3), findBestSVviaEngine(input, 3)])
  const altIds = alt.map((c) => c.svId)
  const neuIds = neu.map((c) => c.svId)
  const t1 = altIds[0] != null && altIds[0] === neuIds[0]
  const ord = JSON.stringify(altIds) === JSON.stringify(neuIds)
  if (t1) top1Match++
  if (ord) orderMatch++
  if (!ord) diffs.push({ id: o.id as string, alt: altIds, neu: neuIds, altTop1Score: alt[0]?.score, neuTop1Score: neu[0]?.score })
}
console.log(JSON.stringify({
  verdict: top1Match === orte.length ? 'PASS_TOP1' : (top1Match > 0 ? 'DIFF_PARTIAL' : 'DIFF'),
  geprueft: orte.length, top1Match, orderMatch, diffs,
}, null, 2))
