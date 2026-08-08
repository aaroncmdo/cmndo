// Tier-2-Bestandsheilung (Spec 2026-08-08 §4.6): setzt aktive SVs ohne geprüfte
// Berufshaftpflicht+Gewerbeanmeldung, die NICHT bereits frist_ueberschritten sind
// und KEINE internen Test-SVs, auf verifizierung_status='ausstehend' + 14-Tage-Frist,
// damit der Reminder-Cron greift und (nach Ablauf) das FG3-Dispatch-Gate den Fall-
// Empfang pausiert.
//
// Dry-run default (listet nur). Schreibt NUR mit --live.
// node scripts/tier2-bestandsheilung.mjs            # dry-run
// node scripts/tier2-bestandsheilung.mjs --live      # schreibt (erst auf Aaron-Signal!)

import { readFileSync } from 'node:fs'

const LIVE = process.argv.includes('--live')
const TIER2_SLOTS = ['sv_berufshaftpflicht', 'sv_gewerbeanmeldung']
const FRIST_TAGE = 14

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const pick = (k) => env.match(new RegExp(`${k}=(.+)`))?.[1]?.trim()
const BASE = (pick('NEXT_PUBLIC_SUPABASE_URL') || 'https://paizkjajbuxxksdoycev.supabase.co').replace(/\/$/, '')
const KEY = pick('SUPABASE_SERVICE_ROLE_KEY')
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local'); process.exit(1) }
const H = { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'application/json' }

const istTestSv = (email, istTest) =>
  istTest === true || /@claimondo\.(de|test)$/i.test(email ?? '')

async function main() {
  // Aktive, nicht geloeschte SVs + Email (expliziter FK wegen 2 profiles-FKs).
  const svs = await fetch(
    `${BASE}/rest/v1/sachverstaendige?ist_aktiv=eq.true&geloescht_am=is.null` +
    `&select=id,profile_id,paket,verifizierung_status,ist_testaccount,` +
    `profiles!sachverstaendige_profile_id_fkey(email)`,
    { headers: H },
  ).then((r) => r.json())
  if (!Array.isArray(svs)) { console.error('Query-Fehler:', JSON.stringify(svs).slice(0, 300)); process.exit(1) }

  const betroffen = []
  for (const sv of svs) {
    // frist_ueberschritten client-seitig ausschliessen (PostgREST not.eq wuerde NULL mit rausfiltern).
    if (sv.verifizierung_status === 'frist_ueberschritten') continue
    const email = Array.isArray(sv.profiles) ? sv.profiles[0]?.email : sv.profiles?.email
    if (istTestSv(email, sv.ist_testaccount)) continue
    // Tier-2-Docs geprueft?
    const docs = await fetch(
      `${BASE}/rest/v1/pflichtdokumente?sv_id=eq.${sv.id}&status=eq.geprueft` +
      `&dokument_typ=in.(${TIER2_SLOTS.join(',')})&select=dokument_typ`,
      { headers: H },
    ).then((r) => r.json())
    const geprueft = new Set(docs.map((d) => d.dokument_typ))
    if (TIER2_SLOTS.every((s) => geprueft.has(s))) continue // beide da → skip
    betroffen.push({ id: sv.id, email, paket: sv.paket, status: sv.verifizierung_status })
  }

  console.log(`\n${betroffen.length} SV(s) betroffen (aktiv, keine geprueften Tier-2-Docs, kein Test-SV):`)
  for (const b of betroffen) console.log(`  ${b.email}  [${b.paket}]  status=${b.status ?? 'NULL'}`)

  if (!LIVE) {
    console.log(`\nDRY-RUN — nichts geschrieben. Mit --live setzen (nach Aaron-Timing-Signal §9).`)
    return
  }

  const frist = new Date(Date.now() + FRIST_TAGE * 864e5).toISOString()
  let ok = 0
  for (const b of betroffen) {
    const res = await fetch(`${BASE}/rest/v1/sachverstaendige?id=eq.${b.id}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        verifizierung_status: 'ausstehend',
        verifizierung_frist_bis: frist,
        verifizierung_reminder_7d_gesendet_am: null,
      }),
    })
    if (res.ok) ok++
    else console.error(`  FEHLER ${b.email}: ${res.status}`)
  }
  console.log(`\nLIVE: ${ok}/${betroffen.length} auf ausstehend + Frist ${frist.slice(0, 10)} gesetzt.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
