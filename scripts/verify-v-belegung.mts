// Phase 1 / Task 4 Verify: v_belegung ueber den Admin-Client (supabase-js) lesbar +
// inhaltlich korrekt? Self-contained (kein cache-busy-Import -> keine Worktree-Dep).
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const db = createAdminClient()

const { data: vb, error } = await db
  .from('v_belegung')
  .select('belegung_typ, assignee_typ, assignee_id, standort_lat, start_zeit')
if (error) { console.log(JSON.stringify({ ok: false, error: error.message })); process.exit(1) }

const rows = vb ?? []
const buchung = rows.filter((r) => r.belegung_typ === 'buchung')
const extern = rows.filter((r) => r.belegung_typ === 'extern')
const { count: cacheCount } = await db
  .from('sv_kalender_events_cache')
  .select('*', { count: 'exact', head: true })

const res = {
  total: rows.length,
  buchung: buchung.length,
  extern: extern.length,
  cache_count: cacheCount,
  extern_deckt_cache: extern.length === cacheCount,
  buchung_ohne_assignee: buchung.filter((r) => !r.assignee_id).length,
  alle_mit_standort: rows.every((r) => r.standort_lat != null),
  VERDICT:
    rows.length > 0 &&
    extern.length === cacheCount &&
    rows.every((r) => r.standort_lat != null) // Buero-Fallback ist ein Phase-1-Kern-Deliverable
      ? 'GRUEN'
      : 'FEHLER',
}
console.log(JSON.stringify(res, null, 2))
