// P2.1a Verify: Engine-Belegung-Read-Core gegen v_belegung. Zwei echte Pfade:
//  (1) extern: tuple-genauer Cross-Check vs getCachedBusyWindows (nicht nur Count)
//  (2) buchung: end-to-end ueber eine reale aktive Buchung (assignee-generisch)
// Run (controller): cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-belegung.mts && rm -f .env.local
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
const tup = (s: string, e: string) => `${s}|${e}`
type Typ = 'sachverstaendiger' | 'sv_lead' | 'kundenbetreuer' | 'kanzlei'

// (1) extern: tuple-genau gegen getCachedBusyWindows
const { data: cacheRow } = await db.from('sv_kalender_events_cache').select('sv_id').limit(1).maybeSingle()
const externSvId = (cacheRow?.sv_id as string | undefined) ?? ''
let externResult: Record<string, unknown> = { applicable: false }
if (externSvId) {
  const fenster = await ladeBelegung({ typ: 'sachverstaendiger', id: externSvId }, WIDE_FROM, WIDE_TO, db)
  const externTuples = fenster.filter((f) => f.belegungTyp === 'extern').map((f) => tup(f.start, f.end)).sort()
  const cache = await getCachedBusyWindows(externSvId, WIDE_FROM, WIDE_TO)
  const cacheTuples = cache.map((c) => tup(c.start, c.end)).sort()
  externResult = {
    applicable: true,
    externSvId,
    extern_fenster: externTuples.length,
    cache_rows: cacheTuples.length,
    tuples_match: JSON.stringify(externTuples) === JSON.stringify(cacheTuples),
  }
}

// (2) buchung: end-to-end ueber eine reale aktive Buchung
const { data: buchungRow } = await db
  .from('v_belegung')
  .select('assignee_typ, assignee_id, start_zeit, end_zeit')
  .eq('belegung_typ', 'buchung')
  .limit(1)
  .maybeSingle()
let buchungResult: Record<string, unknown> = { applicable: false }
if (buchungRow?.assignee_id && buchungRow?.assignee_typ && buchungRow?.start_zeit && buchungRow?.end_zeit) {
  const a = { typ: buchungRow.assignee_typ as Typ, id: buchungRow.assignee_id as string }
  const bfenster = await ladeBelegung(a, WIDE_FROM, WIDE_TO, db)
  const hatBuchung = bfenster.some((f) => f.belegungTyp === 'buchung')
  const belegt = await pruefeBelegung(a, buchungRow.start_zeit as string, buchungRow.end_zeit as string, db)
  buchungResult = { applicable: true, assignee_typ: a.typ, hat_buchung: hatBuchung, pruefe_belegt: belegt, proven: hatBuchung && belegt === 'belegt' }
}

// (3) frei: Leerfenster auf einem vorhandenen Assignee
const freiAssignee: { typ: Typ; id: string } | null = externSvId
  ? { typ: 'sachverstaendiger', id: externSvId }
  : buchungRow?.assignee_id
    ? { typ: buchungRow.assignee_typ as Typ, id: buchungRow.assignee_id as string }
    : null
const freiCheck = freiAssignee
  ? await pruefeBelegung(freiAssignee, '2099-01-01T00:00:00Z', '2099-01-01T01:00:00Z', db)
  : 'n/a'

const haveData = externResult.applicable === true || buchungResult.applicable === true
const externOk = externResult.applicable === true ? externResult.tuples_match === true : true
const buchungOk = buchungResult.applicable === true ? buchungResult.proven === true : true
const res = {
  extern: externResult,
  buchung: buchungResult,
  pruefe_frei_auf_leerfenster: freiCheck,
  VERDICT: !haveData
    ? 'SKIPPED (keine Test-Daten in v_belegung)'
    : externOk && buchungOk && freiCheck === 'frei'
      ? 'GRUEN'
      : 'FEHLER',
}
console.log(JSON.stringify(res, null, 2))
