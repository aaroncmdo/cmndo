// P2.5 Verify: syncTerminToExternalCalendar live. Fake-Provider beweist Orchestrierung +
// Kontext-Resolution auf echtem Termin (kein echtes Kalender-I/O); echter-Provider-Lauf nur
// bei SV OHNE Verbindung (→ skip/skip, graceful no-op). Temp-Termin via engine reserviere + Cleanup.
// Run: cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-kalender-sync.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { reserviere, syncTerminToExternalCalendar, entferneTerminAusExternemKalender } = await import('@/lib/termine/engine')
const db = createAdminClient()

const out: Record<string, unknown> = {}
let terminId: string | null = null
try {
  const { data: sv } = await db.from('sachverstaendige')
    .select('id, profile_id').eq('ist_aktiv', true).eq('portal_zugang_freigeschaltet', true)
    .is('gesperrt_seit', null).is('geloescht_am', null).limit(1).maybeSingle()
  const { data: lead } = await db.from('leads').select('id').limit(1).maybeSingle()
  if (!sv?.id || !lead?.id) {
    out.VERDICT = 'SKIPPED (kein dispatchbarer SV oder kein lead)'
  } else {
    const von = new Date(Date.now() + 90 * 24 * 60 * 60_000); von.setHours(9, 0, 0, 0)
    const bis = new Date(von.getTime() + 45 * 60_000)
    const res = await reserviere({ assignee: { typ: 'sachverstaendiger', id: sv.id as string }, von: von.toISOString(), bis: bis.toISOString(), quelle: 'manuell', bezug: { typ: 'lead', id: lead.id as string }, db })
    if (!res.ok) {
      out.VERDICT = `FEHLER (reserviere: ${res.error})`
    } else {
      terminId = res.terminId
      // (1) Fake-Provider: Orchestrierung + Kontext-Resolution, KEIN echtes I/O.
      let upserted: Record<string, unknown> | null = null
      const fake = { name: 'fake', upsert: async (_t: unknown, k: unknown) => { upserted = k as Record<string, unknown>; return 'created' as const }, remove: async () => 'updated' as const }
      const r1 = await syncTerminToExternalCalendar(terminId, { db, providers: [fake] })
      out.fake = { results: r1.results, summary: upserted ? (upserted as { summary?: string }).summary : null }

      // (2) Echte Provider nur wenn SV KEINE Verbindung hat → erwartet skip/skip.
      const hatGoogle = !!(await db.from('profiles').select('google_refresh_token').eq('id', sv.profile_id as string).maybeSingle()).data?.google_refresh_token
      const hatCaldav = !!(await db.from('sv_kalender_verbindungen').select('id').eq('sv_id', sv.id as string).eq('provider', 'caldav').maybeSingle()).data
      if (!hatGoogle && !hatCaldav) {
        const r2 = await syncTerminToExternalCalendar(terminId, { db })
        out.echteProvider = r2.results
        out.echterLaufOk = r2.results.google === 'skip' && r2.results.caldav === 'skip'
      } else {
        out.echteProvider = 'SKIPPED (SV hat Verbindung — kein ungebetenes Schreiben)'
        out.echterLaufOk = true
      }

      // (3) Entfernen mit Fake-Provider.
      const r3 = await entferneTerminAusExternemKalender(terminId, { db, providers: [fake] })
      out.entfernen = r3.results

      const fakeOk = r1.ok && r1.results.fake === 'created'
      out.VERDICT = fakeOk && out.echterLaufOk ? 'GRUEN' : 'FEHLER'
    }
  }
} finally {
  if (terminId) {
    const { error } = await db.from('gutachter_termine').delete().eq('id', terminId)
    out.cleanup = error ? `FEHLER: ${error.message}` : `geloescht ${terminId}`
  }
}
console.log(JSON.stringify(out, null, 2))
