// Seed fuer den Regel-4-Prod-Smoke "Kunde kommt ohne Link ins Konto" — Weg 2 (E-Mail).
// Soll: memory/abnahmen/2026-09-19-kunde-kommt-ohne-link-ins-konto.md (1c, Weg 2)
// Plan: docs/superpowers/plans/2026-09-19-kunde-login-ohne-link.md (Task 10)
// Spec: tests/e2e/flows/kunde-login-ohne-link-smoke.spec.ts
//
// Geseedet wird NUR der Ausgangszustand, den ein fremder Eingang hinterlaesst, wenn der FlowLink
// nie ankam (Winters 19.09.: Lead + FlowLink mit gesendet_anzahl 0, kein Claim, kein Konto).
// Alles danach — Link anfordern, bestaetigen, Portal, "Jetzt fortsetzen" — ist ein echter
// UI-Klick in der Spec. Dieses Script beweist die Folgezustaende in der DB.
//
// Ablauf (zwei Playwright-Laeufe, weil zwischen ihnen die Mail "geoeffnet" wird):
//   1) node --env-file=<abs>/.env.local scripts/smoke/kunde-login-ohne-link-seed.mjs
//      -> schreibt scripts/smoke/.kunde-login-ohne-link-seed.json
//   2) PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test kunde-login-ohne-link-smoke --project=chromium
//      -> Test A tippt die E-Mail, klickt "Anmelde-Link per E-Mail senden", sieht den neutralen Satz
//   3) node ... kunde-login-ohne-link-seed.mjs --link [--token-hash=<auth.users.recovery_token>]
//      -> beweist: Konto ist entstanden (auth.users), Mail ist geloggt (email_log login_link);
//         schreibt magicLinkUrl in die Seed-Datei. Ohne --token-hash wird per Admin-API ein
//         Token GLEICHER Art erzeugt (generateLink magiclink) — email_log speichert keinen Body
//         und es gibt kein lesbares Postfach. Mit --token-hash (per MCP execute_sql aus
//         auth.users.recovery_token gelesen) wird der Hash der ECHTEN Mail geklickt.
//   4) npx playwright test ... (erneut) -> Test B oeffnet den Link, bestaetigt, sieht die Karte,
//      klickt "Jetzt fortsetzen", landet auf /flow/<token>, schreibt .kunde-login-ohne-link-result.json
//   5) node ... kunde-login-ohne-link-seed.mjs --verify   -> DB-Gegenprobe (profiles, flow_links, Timeline, Negativfall)
//   6) node ... kunde-login-ohne-link-seed.mjs --clean    -> Lead, FlowLinks, Timeline, Wegwerf-Konto weg
//
// Stufe 2 (Telefon-Weg): `--telefon` seedet den Lead NUR mit der Musternummer +4915512345678 (keine
// E-Mail). Test S in der Spec faehrt dann Telefon-Tab -> Code -> Portal — aber NUR, wenn die Nummer in
// der Supabase-Auth-Config als Test-Telefonnummer mit festem Code eingetragen ist und der Code als
// SMOKE_PHONE_OTP_CODE gesetzt wird. Ohne Test-Nummer wuerde Supabase eine ECHTE SMS an die Nummer
// schicken — deshalb ist der Test ohne Code hart uebersprungen.
//
// SICHERHEIT (Regel 4): telefon = null -> keine SMS/WhatsApp. Die einzige Mail geht an
// smoke-kunde+login-<ts>@claimondo.de (internes Postfach; sendLoginLink hat allowInternalRecipient).

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'

const MARKER = 'SMOKE-LOGIN-OHNE-LINK'
const OUT = 'scripts/smoke/.kunde-login-ohne-link-seed.json'
const RESULT = 'scripts/smoke/.kunde-login-ohne-link-result.json'
const MAIL_PREFIX = 'smoke-kunde+login-'
// Supabase-Test-Telefonnummer (Auth-Config `sms_test_otp`, gesetzt 21.09.2026, gueltig bis 21.10.):
// fuer sie sendet Auth KEINE SMS und akzeptiert nur den festen Code aus SMOKE_PHONE_OTP_CODE.
// Nummer aus dem fuer Drama/Test reservierten Berliner Block, in keinem echten Lead vorhanden.
// ⚠ Der CODE steht NICHT im Repo (oeffentlich) — nur in .env.local / als Secret.
const TEST_TELEFON = process.env.SMOKE_PHONE_TEST_NUMBER ?? '+4930231255555' // auth.users.phone ohne '+'
const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY noetig (node --env-file=<abs>/.env.local).')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const wert = (p) => args.find((a) => a.startsWith(`${p}=`))?.slice(p.length + 1) ?? null

function liesSeed() {
  if (!existsSync(OUT)) {
    console.error(`${OUT} fehlt — erst ohne Flag seeden.`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(OUT, 'utf8'))
}

async function alleUser() {
  // prod hat < 1.000 Konten (19.09.: 89) — eine Seite reicht; sonst hier paginieren.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  return data.users
}
async function userZuEmail(email) {
  const ziel = email.toLowerCase()
  return (await alleUser()).find((u) => (u.email ?? '').toLowerCase() === ziel) ?? null
}
async function loesche(name, query) {
  const { error } = await query
  if (error) throw new Error(`${name} loeschen: ${error.message}`)
}

async function aufraeumen() {
  const { data: alte, error } = await db
    .from('leads')
    .select('id, email')
    .or(`email.ilike.${MAIL_PREFIX}%,and(telefon.eq.${TEST_TELEFON},unfallort.eq.${MARKER})`)
  if (error) throw new Error(`leads lesen: ${error.message}`)
  for (const l of alte ?? []) {
    // Falls ein Lauf den Flow weitergeklickt hat: Claim-Satelliten zuerst (Muster termin-absage-seed).
    const { data: claims } = await db.from('claims').select('id').eq('lead_id', l.id)
    for (const c of claims ?? []) {
      await loesche('gutachter_termine', db.from('gutachter_termine').delete().eq('bezug_typ', 'fall').eq('bezug_id', c.id))
      await loesche('tasks', db.from('tasks').delete().eq('fall_id', c.id))
      await loesche('timeline', db.from('timeline').delete().eq('fall_id', c.id))
      await loesche('claims', db.from('claims').delete().eq('id', c.id))
    }
    await loesche('nachrichten', db.from('nachrichten').delete().eq('lead_id', l.id))
    await loesche('flow_links', db.from('flow_links').delete().eq('lead_id', l.id))
    await loesche('leads', db.from('leads').delete().eq('id', l.id))
  }
  // Wegwerf-Konten, die der UI-Klick angelegt hat (+ ein etwaiger Negativfall-Ausreisser).
  const weg = (await alleUser()).filter((u) => {
    const e = (u.email ?? '').toLowerCase()
    return e.startsWith(MAIL_PREFIX) || /^niemand-\d+@example\.test$/.test(e) || (u.phone ?? '') === TEST_TELEFON.replace(/^\+/, '')
  })
  for (const u of weg) {
    const { error: dErr } = await db.auth.admin.deleteUser(u.id) // profiles haengt per CASCADE dran
    if (dErr) throw new Error(`deleteUser ${u.email}: ${dErr.message}`)
  }
  for (const f of [OUT, RESULT]) if (existsSync(f)) unlinkSync(f)
  console.log(`aufgeraeumt: ${(alte ?? []).length} Lead(s), ${weg.length} Konto/Konten`)
}

if (flag('--clean')) {
  await aufraeumen()
  process.exit(0)
}

if (flag('--link')) {
  const seed = liesSeed()
  if (!seed.email) {
    console.log('Telefon-Modus: kein Anmelde-Link — Test S faehrt den Code-Weg direkt (SMOKE_PHONE_OTP_CODE).')
    process.exit(0)
  }
  const user = await userZuEmail(seed.email)
  if (!user) {
    console.error(`BEFUND: kein auth.users-Konto fuer ${seed.email} — "Anmelde-Link senden" hat kein Konto angelegt.`)
    process.exit(1)
  }
  const { data: log, error: logErr } = await db
    .from('email_log')
    .select('status, gesendet_am, fehler, created_at')
    .eq('empfaenger', seed.email)
    .eq('template', 'login_link')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (logErr) throw new Error(`email_log: ${logErr.message}`)
  if (!log) {
    console.error(`BEFUND: kein email_log-Eintrag (template=login_link) fuer ${seed.email}.`)
    process.exit(1)
  }
  console.log(`Konto: ${user.id} (angelegt ${user.created_at})`)
  console.log(`email_log: status=${log.status} gesendet_am=${log.gesendet_am ?? '-'} fehler=${log.fehler ?? '-'}`)

  let hash = wert('--token-hash')
  let tokenQuelle = 'auth.users.recovery_token (Hash der echten Mail)'
  if (!hash) {
    const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: seed.email })
    if (error) throw new Error(`generateLink: ${error.message}`)
    hash = data.properties.hashed_token
    tokenQuelle = 'generateLink magiclink (Ersatz-Token gleicher Art — kein lesbares Postfach)'
  }
  const magicLinkUrl = `${APP}/auth/bestaetigen?token_hash=${encodeURIComponent(hash)}&type=magiclink&next=${encodeURIComponent('/kunde')}`
  writeFileSync(OUT, JSON.stringify({ ...seed, userId: user.id, emailLogStatus: log.status, magicLinkUrl, tokenQuelle }, null, 2))
  console.log(`magicLinkUrl geschrieben (${tokenQuelle}). Jetzt Playwright erneut -> Test B.`)
  process.exit(0)
}

if (flag('--verify')) {
  const seed = liesSeed()
  const fehler = []
  const user = seed.email
    ? await userZuEmail(seed.email)
    : (await alleUser()).find((u) => (u.phone ?? '') === String(seed.telefon).replace(/^\+/, '')) ?? null
  if (!user) fehler.push(seed.email ? 'auth.users: Konto fehlt' : `auth.users: kein Konto mit phone ${seed.telefon}`)
  if (user && !seed.email && user.email) fehler.push(`auth.users.email sollte NULL sein, ist ${user.email}`)
  let prof = null
  if (user) {
    const { data } = await db.from('profiles').select('rolle, auth_provider, vorname, email').eq('id', user.id).maybeSingle()
    prof = data
  }
  if (prof?.rolle !== 'kunde') fehler.push(`profiles.rolle = ${prof?.rolle ?? 'FEHLT'} (erwartet kunde)`)
  const erwarteterProvider = seed.email ? 'email' : 'phone'
  if (prof && prof.auth_provider !== erwarteterProvider) fehler.push(`profiles.auth_provider = ${prof.auth_provider} (erwartet ${erwarteterProvider})`)
  if (prof && !seed.email && prof.email !== null) fehler.push(`profiles.email sollte NULL sein, ist ${prof.email}`)

  const { data: links } = await db.from('flow_links').select('token').eq('lead_id', seed.leadId)
  let result = null
  try {
    result = JSON.parse(readFileSync(RESULT, 'utf8'))
  } catch {
    /* Spec B nicht gelaufen */
  }
  if (!result?.flowUrl) fehler.push(`${RESULT} fehlt — Test B ("Jetzt fortsetzen") ist nicht gelaufen`)
  else {
    const token = result.flowUrl.split('/flow/')[1]?.split(/[?#]/)[0] ?? ''
    if (!(links ?? []).some((l) => l.token === token)) fehler.push(`Token aus /flow/-URL (${token.slice(0, 8)}…) gehoert nicht zum Seed-Lead`)
  }

  const { data: timeline } = await db
    .from('nachrichten')
    .select('id, nachricht')
    .eq('lead_id', seed.leadId)
    .eq('system_event', 'kunde_selbst_angemeldet')
  if (!(timeline ?? []).length) fehler.push('nachrichten: kein Eintrag system_event=kunde_selbst_angemeldet am Seed-Lead')

  const neg = seed.negativEmail ? await userZuEmail(seed.negativEmail) : null
  if (neg) fehler.push(`Negativfall: fuer ${seed.negativEmail} wurde ein Konto angelegt (Signup-Leck)`)

  console.log(
    JSON.stringify(
      {
        konto: user?.id ?? null,
        profil: prof,
        flowLinksAmLead: (links ?? []).length,
        flowUrl: result?.flowUrl ?? null,
        timelineEintraege: (timeline ?? []).length,
        negativKonto: neg?.id ?? null,
        tokenQuelle: seed.tokenQuelle ?? null,
      },
      null,
      2,
    ),
  )
  if (fehler.length) {
    console.error(`VERIFY ROT (${fehler.length}):\n- ${fehler.join('\n- ')}`)
    process.exit(1)
  }
  console.log('VERIFY GRUEN')
  process.exit(0)
}

// ---- Seed ----------------------------------------------------------------------------------
await aufraeumen()
const ts = Date.now()
const telefonModus = flag('--telefon')
const email = telefonModus ? null : `${MAIL_PREFIX}${ts}@claimondo.de`
const negativEmail = telefonModus ? null : `niemand-${ts}@example.test`
const telefon = telefonModus ? TEST_TELEFON : null

const { data: lead, error: lErr } = await db
  .from('leads')
  .insert({
    status: 'flow-gesendet',
    email,
    telefon, // Regel 4: null (E-Mail-Weg) oder die Musternummer (Telefon-Weg, nur mit Supabase-Test-Nummer)
    vorname: 'Smoke',
    nachname: 'Login ohne Link',
    schuldfrage: 'gegner',
    abrechnungsweg: 'haftpflicht',
    service_typ: 'nur_gutachter',
    source_channel: 'self_service',
    unfallort: MARKER,
    kunde_plz: '50667',
    kunde_stadt: 'Köln',
    unfallhergang: 'Auffahrunfall an der Ampel, Gegner ist aufgefahren.',
    kennzeichen: 'K-LL 1909',
    fahrzeug_hersteller: 'VW',
    fahrzeug_modell: 'Golf',
  })
  .select('id')
  .single()
if (lErr) throw new Error(`lead: ${lErr.message}`)

// FlowLink, wie ihn der Eingang hinterlaesst — nie zugestellt (gesendet_anzahl bleibt 0).
const { data: fl, error: fErr } = await db
  .from('flow_links')
  .insert({
    lead_id: lead.id,
    expires_at: new Date(Date.now() + 72 * 3600e3).toISOString(),
    service_typ: 'nur_gutachter',
    sprache: 'de',
  })
  .select('token')
  .single()
if (fErr) throw new Error(`flow_links: ${fErr.message}`)

writeFileSync(
  OUT,
  JSON.stringify(
    {
      leadId: lead.id,
      email,
      telefon,
      otpCode: telefonModus ? (process.env.SMOKE_PHONE_OTP_CODE ?? null) : null,
      negativEmail,
      flowToken: fl.token,
      erstelltAm: new Date().toISOString(),
    },
    null,
    2,
  ),
)
console.log(`Seed: Lead ${lead.id} <${email ?? telefon}> ohne Claim, ohne Konto; FlowLink ${fl.token.slice(0, 8)}… -> ${OUT}`)
