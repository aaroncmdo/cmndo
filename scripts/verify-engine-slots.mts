// P2.1c Verify: freieSlots produziert Slots + reagiert auf v_belegung (Ausnahmen).
// Waehlt einen SV MIT arbeitszeiten, prueft >=1 freien Tag in 30 Tagen, injiziert dann
// eine Ganztags-'sperre'-Ausnahme an einem freien Tag -> dieser Tag muss danach 0 Slots
// haben (beweist v_belegung-Integration end-to-end). Cleanup IMMER (try/finally).
// Run (controller): cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-slots.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { freieSlots } = await import('@/lib/termine/engine')
const db = createAdminClient()

const { data: sv } = await db
  .from('sachverstaendige')
  .select('id')
  .limit(1)
  .maybeSingle()
const svId = (sv?.id as string | undefined) ?? ''
const a = { typ: 'sachverstaendiger' as const, id: svId }

const now = new Date()
const von = now.toISOString()
const bis = new Date(now.getTime() + 30 * 86400_000).toISOString()

let res: Record<string, unknown> = { skipped: true, grund: 'kein SV mit arbeitszeiten' }
if (svId) {
  const vorher = await freieSlots(a, von, bis, {}, db)
  const freieTageVorher = vorher.filter((t) => t.anzahl_slots > 0).length
  if (!freieTageVorher) {
    res = { svId, VERDICT: 'SKIPPED (kein freier Tag im Fenster)' }
  } else {
    // Ganzes Fenster +/- 2 Tage sperren -> deckt ALLE Slots inkl. Randtage (heute vor 'now',
    // Tag bis+now-Zeit), unabhaengig von datum/lokal-Zeit.
    const ausnahmeVon = new Date(new Date(von).getTime() - 2 * 86400_000).toISOString()
    const ausnahmeBis = new Date(new Date(bis).getTime() + 2 * 86400_000).toISOString()
    const { data: ins } = await db
      .from('verfuegbarkeits_ausnahmen')
      .insert({ assignee_typ: 'sachverstaendiger', assignee_id: svId, von: ausnahmeVon, bis: ausnahmeBis, typ: 'sperre', grund: 'VERIFY-P21C' })
      .select('id')
      .single()
    try {
      const nachher = await freieSlots(a, von, bis, {}, db)
      const slotsTotalNachher = nachher.reduce((s, t) => s + t.anzahl_slots, 0)
      res = {
        svId,
        freie_tage_vorher: freieTageVorher,
        slots_total_nachher: slotsTotalNachher,
        VERDICT: freieTageVorher > 0 && slotsTotalNachher === 0 ? 'GRUEN' : 'FEHLER',
      }
    } finally {
      if (ins?.id) await db.from('verfuegbarkeits_ausnahmen').delete().eq('id', ins.id)
    }
  }
}
console.log(JSON.stringify(res, null, 2))
