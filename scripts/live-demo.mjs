// Live-Demo: nutzt einen existierenden komplett-Fall (CLM-009) und zeigt
// SV-Tagesmodus + Kunde-Fallakte SIDE-BY-SIDE während die Drive-State-
// Transitionen via DB applied werden.
//
// Variante zum Szenario-Smoke ohne Wizard-Klick (der ist flaky).

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.test' })

const envLocal = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }),
)
const admin = createClient(envLocal.NEXT_PUBLIC_SUPABASE_URL, envLocal.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const STAGING_USER = process.env.STAGING_BASIC_AUTH_USER
const STAGING_PASS = process.env.STAGING_BASIC_AUTH_PASS
const SV_EMAIL = process.env.SMOKE_TEST_SV_EMAIL ?? 'smoke-sv@claimondo.test'
const SV_PASS  = process.env.SMOKE_TEST_SV_PASSWORT ?? 'Test1234!'
const BASE     = 'https://app.staging.claimondo.de'

const FALL_NUMMER = process.argv[2] ?? 'CLM-20260513-009'

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = path.join('docs/14.05.2026-live-demo', ts)
mkdirSync(outDir, { recursive: true })

console.log(`▶ Live-Demo mit Fall ${FALL_NUMMER}`)
console.log('  Output:', outDir)

const { data: fall } = await admin.from('faelle')
  .select('id, fall_nummer, service_typ, sv_id, kunde_id, kunde_email, sa_unterschrieben_am, vollmacht_status')
  .eq('fall_nummer', FALL_NUMMER).single()
if (!fall) throw new Error(`Fall ${FALL_NUMMER} nicht gefunden`)
console.log('  Fall:', fall)

const { data: terminRow } = await admin.from('gutachter_termine')
  .select('id, sv_id, start_zeit, status, sv_unterwegs_seit, sv_angekommen_am, besichtigung_gestartet_am')
  .eq('fall_id', fall.id)
  .order('erstellt_am', { ascending: false }).limit(1).maybeSingle()
const termin = terminRow

if (!termin) {
  console.log('  ⚠ Kein gutachter_termine-Row für Fall — lege einen an (status=geplant)')
  const slotVon = new Date(Date.now() + 30 * 60 * 1000).toISOString() // in 30min
  const slotBis = new Date(Date.now() + 75 * 60 * 1000).toISOString()
  const { data: newTermin, error: terr } = await admin.from('gutachter_termine').insert({
    sv_id: fall.sv_id, fall_id: fall.id, start_zeit: slotVon, end_zeit: slotBis,
    // gutachter_termine_status_check: reserviert | bestaetigt | abgelehnt | abgesagt |
    // storniert | abgeschlossen | sv_gesucht | gegenvorschlag | verschoben | verlegt |
    // verlegung_pending. Demo nutzt 'bestaetigt'.
    // typ-Check: sv_begutachtung | kb_beratung | konfrontation
    status: 'bestaetigt', typ: 'sv_begutachtung',
  }).select('id').single()
  if (terr) throw new Error('Termin-Insert fail: ' + terr.message)
  console.log('  ✅ Neuer Termin:', newTermin)
}
const terminId = (terminRow?.id) ?? (await admin.from('gutachter_termine').select('id').eq('fall_id', fall.id).order('erstellt_am', { ascending: false }).limit(1).single()).data?.id
console.log('  Termin-ID:', terminId)

// ── Two browsers side-by-side ──
const browserKunde = await chromium.launch({
  headless: false, slowMo: 500,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-popup-blocking', '--window-position=0,0', '--window-size=1300,1000'],
})
const browserSv = await chromium.launch({
  headless: false, slowMo: 500,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-popup-blocking', '--window-position=1300,0', '--window-size=800,1000'],
})
const ctxKunde = await browserKunde.newContext({
  viewport: { width: 1280, height: 950 }, locale: 'de-DE', timezoneId: 'Europe/Berlin',
  ...(STAGING_USER && STAGING_PASS ? { httpCredentials: { username: STAGING_USER, password: STAGING_PASS } } : {}),
})
const ctxSv = await browserSv.newContext({
  viewport: { width: 780, height: 950 }, locale: 'de-DE', timezoneId: 'Europe/Berlin',
  ...(STAGING_USER && STAGING_PASS ? { httpCredentials: { username: STAGING_USER, password: STAGING_PASS } } : {}),
})
const kunde = await ctxKunde.newPage()
const sv = await ctxSv.newPage()

async function shoot(page, label) {
  await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true }).catch(() => {})
}

async function loginViaSetSession(page, ctx, email, password) {
  await ctx.addCookies([
    { name: 'claimondo_2fa_verified', value: '1', domain: '.claimondo.de', path: '/', sameSite: 'Lax', httpOnly: true, secure: true },
  ])
  let access_token, refresh_token
  if (password) {
    const sb = createClient(envLocal.NEXT_PUBLIC_SUPABASE_URL, envLocal.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error || !data?.session) throw new Error(`signInWithPassword: ${error?.message ?? 'no session'}`)
    access_token = data.session.access_token
    refresh_token = data.session.refresh_token
  } else {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink', email, options: { redirectTo: `${BASE}/` },
    })
    if (linkErr || !linkData?.properties?.hashed_token) throw new Error('generateLink: ' + (linkErr?.message ?? 'no hashed_token'))
    const sb = createClient(envLocal.NEXT_PUBLIC_SUPABASE_URL, envLocal.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const { data: vd, error: ve } = await sb.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties.hashed_token })
    if (ve || !vd?.session) throw new Error(`verifyOtp: ${ve?.message ?? 'no session'}`)
    access_token = vd.session.access_token
    refresh_token = vd.session.refresh_token
  }
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(async ({ url, anon, at, rt }) => {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
      s.onload = resolve; s.onerror = reject
      document.head.appendChild(s)
    })
     
    const sb = supabase.createClient(url, anon)
    await sb.auth.setSession({ access_token: at, refresh_token: rt })
  }, { url: envLocal.NEXT_PUBLIC_SUPABASE_URL, anon: envLocal.NEXT_PUBLIC_SUPABASE_ANON_KEY, at: access_token, rt: refresh_token })
}

try {
  console.log('\n→ 1/6 Logins via setSession (umgeht crashy /login Action)')
  await Promise.all([
    loginViaSetSession(kunde, ctxKunde, fall.kunde_email, null),
    loginViaSetSession(sv, ctxSv, SV_EMAIL, SV_PASS),
  ])

  console.log('→ 2/6 Beide Browser navigieren in ihre Portale')
  await Promise.all([
    kunde.goto(`${BASE}/kunde/faelle/${fall.id}`, { waitUntil: 'domcontentloaded' }),
    sv.goto(`${BASE}/gutachter/feldmodus`, { waitUntil: 'domcontentloaded' }),
  ])
  await Promise.all([kunde.bringToFront(), sv.bringToFront()])
  await new Promise(r => setTimeout(r, 4000))
  await shoot(kunde, '01-kunde-fallakte-vor-anfahrt')
  await shoot(sv, '01-sv-tagesmodus-vor-anfahrt')

  console.log('→ 3/6 SV-Losgefahren — DB-Update + Reload beider Browser')
  // sv_unterwegs_seit signalisiert die Anfahrt; status bleibt 'bestaetigt' (kein
  // gültiger Enum-Wert für "unterwegs").
  await admin.from('gutachter_termine').update({
    sv_unterwegs_seit: new Date().toISOString(),
  }).eq('id', terminId)
  await Promise.all([
    kunde.reload({ waitUntil: 'domcontentloaded' }),
    sv.reload({ waitUntil: 'domcontentloaded' }),
  ])
  await new Promise(r => setTimeout(r, 5000))
  await shoot(kunde, '02-kunde-sieht-sv-unterwegs')
  await shoot(sv, '02-sv-unterwegs')

  console.log('→ 4/6 GPS-Route (8 Wegpunkte × 3s = 24s Anfahrt)')
  await ctxSv.grantPermissions(['geolocation'])
  const route = [
    [50.962, 6.962], [50.957, 6.959], [50.952, 6.957],
    [50.946, 6.954], [50.940, 6.952], [50.935, 6.950],
    [50.930, 6.948], [50.926, 6.946],
  ]
  for (const [lat, lng] of route) {
    await ctxSv.setGeolocation({ latitude: lat, longitude: lng })
    await new Promise(r => setTimeout(r, 3000))
  }
  await shoot(sv, '03-sv-am-besichtigungsort')

  console.log('→ 5/6 SV-Angekommen + Besichtigung-gestartet — DB-Updates')
  const nowIso = new Date().toISOString()
  await admin.from('gutachter_termine').update({ sv_angekommen_am: nowIso }).eq('id', terminId)
  await Promise.all([
    kunde.reload({ waitUntil: 'domcontentloaded' }),
    sv.reload({ waitUntil: 'domcontentloaded' }),
  ])
  await new Promise(r => setTimeout(r, 5000))
  await shoot(kunde, '04-kunde-sieht-sv-angekommen')
  await shoot(sv, '04-sv-angekommen')

  await admin.from('gutachter_termine').update({ besichtigung_gestartet_am: nowIso }).eq('id', terminId)
  await admin.from('faelle').update({ besichtigung_gestartet_am: nowIso }).eq('id', fall.id)
  await Promise.all([
    kunde.reload({ waitUntil: 'domcontentloaded' }),
    sv.reload({ waitUntil: 'domcontentloaded' }),
  ])
  await new Promise(r => setTimeout(r, 5000))
  await shoot(kunde, '05-kunde-besichtigung-laeuft')
  await shoot(sv, '05-sv-besichtigung-laeuft')

  console.log('\n→ 6/6 Verify Vollmacht-Trigger')
  const { data: fallFinal } = await admin.from('faelle')
    .select('service_typ, sa_unterschrieben_am, vollmacht_status, vollmacht_signiert_am')
    .eq('id', fall.id).single()
  console.log('Final-State:', fallFinal)
  const vollmachtTriggerActive = fallFinal?.service_typ === 'komplett'
    && !!fallFinal?.sa_unterschrieben_am
    && (fallFinal?.vollmacht_status == null || fallFinal?.vollmacht_status === 'ausstehend')
    && !fallFinal?.vollmacht_signiert_am
  console.log(vollmachtTriggerActive ? '✅ Vollmacht-Trigger AKTIV (Subphase 2.1)' : '⚠ Vollmacht-Trigger inaktiv')

  console.log('\n✅ Demo fertig — Browser bleiben 180s offen.')
  await new Promise(r => setTimeout(r, 180000))
} catch (err) {
  console.log('\n❌', err.message)
  await shoot(kunde, 'FAIL-kunde').catch(() => {})
  await shoot(sv, 'FAIL-sv').catch(() => {})
  await new Promise(r => setTimeout(r, 60000))
} finally {
  await browserKunde.close().catch(() => {})
  await browserSv.close().catch(() => {})
  console.log('Output:', outDir)
}
