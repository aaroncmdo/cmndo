// P2.4 Verify: findeBestePerson live gegen die echten dispatchbaren SVs. Nutzt EINEN
// SV-Standort als Schadenort (Distanz 0 → garantiert im Gebiet), prüft nurVorschlag
// (seiteneffektfrei) UND eine echte Reservierung (mit Cleanup). JSON-VERDICT.
// Run (Worktree-Root): cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-matching.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { findeBestePerson } = await import('@/lib/termine/engine')
const db = createAdminClient()

const out: Record<string, unknown> = {}
let createdTerminId: string | null = null
try {
  // Ankerpunkt: ein dispatchbarer SV-Standort als Schadenort (Distanz 0 → im Gebiet).
  const { data: sv } = await db.from('sachverstaendige')
    .select('id, standort_lat, standort_lng')
    .eq('ist_aktiv', true).eq('portal_zugang_freigeschaltet', true)
    .is('gesperrt_seit', null).is('geloescht_am', null)
    .not('standort_lat', 'is', null).limit(1).maybeSingle()
  const { data: lead } = await db.from('leads').select('id').limit(1).maybeSingle()

  if (!sv?.standort_lat || !lead?.id) {
    out.VERDICT = 'SKIPPED (kein dispatchbarer SV mit Standort oder kein lead vorhanden)'
  } else {
    const schadenort = { lat: Number(sv.standort_lat), lng: Number(sv.standort_lng) }
    const bezug = { typ: 'lead' as const, id: lead.id as string }

    // (1) nurVorschlag — seiteneffektfrei.
    const vorschlag = await findeBestePerson({ schadenort, bezug, quelle: 'dispatch', nurVorschlag: true, db })
    const vorschlagOk = vorschlag.ok && vorschlag.gebucht === false && vorschlag.kandidaten.length > 0
    out.vorschlag = {
      ok: vorschlag.ok,
      n: vorschlag.ok && !vorschlag.gebucht ? vorschlag.kandidaten.length : 0,
      top: vorschlag.ok && !vorschlag.gebucht ? vorschlag.kandidaten[0] : null,
    }

    // (2) echte Reservierung + Cleanup.
    const real = await findeBestePerson({ schadenort, bezug, quelle: 'dispatch', db })
    let realOk = false
    if (real.ok && real.gebucht) {
      createdTerminId = real.terminId
      realOk = true
      out.gebucht = { assignee: real.assignee, terminId: real.terminId, slotVon: real.slotVon, reserviertBis: real.reserviertBis }
    } else {
      out.gebucht = real
    }
    out.VERDICT = vorschlagOk && realOk ? 'GRUEN' : 'FEHLER'
  }
} finally {
  if (createdTerminId) {
    const { error } = await db.from('gutachter_termine').delete().eq('id', createdTerminId)
    out.cleanup = error ? `FEHLER: ${error.message}` : `geloescht ${createdTerminId}`
  }
}
console.log(JSON.stringify(out, null, 2))
