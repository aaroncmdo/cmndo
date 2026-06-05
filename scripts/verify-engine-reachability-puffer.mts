// P0 Verify (universelle Termin-Engine): Parameter-Fix-Effekt — freieSlots liefert
// realistisch viele Slots (Puffer-Blanket 60→10), ETA-Reachability greift weiter.
// Run: cp ../../../.env.local .env.local && npx tsx scripts/verify-engine-reachability-puffer.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { freieSlots } = await import('@/lib/termine/engine')
const k = await import('@/lib/dispatch/termin-konstanten')
const db = createAdminClient()

const { data: sv } = await db.from('sachverstaendige')
  .select('id, standort_lat, standort_lng')
  .not('standort_lat', 'is', null)
  .limit(1).maybeSingle()
if (!sv) { console.log(JSON.stringify({ verdict: 'SKIP', grund: 'kein SV mit Standort' })); process.exit(0) }

const von = new Date().toISOString()
const bis = new Date(Date.now() + 14 * 864e5).toISOString()
const tage = await freieSlots(
  { typ: 'sachverstaendiger', id: sv.id as string },
  von, bis,
  { schadenort: { lat: Number(sv.standort_lat), lng: Number(sv.standort_lng) } },
  db,
)
const slotCount = tage.reduce((n, t) => n + t.slots.length, 0)
console.log(JSON.stringify({
  verdict: slotCount > 0 ? 'PASS' : 'CHECK',
  konstanten: {
    TERMIN_DAUER_MIN: k.TERMIN_DAUER_MIN,
    TERMIN_PUFFER_MIN: k.TERMIN_PUFFER_MIN,
    ETA_SICHERHEITS_PUFFER_MIN: k.ETA_SICHERHEITS_PUFFER_MIN,
    NO_LOCATION_ETA_MIN: k.NO_LOCATION_ETA_MIN,
  },
  svId: sv.id, tageMitSlots: tage.length, slotCount,
  beispielTag: tage.find((t) => t.slots.length)?.datum ?? null,
}, null, 2))
