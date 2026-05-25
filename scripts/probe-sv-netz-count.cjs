// Probe-Script: zaehlt das oeffentliche SV-Netz exakt nach der /gutachter-finden-
// Definition (ladeSvLeads + ladeAktiveSVs) fuer die UWG-belegbare SV-Netz-Zahl
// der Vergleichs-Page (AAR-938). Read-only COUNT gegen die Prod-DB.
//
// Aufruf: NODE_PATH="<main>/node_modules" node scripts/probe-sv-netz-count.cjs
// Laedt .env.local aus dem Haupt-Repo selbst (Secrets bleiben aus dem Transcript).

const fs = require('fs')
const path = require('path')

const MAIN = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2'

// .env.local minimal-parsen (kein dotenv-Dep noetig)
const envText = fs.readFileSync(path.join(MAIN, '.env.local'), 'utf8')
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (!m) continue
  let v = m[2]
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[m[1]]) process.env[m[1]] = v
}

const { createClient } = require('@supabase/supabase-js')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('FEHLT: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// 1:1 aus gutachter-finder-actions.ts
function isTestAccount(f) { return !!f && /\b(test|smoke|demo)\b/i.test(f) }

;(async () => {
  // N1 = ladeSvLeads(): sv_leads WHERE ist_aktiv = true
  const { count: svLeadsAktiv, error: e1 } =
    await sb.from('sv_leads').select('*', { count: 'exact', head: true }).eq('ist_aktiv', true)
  const { count: svLeadsTotal } =
    await sb.from('sv_leads').select('*', { count: 'exact', head: true })

  // N2 = ladeAktiveSVs(): sachverstaendige WHERE ist_aktiv AND iso NOT NULL AND lat NOT NULL, minus Test
  const { data: svRows, error: e2 } = await sb
    .from('sachverstaendige')
    .select('id,firmenname')
    .eq('ist_aktiv', true)
    .not('isochrone_polygon', 'is', null)
    .not('standort_lat', 'is', null)
  const { count: svTotal } =
    await sb.from('sachverstaendige').select('*', { count: 'exact', head: true })

  const N1 = svLeadsAktiv ?? 0
  const svFiltered = (svRows ?? []).filter((r) => !isTestAccount(r.firmenname))
  const N2 = svFiltered.length

  console.log(JSON.stringify({
    errors: { sv_leads: e1?.message ?? null, sachverstaendige: e2?.message ?? null },
    sv_leads_ist_aktiv: N1,
    sv_leads_total: svLeadsTotal,
    sachverstaendige_finder_qualified: N2,
    sachverstaendige_total: svTotal,
    test_accounts_removed: (svRows?.length ?? 0) - N2,
    NETZ_TOTAL_finder_definition: N1 + N2,
  }, null, 1))
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
