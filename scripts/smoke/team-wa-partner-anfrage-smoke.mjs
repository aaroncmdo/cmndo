// Regel-4-Prod-Smoke fuer PR #5007 (Team-WA bei Partner-Registrierung).
// UNTRACKED Smoke-Script (Muster map3/map5) — nicht committen.
//
// Ablauf `submit`: app.claimondo.de/werkstatt-partner-werden per Playwright ausfuellen
// (EXTERNE Identitaet ohne test/smoke/e2e-Marker -> Intern-Gate laesst die Team-WA durch),
// Erfolgs-Screen asserten, dann partner_leads-Row via PostgREST (service-role) verifizieren.
// Der WA-Empfang selbst wird auf den Team-Handys bestaetigt (Aaron = Empfaenger).
// Ablauf `cleanup`: die Marker-Row wieder loeschen.
//
// Aufruf:  node scripts/smoke/team-wa-partner-anfrage-smoke.mjs submit
//          node scripts/smoke/team-wa-partner-anfrage-smoke.mjs cleanup
// ENV: SUPABASE_URL + SERVICE_KEY aus .env.local (Pfad unten, Fallback Haupt-Checkout).

import { readFileSync, existsSync } from 'node:fs'
import { chromium } from '@playwright/test'

const BASE = process.env.SMOKE_BASE_URL ?? 'https://app.claimondo.de'

// Externe Wegwerf-Identitaet — DARF keine internen Marker tragen (interne-identitaet.ts:
// kein @claimondo/example/lex-drive, kein test|smoke|e2e-Token, kein Platzhalter-Name),
// sonst unterdrueckt das Gate die Team-WA und der Smoke beweist nichts.
const IDENT = {
  firma: 'KW Karosserie & Lack Wagenbrecht',
  vorname: 'Karla',
  nachname: 'Wagenbrecht',
  email: 'karla.wagenbrecht@kw-karosserie-lack.de', // kein Send an diese Adresse (Anfrage-Flow mailt den Prospect nicht)
  telefon: '0171 5550815', // Drama-Range; erscheint nur im WA-Text, wird nie angerufen/angeschrieben
  plz: '50667',
  ort: 'Koeln',
  marken: 'markenoffen',
  nachricht:
    'Regel-4-Verifikation Claimondo (interner Zustell-Check der Team-Benachrichtigung) — Eintrag wird direkt wieder geloescht.',
}

function ladeEnv() {
  const kandidaten = [
    new URL('../../.env.local', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'),
    'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local',
    'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/netzwerk-verbindungen-freundschaft/.env.local',
  ]
  for (const p of kandidaten) {
    if (!existsSync(p)) continue
    const txt = readFileSync(p, 'utf8')
    const env = {}
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[env] geladen aus ${p}`)
      return env
    }
  }
  throw new Error('.env.local mit NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY nicht gefunden')
}

async function rest(env, pfad, opts = {}) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pfad}`, {
    ...opts,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers ?? {}),
    },
  })
  const body = await r.text()
  if (!r.ok) throw new Error(`REST ${pfad} -> ${r.status}: ${body.slice(0, 300)}`)
  return body ? JSON.parse(body) : null
}

const filter = `partner_leads?email=eq.${encodeURIComponent(IDENT.email)}&select=id,rolle,status,source_channel,firma,email,plz,ort,rollen_details,erstellt_am`

async function submit() {
  const env = ladeEnv()

  // Vorbedingung: keine Alt-Row (Doppel-Submit erkennen)
  const vorher = await rest(env, filter)
  if (vorher.length > 0) {
    console.log(`[warn] ${vorher.length} bestehende Row(s) fuer die Marker-Email — erst cleanup fahren.`)
    process.exit(2)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto(`${BASE}/werkstatt-partner-werden`, { waitUntil: 'domcontentloaded' })
    // TextField bindet Label->Input; Fallback Placeholder (Muster map6: Felder ohne name-Attribut)
    const feld = async (label, placeholder, wert) => {
      const byLabel = page.getByLabel(label, { exact: false })
      if (await byLabel.count()) return byLabel.first().fill(wert)
      return page.getByPlaceholder(placeholder).first().fill(wert)
    }
    await feld('Firma', 'Musterwerkstatt GmbH', IDENT.firma)
    await feld('Vorname', 'Max', IDENT.vorname)
    await feld('Nachname', 'Mustermann', IDENT.nachname)
    await feld('E-Mail', 'kontakt@musterwerkstatt.de', IDENT.email)
    await feld('Telefon', '0151 23456789', IDENT.telefon)
    await feld('PLZ', '50667', IDENT.plz)
    await feld('Ort', 'Köln', IDENT.ort)
    await feld('Marken', 'z. B. VW, Audi, BMW — oder markenoffen', IDENT.marken)
    await page.locator('textarea').first().fill(IDENT.nachricht)
    await page.getByRole('button', { name: 'Anfrage absenden' }).click()
    await page.getByRole('heading', { name: 'Vielen Dank für Ihr Interesse!' }).waitFor({ timeout: 20000 })
    console.log('[ui] Erfolgs-Screen sichtbar')
  } finally {
    await browser.close()
  }

  // DB-Assert
  const rows = await rest(env, filter)
  if (rows.length !== 1) throw new Error(`DB-Assert fehlgeschlagen: ${rows.length} Rows statt 1`)
  const r = rows[0]
  const ok =
    r.rolle === 'werkstatt' &&
    r.status === 'neu' &&
    r.source_channel === 'marketing_bewerbung' &&
    r.firma === IDENT.firma &&
    r.plz === IDENT.plz
  console.log(`[db] partner_leads ${r.id} rolle=${r.rolle} status=${r.status} source=${r.source_channel} firma="${r.firma}" -> ${ok ? 'GRUEN' : 'ABWEICHUNG'}`)
  console.log('[wa] Jetzt Team-Handys pruefen: "Neue Werkstatt-Partner-Anfrage / KW Karosserie & Lack Wagenbrecht" muss angekommen sein.')
  console.log(`[cleanup] danach: node scripts/smoke/team-wa-partner-anfrage-smoke.mjs cleanup`)
  if (!ok) process.exit(1)
}

async function cleanup() {
  const env = ladeEnv()
  const rows = await rest(env, filter)
  if (rows.length === 0) {
    console.log('[cleanup] nichts zu loeschen')
    return
  }
  await rest(env, `partner_leads?email=eq.${encodeURIComponent(IDENT.email)}`, { method: 'DELETE' })
  console.log(`[cleanup] ${rows.length} partner_leads-Row(s) geloescht (${rows.map((r) => r.id).join(', ')})`)
  // Auch die Admin-In-App-Benachrichtigungen des Smoke-Laufs entfernen (Bell-Kollateral).
  const bells = await rest(
    env,
    `benachrichtigungen?typ=eq.werkstatt_partner_anfrage&titel=like.${encodeURIComponent('*' + IDENT.firma + '*')}`,
    { method: 'DELETE' },
  )
  console.log(`[cleanup] ${Array.isArray(bells) ? bells.length : 0} benachrichtigungen-Row(s) geloescht`)
}

const modus = process.argv[2]
if (modus === 'submit') await submit()
else if (modus === 'cleanup') await cleanup()
else {
  console.log('Nutzung: node scripts/smoke/team-wa-partner-anfrage-smoke.mjs <submit|cleanup>')
  process.exit(1)
}
