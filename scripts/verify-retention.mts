// Phase 1 / Task 5 Verify: pruneStaleExternalEvents behaelt juengste Vergangenheit
// (<90d Retention) und entfernt nur sehr Altes (>90d). Self-contained.
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { pruneStaleExternalEvents } = await import('@/lib/kalender/sync-to-cache')
const db = createAdminClient()

const { data: sv } = await db.from('sv_kalender_events_cache').select('sv_id').limit(1).maybeSingle()
const svId = (sv?.sv_id as string | undefined) ?? null
if (!svId) { console.log(JSON.stringify({ ok: false, error: 'kein SV mit Cache-Eintrag' })); process.exit(1) }

const mk = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString() }
const ids = ['RET_TEST_10d', 'RET_TEST_120d']
const nowIso = new Date().toISOString()
await db.from('sv_kalender_events_cache').upsert([
  { sv_id: svId, source: 'caldav', external_event_id: ids[0], start_zeit: mk(10),  end_zeit: mk(10),  titel: 'ret-10d',  last_synced_at: nowIso },
  { sv_id: svId, source: 'caldav', external_event_id: ids[1], start_zeit: mk(120), end_zeit: mk(120), titel: 'ret-120d', last_synced_at: nowIso },
], { onConflict: 'sv_id,source,external_event_id' })

await pruneStaleExternalEvents(db, svId, 'caldav')

const { data: after } = await db.from('sv_kalender_events_cache')
  .select('external_event_id').eq('sv_id', svId).in('external_event_id', ids)
const present = (after ?? []).map((r) => r.external_event_id)

// cleanup (Test-Daten wieder weg)
await db.from('sv_kalender_events_cache').delete().eq('sv_id', svId).in('external_event_id', ids)

const res = {
  behaelt_10d: present.includes(ids[0]),
  entfernt_120d: !present.includes(ids[1]),
  VERDICT: (present.includes(ids[0]) && !present.includes(ids[1])) ? 'GRUEN' : 'FEHLER',
}
console.log(JSON.stringify(res, null, 2))
