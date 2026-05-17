#!/usr/bin/env node
/**
 * scripts/smoke-cmm44-spa2-pr1a.mjs
 *
 * Portal-Smoke nach CMM-44 SP-A2 PR1a — Schadenort + Datum Reader-Rename
 * von faelle-Spalten auf claims.
 *
 * PR1a (#1417, gemergt nach staging) hat 11 faelle-Reads auf claims umgestellt:
 *   schadens_adresse / unfallort   -> schadenort_adresse
 *   schadens_plz                   -> schadenort_plz
 *   schadens_ort                   -> schadenort_ort
 *   unfallort_kategorie            -> schadenort_kategorie
 *   unfallort_lat / unfallort_lng  -> schadenort_lat / schadenort_lng
 *   schadens_datum / unfalldatum   -> schadentag
 *   schadens_entdeckt_am           -> entdeckt_am
 *   unfall_uhrzeit                 -> schadenzeit
 *
 * Kein DB-Schema-Change. Ziel: prüfen, dass diese Werte in der UI UNVERÄNDERT
 * erscheinen und kein Portal crasht.
 *
 * Testet 5 Portale gegen app.staging.claimondo.de:
 *   1. Public   → / + /gutachter-finden (kein 500)
 *   2. Admin    → /faelle (Liste) + /faelle/[id] (Detail)
 *                 Fokus: Schadenort, Schadenadresse/PLZ, Schadendatum,
 *                 Schadenzeit, Unfallort-Kategorie sichtbar
 *                 + Schadenort-Suche auf /faelle (separater claims-Query)
 *   3. SV       → /gutachter + SV-Fall-Detail → Schadenort/Datum sichtbar
 *   4. Kunde    → /kunde + /kunde/faelle/[id] → Schadenort/Datum in Kundensicht
 *   5. Dispatch → /dispatch + /dispatch/leads (kein Crash)
 *
 * Verwendung:
 *   node --env-file=.env.local scripts/smoke-cmm44-spa2-pr1a.mjs
 *
 * ENV (aus .env.local geladen):
 *   STAGING_BASIC_AUTH_USER  / STAGING_BASIC_AUTH_PASS
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *
 * Screenshots: docs/17.05.2026/cmm44-spa2-smoke-pr1a/
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// ─── ENV laden ───────────────────────────────────────────────────────────────
function ladeEnv() {
  const kandidaten = [
    join(PROJECT_ROOT, '.env.local'),
    join(PROJECT_ROOT, '..', 'claimondo-v2', '.env.local'),
    join(PROJECT_ROOT, '..', '..', '..', '.env.local'),
  ]
  for (const envPath of kandidaten) {
    if (!existsSync(envPath)) continue
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (!(k in process.env)) process.env[k] = v
    }
    console.log(`[env] Geladen aus: ${envPath}`)
    break
  }
}
ladeEnv()

// ─── Konfiguration ────────────────────────────────────────────────────────────
const BASE = 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER || process.env.STAGING_BASIC_USER || 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS || process.env.STAGING_BASIC_PASS || 'ClaimondoSuperuser123789!!'
const TEST_PASS = 'Test1234!'
const OUT_DIR = join(PROJECT_ROOT, 'docs', '17.05.2026', 'cmm44-spa2-smoke-pr1a')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

mkdirSync(OUT_DIR, { recursive: true })

// ─── Befunde ─────────────────────────────────────────────────────────────────
const findings = []
function notiere(portal, route, status, notiz = '') {
  findings.push({ portal, route, status, notiz, ts: new Date().toISOString() })
  const icon = status === 'OK' ? '✓' : status === 'WARN' ? '⚠' : '✗'
  console.log(`  ${icon} [${portal}] ${route}: ${status}${notiz ? ' — ' + notiz : ''}`)
}

// ─── Screenshot-Helfer ───────────────────────────────────────────────────────
let stepCounter = 0
async function shoot(page, label) {
  const nr = String(++stepCounter).padStart(4, '0')
  const safeName = label.replace(/[^a-z0-9äöüÄÖÜß_-]/gi, '-').slice(0, 60)
  const pfad = join(OUT_DIR, `${nr}-${safeName}.png`)
  await page.screenshot({ path: pfad, fullPage: false }).catch((e) =>
    console.warn(`  [screenshot] ${safeName} fehlgeschlagen: ${e.message}`)
  )
  console.log(`  📸 ${nr}-${safeName}.png`)
  return pfad
}

// ─── Console-Error-Collector ─────────────────────────────────────────────────
function setupConsoleCollector(page) {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text()
      if (!txt.includes('favicon') && !txt.includes('net::ERR') && !txt.includes('Mixed Content')) {
        errors.push(txt.slice(0, 250))
      }
    }
  })
  page.on('pageerror', (err) => errors.push(`PAGE-ERROR: ${err.message.slice(0, 250)}`))
  return errors
}

// ─── 5xx-Detektor ────────────────────────────────────────────────────────────
function setup5xxCollector(page) {
  const fives = []
  page.on('response', (resp) => {
    if (resp.status() >= 500) fives.push(`${resp.status()} ${resp.url().slice(0, 150)}`)
  })
  return fives
}

// ─── Hydration-Check ─────────────────────────────────────────────────────────
async function pruefeHydration(page) {
  return page.evaluate(() => {
    const ovls = [...document.querySelectorAll('[data-nextjs-dialog-overlay], #nextjs-toast-errors')]
    return ovls.map((el) => el.innerText).filter(Boolean)
  }).catch(() => [])
}

// ─── Login ───────────────────────────────────────────────────────────────────
async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.fill('input[type="email"], input[name="email"], #email', email).catch(async () => {
    await page.locator('input').first().fill(email)
  })
  await page.fill('input[type="password"], input[name="password"], #password', password).catch(async () => {
    await page.locator('input[type="password"]').first().fill(password)
  })
  await page.click('button[type="submit"]').catch(async () => {
    await page.keyboard.press('Enter')
  })
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const url = page.url()
  if (url.includes('/login')) {
    console.log(`  ✗ Login fehlgeschlagen — URL: ${url}`)
    return false
  }
  console.log(`  ✓ Login OK → ${url}`)
  return true
}

// ─── Goto + Screenshot ───────────────────────────────────────────────────────
async function gotoUndShoot(page, route, label) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.waitForTimeout(2000)
    const screenshotPfad = await shoot(page, label)
    const bodyText = await page.locator('body').innerText().catch(() => '')
    const has500 = /Internal Server Error|Application error|500/.test(bodyText) && bodyText.length < 800
    const isBlank = bodyText.trim().length < 30
    return { ok: !has500 && !isBlank, url: page.url(), screenshotPfad, has500, isBlank, bodyText }
  } catch (e) {
    console.log(`  ✗ Navigation fehlgeschlagen: ${e.message.slice(0, 120)}`)
    await shoot(page, `${label}-fehler`)
    return { ok: false, error: e.message, bodyText: '' }
  }
}

// ─── Service-Role REST-Helfer ─────────────────────────────────────────────────
async function sbGet(pathQuery) {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${pathQuery}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

// Verknüpfung: faelle.claim_id -> claims.id. claims hat KEIN fall_id.
const CLAIM_COLS = 'id,schadenort_adresse,schadenort_plz,schadenort_ort,schadenort_kategorie,schadentag,schadenzeit,entdeckt_am'

// Fall + claim für einen gegebenen fall_id holen → { fall_id, claim... }
async function claimFuerFall(fallId) {
  if (!fallId) return null
  const fRows = await sbGet(`faelle?select=id,claim_id&id=eq.${fallId}&limit=1`)
  const claimId = fRows?.[0]?.claim_id
  if (!claimId) return { fall_id: fallId }
  const cRows = await sbGet(`claims?select=${CLAIM_COLS}&id=eq.${claimId}&limit=1`)
  return cRows?.[0] ? { fall_id: fallId, ...cRows[0] } : { fall_id: fallId }
}

// Fall mit gefüllten Schadenort-Daten finden (Admin + Such-Test).
// Bevorzugt ein claim mit schadenort_ort != null, damit der Werte-Abgleich greift.
async function ersterFallMitSchadenort() {
  const claims = await sbGet(
    `claims?select=${CLAIM_COLS}&schadenort_ort=not.is.null&order=created_at.desc&limit=5`
  )
  if (claims && claims.length) {
    for (const c of claims) {
      const f = await sbGet(`faelle?select=id&claim_id=eq.${c.id}&limit=1`)
      if (f && f[0]) return { fall_id: f[0].id, ...c }
    }
  }
  // Fallback: irgendein Fall
  const any = await sbGet('faelle?select=id,claim_id&order=erstellt_am.desc&limit=1')
  if (any && any[0]) return claimFuerFall(any[0].id)
  return null
}

// SV-Fall: claims.sv_id == test-sv's sachverstaendige.id; bevorzugt mit Schadenort.
async function ersterSvFall() {
  const profiles = await sbGet('profiles?select=id&email=eq.test-sv%40claimondo.de&limit=1')
  const svProfileId = profiles?.[0]?.id
  if (!svProfileId) return null
  const svRows = await sbGet(`sachverstaendige?select=id&profile_id=eq.${svProfileId}&limit=1`)
  const svId = svRows?.[0]?.id
  if (!svId) return null
  // Erst claims mit Schadenort-Daten, dann beliebige
  for (const filter of [`&schadenort_ort=not.is.null`, '']) {
    const claims = await sbGet(`claims?select=${CLAIM_COLS}&sv_id=eq.${svId}${filter}&limit=1`)
    if (claims && claims[0]) {
      const f = await sbGet(`faelle?select=id&claim_id=eq.${claims[0].id}&limit=1`)
      if (f && f[0]) return { fall_id: f[0].id, ...claims[0] }
    }
  }
  // Fallback über auftraege
  const auftraege = await sbGet(`auftraege?select=fall_id&sv_id=eq.${svId}&limit=1`)
  if (auftraege && auftraege[0]) return claimFuerFall(auftraege[0].fall_id)
  return null
}

// Kunde-Fall: claims.geschaedigter_user_id == test-kunde profile-id; bevorzugt mit Schadenort.
async function ersterKundeFall() {
  const profiles = await sbGet('profiles?select=id&email=eq.test-kunde%40claimondo.de&limit=1')
  const kundeId = profiles?.[0]?.id
  if (!kundeId) return null
  for (const filter of [`&schadenort_ort=not.is.null`, '']) {
    const claims = await sbGet(
      `claims?select=${CLAIM_COLS}&geschaedigter_user_id=eq.${kundeId}${filter}&limit=1`
    )
    if (claims && claims[0]) {
      const f = await sbGet(`faelle?select=id&claim_id=eq.${claims[0].id}&limit=1`)
      if (f && f[0]) return { fall_id: f[0].id, ...claims[0] }
    }
  }
  // Fallback über faelle.kunde_id
  const faelle = await sbGet(`faelle?select=id,claim_id&kunde_id=eq.${kundeId}&limit=1`)
  if (faelle && faelle[0]) return claimFuerFall(faelle[0].id)
  return null
}

// Vollständigen sichtbaren Text einsammeln — innerText PLUS alle input/textarea
// value-Attribute (Admin-Stammdaten rendert Werte in <input>, nicht als Text).
async function sichtbarerText(page) {
  const body = await page.locator('body').innerText().catch(() => '')
  const inputs = await page.evaluate(() =>
    [...document.querySelectorAll('input, textarea, select')]
      .map((el) => (el.value || el.getAttribute('value') || '')).filter(Boolean).join(' ␀ ')
  ).catch(() => '')
  return `${body}\n${inputs}`
}

// ─── Schadenort-Werte-Check ──────────────────────────────────────────────────
// Prüft, ob die aus claims erwarteten Werte im UI-Text (inkl. Input-Values) auftauchen.
function pruefeSchadenortWerte(bodyText, claim, portal, route) {
  if (!claim) {
    notiere(portal, `${route} schadenort-werte`, 'WARN', 'Kein claim-Datensatz zum Abgleich')
    return
  }
  const treffer = []
  const fehlt = []
  // Adresse / Ort / PLZ
  for (const [feld, wert] of [
    ['schadenort_ort', claim.schadenort_ort],
    ['schadenort_adresse', claim.schadenort_adresse],
    ['schadenort_plz', claim.schadenort_plz],
  ]) {
    if (!wert) continue
    const w = String(wert).trim()
    if (w.length < 2) continue
    if (bodyText.includes(w)) treffer.push(`${feld}="${w}"`)
    else fehlt.push(`${feld}="${w}"`)
  }
  // Datum: schadentag (ISO yyyy-mm-dd) -> dd.mm.yyyy in UI
  if (claim.schadentag) {
    const iso = String(claim.schadentag).slice(0, 10)
    const [y, m, d] = iso.split('-')
    const deDatum = d && m && y ? `${d}.${m}.${y}` : null
    if (deDatum && (bodyText.includes(deDatum) || bodyText.includes(iso))) {
      treffer.push(`schadentag=${deDatum}`)
    } else if (deDatum) {
      fehlt.push(`schadentag=${deDatum}`)
    }
  }
  // undefined / NaN als Negativ-Indikator
  const hatUndefined = /\bundefined\b|\bNaN\b|Invalid Date/.test(bodyText)
  if (treffer.length > 0 && fehlt.length === 0 && !hatUndefined) {
    notiere(portal, `${route} schadenort-werte`, 'OK', `Werte sichtbar: ${treffer.join(', ')}`)
  } else if (treffer.length > 0) {
    notiere(portal, `${route} schadenort-werte`, 'WARN',
      `Sichtbar: ${treffer.join(', ')} | NICHT gefunden: ${fehlt.join(', ') || '-'}${hatUndefined ? ' | undefined/NaN im Text!' : ''}`)
  } else {
    notiere(portal, `${route} schadenort-werte`, 'WARN',
      `Keiner der claims-Werte im UI-Text gefunden (Fall hat evtl. keine Schadenort-Daten oder Werte hinter Tab)`)
  }
}

// ─── 1. PUBLIC ───────────────────────────────────────────────────────────────
async function smokePublic(browser) {
  console.log('\n════════ PUBLIC (kein Login) ════════')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE', timezoneId: 'Europe/Berlin', ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)

  for (const [route, label] of [
    ['/', 'public-home'],
    ['/gutachter-finden', 'public-gutachter-finden'],
  ]) {
    errors.length = 0; fives.length = 0
    const r = await gotoUndShoot(page, route, label)
    const hydErr = await pruefeHydration(page)
    const ok = r.ok && fives.length === 0 && hydErr.length === 0
    notiere('public', route, ok ? 'OK' : 'WARN', [
      r.has500 ? '500!' : '', r.isBlank ? 'Leerer Screen!' : '',
      errors.length > 0 ? `${errors.length} console-errors` : '',
      fives.length > 0 ? `5xx: ${fives.join(', ').slice(0, 80)}` : '',
      hydErr.length > 0 ? `Hydration: ${hydErr[0].slice(0, 100)}` : '',
    ].filter(Boolean).join(' | '))
  }
  await context.close()
}

// ─── 2. ADMIN ────────────────────────────────────────────────────────────────
async function smokeAdmin(browser, claim) {
  console.log('\n════════ ADMIN ════════')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE', timezoneId: 'Europe/Berlin', ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)

  const loginOk = await login(page, 'test-admin@claimondo.de', TEST_PASS)
  await shoot(page, 'admin-nach-login')
  if (!loginOk) {
    notiere('admin', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  // Faelle-Liste
  errors.length = 0; fives.length = 0
  const listResult = await gotoUndShoot(page, '/faelle', 'admin-faelle-liste')
  const hydListErr = await pruefeHydration(page)
  notiere('admin', '/faelle', listResult.ok && fives.length === 0 ? 'OK' : 'WARN', [
    listResult.has500 ? '500!' : '', listResult.isBlank ? 'Leerer Screen!' : '',
    fives.length > 0 ? `5xx: ${fives.slice(0, 2).join(', ')}` : '',
    hydListErr.length > 0 ? `Hydration: ${hydListErr[0].slice(0, 80)}` : '',
  ].filter(Boolean).join(' | '))

  // ──── Schadenort-Suche auf /faelle (separater claims-Query in PR1a) ────────
  if (claim?.schadenort_ort) {
    const suchbegriff = String(claim.schadenort_ort).trim()
    try {
      const searchInput = page.locator(
        'input[type="search"], input[placeholder*="uche"], input[placeholder*="Such"], input[name*="search"]'
      ).first()
      if ((await searchInput.count()) > 0) {
        await searchInput.fill(suchbegriff)
        await page.waitForTimeout(2500)
        await shoot(page, 'admin-faelle-schadenort-suche')
        const afterSearch = await page.locator('body').innerText().catch(() => '')
        const treffer = afterSearch.includes(suchbegriff) &&
          !/Keine (Fälle|Ergebnisse|Treffer)/i.test(afterSearch)
        notiere('admin', `/faelle?suche=${suchbegriff}`, treffer ? 'OK' : 'WARN',
          treffer ? `Schadenort-Suche liefert Treffer für "${suchbegriff}"`
                  : `Schadenort-Suche "${suchbegriff}" — kein eindeutiger Treffer (evtl. anderes Such-Pattern)`)
      } else {
        notiere('admin', '/faelle suche', 'WARN', 'Kein Such-Input auf /faelle gefunden')
      }
    } catch (e) {
      notiere('admin', '/faelle suche', 'WARN', `Such-Test-Fehler: ${e.message.slice(0, 80)}`)
    }
    // Zurück zur sauberen Liste
    await page.goto(`${BASE}/faelle`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
    await page.waitForTimeout(1500)
  } else {
    notiere('admin', '/faelle suche', 'WARN', 'Kein Schadenort-Wert zum Suchen vorhanden')
  }

  // Fall-Detail
  let detailUrl = claim?.fall_id ? `/faelle/${claim.fall_id}` : null
  if (!detailUrl) {
    const link = page.locator('a[href*="/faelle/"]').first()
    if ((await link.count()) > 0) detailUrl = await link.getAttribute('href')
  }

  if (detailUrl) {
    errors.length = 0; fives.length = 0
    const detailResult = await gotoUndShoot(page, detailUrl, 'admin-fall-detail')
    const hydDetailErr = await pruefeHydration(page)
    notiere('admin', detailUrl, detailResult.ok && fives.length === 0 ? 'OK' : 'WARN', [
      detailResult.has500 ? '500!' : '', detailResult.isBlank ? 'Leerer Screen!' : '',
      fives.length > 0 ? `5xx: ${fives.slice(0, 2).join(', ')}` : '',
      hydDetailErr.length > 0 ? `Hydration: ${hydDetailErr[0].slice(0, 80)}` : '',
    ].filter(Boolean).join(' | '))

    // Versuch: Schadenort-/Schaden-Tab oder Stammdaten öffnen
    await page.waitForTimeout(1000)
    const schadenTab = page.locator(
      '[role="tab"]:has-text("Schaden"), [role="tab"]:has-text("Stammdaten"), [role="tab"]:has-text("Übersicht"), button:has-text("Schaden"), button:has-text("Stammdaten")'
    )
    if ((await schadenTab.count()) > 0) {
      await schadenTab.first().click().catch(() => {})
      await page.waitForTimeout(1500)
    }
    // Komplett durchscrollen — die Unfall-SectionCard liegt weit unten in der Übersicht.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 80))
      }
      window.scrollTo(0, 0)
    }).catch(() => {})
    await page.waitForTimeout(800)
    await shoot(page, 'admin-fall-schaden-tab')
    // Werte stehen in <input value="…"> — sichtbarerText() liest die mit.
    const bodyText = await sichtbarerText(page)

    // Schadenort-Sektion vorhanden?
    const hatSchadenort = /Schadenort|Schadensort|Unfallort|Schadenadresse/i.test(bodyText)
    notiere('admin', 'detail-schadenort-sektion', hatSchadenort ? 'OK' : 'WARN',
      hatSchadenort ? 'Schadenort/Unfallort-Bereich sichtbar' : 'Kein Schadenort-Label gefunden')
    // Datum-Label
    const hatDatum = /Schadendatum|Schadentag|Unfalldatum|Schadenzeit|Uhrzeit/i.test(bodyText)
    notiere('admin', 'detail-schadendatum-label', hatDatum ? 'OK' : 'WARN',
      hatDatum ? 'Schadendatum/-zeit-Label sichtbar' : 'Kein Datum/Zeit-Label gefunden')
    // Konkrete claims-Werte abgleichen
    pruefeSchadenortWerte(bodyText, claim, 'admin', 'detail')
  } else {
    notiere('admin', '/faelle/[id]', 'WARN', 'Kein Fall-Detail-Link gefunden')
  }

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (Admin): ${errors.length}`)
    errors.slice(0, 5).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }
  await context.close()
}

// ─── 3. SV (Gutachter) ───────────────────────────────────────────────────────
async function smokeSv(browser, svClaim) {
  console.log('\n════════ SV (Gutachter) ════════')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE', timezoneId: 'Europe/Berlin', ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)

  const loginOk = await login(page, 'test-sv@claimondo.de', TEST_PASS)
  await shoot(page, 'sv-nach-login')
  if (!loginOk) {
    notiere('sv', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  errors.length = 0; fives.length = 0
  const dashResult = await gotoUndShoot(page, '/gutachter', 'sv-dashboard')
  notiere('sv', '/gutachter', dashResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [dashResult.has500 ? '500!' : '', dashResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  // SV-Fall-Detail
  let svDetailUrl = svClaim?.fall_id ? `/gutachter/fall/${svClaim.fall_id}` : null
  if (!svDetailUrl) {
    errors.length = 0; fives.length = 0
    const auftraegeResult = await gotoUndShoot(page, '/gutachter/auftraege', 'sv-auftraege')
    notiere('sv', '/gutachter/auftraege', auftraegeResult.ok ? 'OK' : 'WARN',
      auftraegeResult.has500 ? '500!' : auftraegeResult.isBlank ? 'Leer!' : '')
    const link = page.locator('a[href*="/gutachter/fall/"], a[href*="/gutachter/auftraege/"]').first()
    if ((await link.count()) > 0) svDetailUrl = await link.getAttribute('href')
  }

  if (svDetailUrl) {
    errors.length = 0; fives.length = 0
    const detailResult = await gotoUndShoot(page, svDetailUrl, 'sv-fall-detail')
    const hydDetErr = await pruefeHydration(page)
    notiere('sv', svDetailUrl, detailResult.ok && fives.length === 0 ? 'OK' : 'WARN', [
      detailResult.has500 ? '500!' : '', detailResult.isBlank ? 'Leerer Screen!' : '',
      fives.length > 0 ? `5xx: ${fives[0]}` : '',
      hydDetErr.length > 0 ? `Hydration: ${hydDetErr[0].slice(0, 80)}` : '',
    ].filter(Boolean).join(' | '))

    await page.waitForTimeout(1000)
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80))
      }
      window.scrollTo(0, 0)
    }).catch(() => {})
    await page.waitForTimeout(600)
    const svBodyText = await sichtbarerText(page)
    const hatSchadenort = /Schadenort|Schadensort|Unfallort|Schadenadresse/i.test(svBodyText)
    notiere('sv', 'detail-schadenort-sektion', hatSchadenort ? 'OK' : 'WARN',
      hatSchadenort ? 'Schadenort-Bereich sichtbar' : 'Kein Schadenort-Label gefunden')
    pruefeSchadenortWerte(svBodyText, svClaim, 'sv', 'detail')
  } else {
    notiere('sv', '/gutachter/fall/[id]', 'WARN', 'Kein SV-Fall-Link gefunden')
    await shoot(page, 'sv-kein-fall-link')
  }

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (SV): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }
  await context.close()
}

// ─── 4. KUNDE ────────────────────────────────────────────────────────────────
async function smokeKunde(browser, kundeClaim) {
  console.log('\n════════ KUNDE ════════')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE', timezoneId: 'Europe/Berlin', ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)

  const loginOk = await login(page, 'test-kunde@claimondo.de', TEST_PASS)
  await shoot(page, 'kunde-nach-login')
  if (!loginOk) {
    notiere('kunde', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  errors.length = 0; fives.length = 0
  const dashResult = await gotoUndShoot(page, '/kunde', 'kunde-dashboard')
  notiere('kunde', '/kunde', dashResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [dashResult.has500 ? '500!' : '', dashResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  errors.length = 0; fives.length = 0
  const faelleResult = await gotoUndShoot(page, '/kunde/faelle', 'kunde-faelle-liste')
  notiere('kunde', '/kunde/faelle', faelleResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [faelleResult.has500 ? '500!' : '', faelleResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  let kundeDetailUrl = kundeClaim?.fall_id ? `/kunde/faelle/${kundeClaim.fall_id}` : null
  if (!kundeDetailUrl) {
    const link = page.locator('a[href*="/kunde/faelle/"]').first()
    if ((await link.count()) > 0) kundeDetailUrl = await link.getAttribute('href')
  }

  if (kundeDetailUrl) {
    errors.length = 0; fives.length = 0
    const detailResult = await gotoUndShoot(page, kundeDetailUrl, 'kunde-fall-detail')
    const hydDetErr = await pruefeHydration(page)
    notiere('kunde', kundeDetailUrl, detailResult.ok && fives.length === 0 ? 'OK' : 'WARN', [
      detailResult.has500 ? '500!' : '', detailResult.isBlank ? 'Leerer Screen!' : '',
      fives.length > 0 ? `5xx: ${fives[0]}` : '',
      hydDetErr.length > 0 ? `Hydration: ${hydDetErr[0].slice(0, 80)}` : '',
    ].filter(Boolean).join(' | '))

    await page.waitForTimeout(1000)
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80))
      }
      window.scrollTo(0, 0)
    }).catch(() => {})
    await page.waitForTimeout(600)
    const kundeBodyText = await sichtbarerText(page)
    const hatSchadenort = /Schadenort|Schadensort|Unfallort|Schadenadresse/i.test(kundeBodyText)
    notiere('kunde', 'detail-schadenort-sektion', hatSchadenort ? 'OK' : 'WARN',
      hatSchadenort ? 'Schadenort-Bereich in Kundensicht sichtbar' : 'Kein Schadenort-Label in Kundensicht')
    pruefeSchadenortWerte(kundeBodyText, kundeClaim, 'kunde', 'detail')
  } else {
    notiere('kunde', '/kunde/faelle/[id]', 'WARN', 'Kein Kunden-Fall-Link gefunden')
    await shoot(page, 'kunde-kein-fall-link')
  }

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (Kunde): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }
  await context.close()
}

// ─── 5. DISPATCH ─────────────────────────────────────────────────────────────
async function smokeDispatch(browser) {
  console.log('\n════════ DISPATCH ════════')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE', timezoneId: 'Europe/Berlin', ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)

  const loginOk = await login(page, 'test-dispatch@claimondo.de', TEST_PASS)
  await shoot(page, 'dispatch-nach-login')
  if (!loginOk) {
    notiere('dispatch', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  for (const [route, label] of [
    ['/dispatch', 'dispatch-root'],
    ['/dispatch/leads', 'dispatch-leads-liste'],
  ]) {
    errors.length = 0; fives.length = 0
    const r = await gotoUndShoot(page, route, label)
    const hydErr = await pruefeHydration(page)
    notiere('dispatch', route, r.ok && fives.length === 0 ? 'OK' : 'WARN', [
      r.has500 ? '500!' : '', r.isBlank ? 'Leerer Screen!' : '',
      fives.length > 0 ? `5xx: ${fives.slice(0, 2).join(', ')}` : '',
      hydErr.length > 0 ? `Hydration: ${hydErr[0].slice(0, 80)}` : '',
    ].filter(Boolean).join(' | '))
  }

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (Dispatch): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }
  await context.close()
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  CMM-44 SP-A2 PR1a — Portal-Smoke: Schadenort+Datum Rename   ║')
  console.log('║  Ziel: app.staging.claimondo.de                              ║')
  console.log('║  Screenshots: docs/17.05.2026/cmm44-spa2-smoke-pr1a/         ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`\nBasic-Auth: ${BASIC_USER} / ${'*'.repeat(BASIC_PASS.length)}`)
  console.log(`Supabase-URL: ${SUPABASE_URL ? SUPABASE_URL.slice(0, 40) + '…' : '(nicht gesetzt)'}`)

  console.log('\n[Service-Role] Ermittle Fälle mit Schadenort-Daten…')
  const [adminClaim, svClaim, kundeClaim] = await Promise.all([
    ersterFallMitSchadenort(),
    ersterSvFall(),
    ersterKundeFall(),
  ])
  console.log(`  Admin-Fall:  ${adminClaim?.fall_id ?? '(nicht gefunden)'} (Ort: ${adminClaim?.schadenort_ort ?? '-'})`)
  console.log(`  SV-Fall:     ${svClaim?.fall_id ?? '(nicht gefunden)'} (Ort: ${svClaim?.schadenort_ort ?? '-'})`)
  console.log(`  Kunden-Fall: ${kundeClaim?.fall_id ?? '(nicht gefunden)'} (Ort: ${kundeClaim?.schadenort_ort ?? '-'})`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    await smokePublic(browser)
    await smokeAdmin(browser, adminClaim)
    await smokeSv(browser, svClaim)
    await smokeKunde(browser, kundeClaim)
    await smokeDispatch(browser)
  } finally {
    await browser.close()
  }

  const okCount = findings.filter((f) => f.status === 'OK').length
  const warnCount = findings.filter((f) => f.status === 'WARN').length
  const failCount = findings.filter((f) => f.status === 'HARD-FAIL').length

  console.log('\n════════ ERGEBNIS ════════')
  console.log(`✓ OK:        ${okCount}`)
  console.log(`⚠ WARN:      ${warnCount}`)
  console.log(`✗ HARD-FAIL: ${failCount}`)
  console.log(`\nScreenshots: ${OUT_DIR}`)

  const findingsPath = join(OUT_DIR, 'findings.json')
  writeFileSync(findingsPath, JSON.stringify(
    { findings, summary: { ok: okCount, warn: warnCount, fail: failCount }, timestamp: new Date().toISOString(), base: BASE },
    null, 2
  ))
  console.log(`Findings: ${findingsPath}`)

  if (failCount > 0) process.exit(1)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
