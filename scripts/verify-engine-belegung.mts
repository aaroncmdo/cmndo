// P2.1a Verify: Engine-Belegung-Read-Core gegen v_belegung + Cross-Check vs.
// getCachedBusyWindows (Legacy externer Busy-Reader). Run (controller):
//   cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-belegung.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { ladeBelegung, pruefeBelegung } = await import('@/lib/termine/engine')
const { getCachedBusyWindows } = await import('@/lib/kalender/cache-busy')
const db = createAdminClient()

const WIDE_FROM = '2000-01-01T00:00:00Z'
const WIDE_TO = '2999-01-01T00:00:00Z'

// Einen SV mit Cache-Zeilen (externe Belegung) wählen.
const { data: cacheRow } = await db
  .from('sv_kalender_events_cache')
  .select('sv_id')
  .limit(1)
  .maybeSingle()
const svId = (cacheRow?.sv_id as string | undefined) ?? ''
const assignee = { typ: 'sachverstaendiger' as const, id: svId }

const fenster = svId ? await ladeBelegung(assignee, WIDE_FROM, WIDE_TO, db) : []
const externFenster = fenster.filter((f) => f.belegungTyp === 'extern')
const cache = svId ? await getCachedBusyWindows(svId, WIDE_FROM, WIDE_TO) : []

// pruefeBelegung: 'belegt' auf einem realen Fenster, 'frei' auf einem Leerfenster.
const belegtCheck = fenster.length
  ? await pruefeBelegung(assignee, fenster[0].start, fenster[0].end, db)
  : 'n/a'
const freiCheck = await pruefeBelegung(assignee, '2099-01-01T00:00:00Z', '2099-01-01T01:00:00Z', db)

const res = {
  svId,
  engine_total: fenster.length,
  engine_extern: externFenster.length,
  engine_buchung: fenster.length - externFenster.length,
  cache_rows: cache.length,
  extern_deckt_cache: externFenster.length === cache.length,
  pruefe_belegt_auf_fenster: belegtCheck,
  pruefe_frei_auf_leerfenster: freiCheck,
  VERDICT:
    !!svId &&
    externFenster.length === cache.length &&
    (fenster.length === 0 || belegtCheck === 'belegt') &&
    freiCheck === 'frei'
      ? 'GRUEN'
      : 'FEHLER',
}
console.log(JSON.stringify(res, null, 2))
