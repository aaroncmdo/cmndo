/**
 * Portal-Smoke v2 gegen app.staging.claimondo.de
 * Fix: Cookie-Banner wird vor Login-Formular weggeklickt.
 * Credentials via Env-Vars — NIEMALS als Literal in Datei.
 *
 * Verwendung:
 *   STAGING_BASIC_AUTH_USER=aaroncmdo STAGING_BASIC_AUTH_PASS=<pass> node smoke-portale-v2.mjs
 */

import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER ?? ''
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS ?? ''

if (!BASIC_USER || !BASIC_PASS) {
  console.error('FEHLER: STAGING_BASIC_AUTH_USER und STAGING_BASIC_AUTH_PASS müssen gesetzt sein.')
  process.exit(1)
}

const BASE = `https://app.staging.claimondo.de`

const TEST_USERS = {
  dispatch: { email: 'test-dispatch@claimondo.de', pass: 'Test1234!' },
  sv:       { email: 'test-sv@claimondo.de',       pass: 'Test1234!' },
  admin:    { email: 'test-admin@claimondo.de',     pass: 'Test1234!' },
  kanzlei:  { email: 'test-kanzlei@claimondo.de',  pass: 'Test1234!' },
  makler:   { email: 'test-makler@claimondo.de',   pass: 'Test1234!' },
}

const SHOTS_DIR = __dirname
const findings = []
const shotLog = []
let shotCounter = 0

function pad(n) { return String(n).padStart(3, '0') }

async function shot(page, portal, label, note = '') {
  shotCounter++
  const num = pad(shotCounter)
  const filename = `${num}-${label}.png`
  const dir = path.join(SHOTS_DIR, portal)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  await page.screenshot({ path: filePath, fullPage: false }).catch(() => {})
  console.log(`  📸 ${portal}/${filename} — ${note}`)
  shotLog.push({ portal, file: `${portal}/${filename}`, note })
  return filePath
}

function finding(severity, id, portal, beschreibung, status = 'OFFEN') {
  findings.push({ severity, id, portal, beschreibung, status })
  const icon = severity === 'P0' ? '🔴' : severity === 'P1' ? '🟠' : severity === 'P2' ? '🟡' : '🟢'
  console.log(`  ${icon} ${severity} [${id}] ${beschreibung}`)
}

async function dismissCookieBanner(page) {
  const btn = await page.$('button:has-text("Alle akzeptieren"), button:has-text("Nur notwendige")').catch(() => null)
  if (btn) {
    await btn.click()
    await page.waitForTimeout(800)
    return true
  }
  return false
}

async function loginAs(page, role) {
  const user = TEST_USERS[role]
  console.log(`\n  → Login als ${role} (${user.email})…`)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 })
  await page.waitForTimeout(1500)

  // Cookie-Banner wegklicken
  await dismissCookieBanner(page)

  try {
    await page.fill('#email', user.email, { timeout: 8000 })
    await page.fill('#password', user.pass, { timeout: 5000 })
    // Gezielt "Einloggen"-Submit-Button klicken, nicht den Cookie-Submit
    await page.click('button[type="submit"]:has-text("Einloggen")', { timeout: 5000 })
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 20000 })
    console.log(`  ✅ Eingeloggt als ${role} → ${page.url()}`)
    return { ok: true, url: page.url() }
  } catch (err) {
    // URL-Error auslesen
    const urlError = new URL(page.url()).searchParams.get('error') ?? ''
    const alertErr = await page.$eval('[role="alert"]', el => el.textContent?.trim()).catch(() => '')
    const reason = urlError || alertErr || err.message.substring(0, 80)
    console.log(`  ❌ Login fehlgeschlagen als ${role}: ${reason}`)
    return { ok: false, reason }
  }
}

async function navSafe(page, path, label) {
  try {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    const status = resp?.status() ?? 0
    if (status >= 500) {
      console.log(`  ❌ HTTP ${status} auf ${path}`)
      return { ok: false, status }
    }
    await page.waitForTimeout(2000)
    return { ok: true, status, url: page.url() }
  } catch (err) {
    console.log(`  ❌ Navigation nach ${path} fehlgeschlagen: ${err.message.substring(0, 60)}`)
    return { ok: false, error: err.message }
  }
}

function collectErrors(page) {
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  return errors
}

// ─── DISPATCH ────────────────────────────────────────────────────────────────

async function smokeDispatch(browser) {
  console.log('\n═══════════════════════════════════════')
  console.log('  DISPATCH-PORTAL-SMOKE')
  console.log('═══════════════════════════════════════')
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  const page = await ctx.newPage()
  const jsErrors = collectErrors(page)

  try {
    const login = await loginAs(page, 'dispatch')
    if (!login.ok) {
      finding('P0', 'DISPATCH-LOGIN', 'dispatch', `Login fehlgeschlagen: ${login.reason}`)
      await shot(page, 'dispatch', 'login-fehlgeschlagen', 'Dispatch-Login fehlgeschlagen')
      return
    }

    await shot(page, 'dispatch', 'nach-login-dashboard', 'Dispatch nach Login')

    // 1. Dashboard
    console.log('\n  [1/6] Dashboard')
    const dash = await navSafe(page, '/dispatch/dashboard', 'Dashboard')
    await shot(page, 'dispatch', 'dashboard', 'Dispatch-Dashboard')
    if (!dash.ok) finding('P0', 'DISPATCH-DASHBOARD-500', 'dispatch', `Dashboard HTTP-Fehler: ${dash.status}`)

    // JS-Fehler-Check
    if (jsErrors.length > 0) {
      finding('P0', 'DISPATCH-DASHBOARD-JSERR', 'dispatch', `JS-Laufzeitfehler auf Dashboard: ${jsErrors[0].substring(0, 100)}`)
      jsErrors.length = 0
    }

    // 2. Lead-Liste
    console.log('\n  [2/6] Lead-Liste')
    const leads = await navSafe(page, '/dispatch/leads', 'Lead-Liste')
    await shot(page, 'dispatch', 'leads-liste', 'Lead-Liste')
    if (!leads.ok) {
      finding('P0', 'DISPATCH-LEADS-500', 'dispatch', `Lead-Liste HTTP-Fehler: ${leads.status}`)
    } else {
      if (jsErrors.length > 0) {
        finding('P0', 'DISPATCH-LEADS-JSERR', 'dispatch', `JS-Fehler Lead-Liste: ${jsErrors[0].substring(0, 100)}`)
        jsErrors.length = 0
      }

      // 3. Lead-Detail
      console.log('\n  [3/6] Lead-Detail')
      const firstLeadLink = await page.$('a[href*="/dispatch/leads/"]').catch(() => null)
      if (firstLeadLink) {
        const href = await firstLeadLink.getAttribute('href')
        const leadId = href?.match(/\/dispatch\/leads\/([^/?#]+)/)?.[1]
        console.log(`  → Öffne Lead ${leadId}`)
        await shot(page, 'dispatch', 'vor-lead-detail', 'Vor Lead-Detail-Klick')

        await firstLeadLink.click()
        await page.waitForTimeout(3000)
        await shot(page, 'dispatch', 'nach-lead-detail', 'Lead-Detail geöffnet')

        if (jsErrors.length > 0) {
          finding('P0', 'DISPATCH-LEAD-DETAIL-JSERR', 'dispatch', `JS-Fehler Lead-Detail: ${jsErrors[0].substring(0, 100)}`)
          jsErrors.length = 0
        }

        const detailUrl = page.url()
        console.log(`  Lead-Detail URL: ${detailUrl}`)

        // Phase-Tabs suchen
        const phaseTabs = await page.$$('[data-phase], [data-testid*="phase"]').catch(() => [])
        const phaseButtons = await page.$$('button[aria-selected], nav button, [role="tablist"] button').catch(() => [])
        console.log(`  Phase-Tabs: ${phaseTabs.length}, Nav-Buttons: ${phaseButtons.length}`)

        // Stammdaten-Tab
        const stammdatenBtn = await page.$('button:has-text("Stammdaten"), [aria-label="Stammdaten"]').catch(() => null)
        if (stammdatenBtn) {
          await shot(page, 'dispatch', 'vor-stammdaten-tab', 'Stammdaten-Tab-Button sichtbar')
          await stammdatenBtn.click()
          await page.waitForTimeout(2000)
          await shot(page, 'dispatch', 'nach-stammdaten-tab', 'Stammdaten-Tab aktiv')
          if (jsErrors.length > 0) {
            finding('P0', 'DISPATCH-STAMMDATEN-JSERR', 'dispatch', `JS-Fehler Stammdaten-Tab: ${jsErrors[0].substring(0, 100)}`)
            jsErrors.length = 0
          }
          console.log('  Stammdaten-Tab: ✅ erreichbar')
        } else {
          // Prüfe ob Phase-4-Navigation möglich
          if (leadId) {
            const p4 = await navSafe(page, `/dispatch/leads/${leadId}?phase=4`, 'Phase 4')
            await shot(page, 'dispatch', 'phase4-stammdaten', 'Phase 4 Stammdaten via Query')
            if (!p4.ok) finding('P1', 'DISPATCH-PHASE4-500', 'dispatch', 'Phase-4/Stammdaten-Tab nicht erreichbar')
          } else {
            finding('P2', 'DISPATCH-STAMMDATEN-KEIN-TAB', 'dispatch', 'Stammdaten-Tab-Button nicht gefunden')
          }
        }

        // Kommunikation-Tab
        const kommuBtn = await page.$('button:has-text("Kommunikation"), [aria-label="Kommunikation"]').catch(() => null)
        if (kommuBtn) {
          await kommuBtn.click()
          await page.waitForTimeout(1500)
          await shot(page, 'dispatch', 'kommunikation-tab', 'Kommunikation-Tab')
          if (jsErrors.length > 0) {
            finding('P0', 'DISPATCH-KOMMU-JSERR', 'dispatch', `JS-Fehler Kommunikation-Tab: ${jsErrors[0].substring(0, 100)}`)
            jsErrors.length = 0
          }
        }

        // Dokumente-Tab
        const docsBtn = await page.$('button:has-text("Dokumente"), [aria-label="Dokumente"]').catch(() => null)
        if (docsBtn) {
          await docsBtn.click()
          await page.waitForTimeout(1500)
          await shot(page, 'dispatch', 'dokumente-tab', 'Dokumente-Tab')
        }

      } else {
        finding('P1', 'DISPATCH-KEINE-LEADS', 'dispatch', 'Lead-Liste leer — kein Detail-Test möglich')
        await shot(page, 'dispatch', 'leads-liste-leer', 'Lead-Liste leer')
      }
    }

    // 4. Kalender
    console.log('\n  [4/6] Kalender')
    const kal = await navSafe(page, '/dispatch/kalender', 'Kalender')
    await shot(page, 'dispatch', 'kalender', 'Dispatch-Kalender')
    if (!kal.ok) finding('P0', 'DISPATCH-KALENDER-500', 'dispatch', `Kalender HTTP-Fehler: ${kal.status}`)
    if (jsErrors.length > 0) { finding('P0', 'DISPATCH-KALENDER-JSERR', 'dispatch', jsErrors[0].substring(0, 100)); jsErrors.length = 0 }

    // 5. Gutachter-Finder
    console.log('\n  [5/6] Gutachter-Finder')
    const gf = await navSafe(page, '/dispatch/gutachter-finder', 'Gutachter-Finder')
    await shot(page, 'dispatch', 'gutachter-finder', 'Gutachter-Finder')
    if (!gf.ok) finding('P0', 'DISPATCH-GUTACHTER-FINDER-500', 'dispatch', `Gutachter-Finder HTTP-Fehler: ${gf.status}`)
    if (jsErrors.length > 0) { finding('P0', 'DISPATCH-GF-JSERR', 'dispatch', jsErrors[0].substring(0, 100)); jsErrors.length = 0 }

    // 6. Neuen Lead anlegen (Formular)
    console.log('\n  [6/6] Lead-Anlage-Button')
    await navSafe(page, '/dispatch/leads', 'Lead-Liste für neuen Lead')
    await page.waitForTimeout(1000)
    const neuBtn = await page.$('a:has-text("Neu"), button:has-text("Neu"), a:has-text("Lead anlegen"), a:has-text("Anfrage")').catch(() => null)
    if (neuBtn) {
      await shot(page, 'dispatch', 'vor-lead-neu', 'Lead-Anlage-Button sichtbar')
      await neuBtn.click()
      await page.waitForTimeout(2000)
      await shot(page, 'dispatch', 'lead-neu-formular', 'Lead-Anlage-Formular')
      if (jsErrors.length > 0) { finding('P0', 'DISPATCH-LEAD-NEU-JSERR', 'dispatch', jsErrors[0].substring(0, 100)); jsErrors.length = 0 }
    } else {
      finding('P2', 'DISPATCH-KEIN-NEU-BTN', 'dispatch', 'Kein "Neuen Lead anlegen"-Button auf der Lead-Liste gefunden')
    }

  } catch (err) {
    console.log(`  ❌ Dispatch-Smoke Crash: ${err.message}`)
    finding('P0', 'DISPATCH-CRASH', 'dispatch', `Script-Crash: ${err.message.substring(0, 100)}`)
    await page.screenshot({ path: path.join(SHOTS_DIR, 'dispatch', 'crash.png') }).catch(() => {})
  } finally {
    await ctx.close()
  }
}

// ─── SV ──────────────────────────────────────────────────────────────────────

async function smokeSV(browser) {
  console.log('\n═══════════════════════════════════════')
  console.log('  SV/GUTACHTER-PORTAL-SMOKE')
  console.log('═══════════════════════════════════════')
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  const page = await ctx.newPage()
  const jsErrors = collectErrors(page)

  try {
    const login = await loginAs(page, 'sv')
    if (!login.ok) {
      finding('P0', 'SV-LOGIN', 'sv', `Login fehlgeschlagen: ${login.reason}`)
      await shot(page, 'sv', 'login-fehlgeschlagen', 'SV-Login fehlgeschlagen')
      return
    }
    await shot(page, 'sv', 'nach-login', 'SV-Portal nach Login')

    const routes = [
      { path: '/gutachter', label: 'SV-Startseite', id: 'HOME' },
      { path: '/gutachter/faelle', label: 'Fälle-Übersicht', id: 'FAELLE' },
      { path: '/gutachter/kalender', label: 'SV-Kalender', id: 'KALENDER' },
      { path: '/gutachter/reklamationen', label: 'Reklamationen', id: 'REKLAMATIONEN' },
    ]

    for (const route of routes) {
      console.log(`\n  [Route] ${route.label}`)
      const nav = await navSafe(page, route.path, route.label)
      await shot(page, 'sv', `route-${route.id.toLowerCase()}`, route.label)
      if (!nav.ok) {
        finding('P0', `SV-${route.id}-500`, 'sv', `${route.label} HTTP-Fehler: ${nav.status ?? nav.error?.substring(0, 50)}`)
      } else if (jsErrors.length > 0) {
        finding('P0', `SV-${route.id}-JSERR`, 'sv', `JS-Fehler in ${route.label}: ${jsErrors[0].substring(0, 100)}`)
        jsErrors.length = 0
      }
    }

    // Fall-Detail
    console.log('\n  [Route] Fall-Detail')
    await navSafe(page, '/gutachter/faelle', 'SV-Fälle')
    await page.waitForTimeout(1500)
    const firstLink = await page.$('a[href*="/gutachter/faelle/"], a[href*="/gutachter/auftraege/"]').catch(() => null)
    if (firstLink) {
      const href = await firstLink.getAttribute('href')
      await shot(page, 'sv', 'vor-fall-detail', 'Vor SV-Fall-Detail')
      await firstLink.click()
      await page.waitForTimeout(3000)
      await shot(page, 'sv', 'fall-detail', 'SV-Fall-Detail')
      console.log(`  Fall-Detail: ${page.url()}`)

      if (jsErrors.length > 0) {
        finding('P0', 'SV-FALL-DETAIL-JSERR', 'sv', `JS-Fehler SV-Fall-Detail: ${jsErrors[0].substring(0, 100)}`)
        jsErrors.length = 0
      }

      // Feldmodus-Trigger suchen
      const feldBtn = await page.$('a:has-text("Feldmodus"), button:has-text("Feldmodus"), [aria-label*="Feldmodus"]').catch(() => null)
      if (feldBtn) {
        await shot(page, 'sv', 'feldmodus-btn-sichtbar', 'Feldmodus-Button sichtbar')
        console.log('  Feldmodus-Button: ✅ sichtbar')
      } else {
        finding('P2', 'SV-FELDMODUS-BTN', 'sv', 'Feldmodus-Button im SV-Fall-Detail nicht gefunden')
      }

      // Tabs im SV-Fall-Detail
      const tabs = await page.$$('[role="tablist"] button, [role="tab"]').catch(() => [])
      console.log(`  SV-Fall-Detail Tabs: ${tabs.length}`)
      for (let i = 0; i < Math.min(tabs.length, 4); i++) {
        const tabText = await tabs[i].textContent().catch(() => '?')
        await tabs[i].click().catch(() => {})
        await page.waitForTimeout(1000)
        await shot(page, 'sv', `fall-detail-tab-${i + 1}-${tabText.trim().substring(0, 15).replace(/[^a-z0-9äöü]/gi, '-')}`, `SV-Fall-Detail Tab ${tabText.trim()}`)
        if (jsErrors.length > 0) {
          finding('P0', `SV-TAB-${i + 1}-JSERR`, 'sv', `JS-Fehler in SV-Tab "${tabText.trim()}": ${jsErrors[0].substring(0, 80)}`)
          jsErrors.length = 0
        }
      }
    } else {
      finding('P1', 'SV-KEINE-FAELLE', 'sv', 'Keine Fälle in SV-Liste — Fall-Detail nicht testbar')
      await shot(page, 'sv', 'faelle-leer', 'SV-Fälle-Liste leer')
    }

  } catch (err) {
    console.log(`  ❌ SV-Smoke Crash: ${err.message}`)
    finding('P0', 'SV-CRASH', 'sv', `Script-Crash: ${err.message.substring(0, 100)}`)
    await page.screenshot({ path: path.join(SHOTS_DIR, 'sv', 'crash.png') }).catch(() => {})
  } finally {
    await ctx.close()
  }
}

// ─── KANZLEI ─────────────────────────────────────────────────────────────────

async function smokeKanzlei(browser) {
  console.log('\n═══════════════════════════════════════')
  console.log('  KANZLEI-PORTAL-SMOKE')
  console.log('═══════════════════════════════════════')
  // Kein test-kanzlei User → als Admin einloggen und Kanzlei-Routen prüfen
  // (Routen-Erreichbarkeit trotzdem dokumentierbar)
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  const page = await ctx.newPage()
  const jsErrors = collectErrors(page)

  try {
    // Erst Kanzlei-Login versuchen
    const kanzleiLogin = await loginAs(page, 'kanzlei')
    if (!kanzleiLogin.ok) {
      finding('P0', 'KANZLEI-KEIN-TESTUSER', 'kanzlei',
        `test-kanzlei@claimondo.de existiert nicht auf Staging — Kanzlei-Portal via Admin getestet`)
      // Als Admin einloggen stattdessen
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)
      await dismissCookieBanner(page)
      await page.fill('#email', TEST_USERS.admin.email)
      await page.fill('#password', TEST_USERS.admin.pass)
      await page.click('button[type="submit"]:has-text("Einloggen")')
      try {
        await page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 })
        console.log(`  ✅ Admin-Fallback eingeloggt → ${page.url()}`)
      } catch {
        finding('P0', 'KANZLEI-ADMIN-LOGIN-FAIL', 'kanzlei', 'Admin-Fallback-Login für Kanzlei-Routen fehlgeschlagen')
        return
      }
    } else {
      await shot(page, 'kanzlei', 'nach-login', 'Kanzlei-Portal nach Login')
    }

    // Kanzlei-Routen testen (ob 404/500 oder korrekte Seite)
    const kanzleiRoutes = [
      { path: '/kanzlei', label: 'Kanzlei-Start', id: 'START' },
      { path: '/kanzlei/dashboard', label: 'Kanzlei-Dashboard', id: 'DASHBOARD' },
      { path: '/kanzlei/faelle', label: 'Kanzlei-Fälle', id: 'FAELLE' },
      { path: '/kanzlei/mandanten', label: 'Mandanten', id: 'MANDANTEN' },
      { path: '/kanzlei/dokumente', label: 'Dokumente', id: 'DOKUMENTE' },
    ]

    for (const route of kanzleiRoutes) {
      console.log(`\n  [Route] ${route.label}`)
      await shot(page, 'kanzlei', `vor-${route.id.toLowerCase()}`, `Vor ${route.label}`)
      const nav = await navSafe(page, route.path, route.label)
      await shot(page, 'kanzlei', `nach-${route.id.toLowerCase()}`, `${route.label} geladen`)

      const finalUrl = page.url()
      if (!nav.ok) {
        finding('P0', `KANZLEI-${route.id}-500`, 'kanzlei', `${route.label} HTTP-Fehler: ${nav.status ?? 'Timeout'}`)
      } else if (finalUrl.includes('/login') || finalUrl.includes('/unauthorized')) {
        finding('P1', `KANZLEI-${route.id}-AUTH-REDIRECT`, 'kanzlei',
          `${route.label} leitet auf Auth-Seite → kein Kanzlei-Test-User auf Staging`)
        console.log(`  ⚠️  Auth-Redirect: ${finalUrl}`)
      } else {
        console.log(`  ✅ ${route.label}: ${finalUrl}`)
        if (jsErrors.length > 0) {
          finding('P0', `KANZLEI-${route.id}-JSERR`, 'kanzlei', `JS-Fehler in ${route.label}: ${jsErrors[0].substring(0, 100)}`)
          jsErrors.length = 0
        }
      }
    }

    // Fall-Detail in Kanzlei
    console.log('\n  [Route] Kanzlei-Fall-Detail')
    await navSafe(page, '/kanzlei/faelle', 'Kanzlei-Fälle-Liste')
    await page.waitForTimeout(1500)
    const firstFall = await page.$('a[href*="/kanzlei/faelle/"]').catch(() => null)
    if (firstFall) {
      await shot(page, 'kanzlei', 'vor-fall-detail', 'Vor Kanzlei-Fall-Detail')
      await firstFall.click()
      await page.waitForTimeout(3000)
      await shot(page, 'kanzlei', 'fall-detail', 'Kanzlei-Fall-Detail')
      console.log(`  Kanzlei-Fall-Detail: ${page.url()}`)
      if (jsErrors.length > 0) {
        finding('P0', 'KANZLEI-FALL-DETAIL-JSERR', 'kanzlei', `JS-Fehler Kanzlei-Fall-Detail: ${jsErrors[0].substring(0, 100)}`)
      }
    } else {
      finding('P1', 'KANZLEI-KEINE-FAELLE', 'kanzlei', 'Keine Fälle in Kanzlei-Liste')
      await shot(page, 'kanzlei', 'faelle-leer', 'Kanzlei-Fälle leer')
    }

  } catch (err) {
    console.log(`  ❌ Kanzlei-Smoke Crash: ${err.message}`)
    finding('P0', 'KANZLEI-CRASH', 'kanzlei', `Script-Crash: ${err.message.substring(0, 100)}`)
    await page.screenshot({ path: path.join(SHOTS_DIR, 'kanzlei', 'crash.png') }).catch(() => {})
  } finally {
    await ctx.close()
  }
}

// ─── MAKLER ───────────────────────────────────────────────────────────────────

async function smokeMakler(browser) {
  console.log('\n═══════════════════════════════════════')
  console.log('  MAKLER-PORTAL-SMOKE')
  console.log('═══════════════════════════════════════')
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  const page = await ctx.newPage()

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1000)
    await dismissCookieBanner(page)
    await page.fill('#email', TEST_USERS.makler.email)
    await page.fill('#password', TEST_USERS.makler.pass)
    await shot(page, 'makler', 'vor-login-versuch', 'Makler-Login-Formular ausgefüllt')
    await page.click('button[type="submit"]:has-text("Einloggen")')
    await page.waitForTimeout(3000)

    const finalUrl = page.url()
    if (finalUrl.includes('/login')) {
      await shot(page, 'makler', 'nach-login-fehlgeschlagen', 'Makler-Login fehlgeschlagen (B3 bestätigt)')
      finding('P0', 'MAKLER-KEIN-TESTUSER', 'makler',
        'test-makler@claimondo.de existiert nicht auf Staging — Blocker B3 aus Vorlauf bestätigt, Makler-Portal nicht testbar')
      console.log('  ⚠️  B3 bestätigt — Makler übersprungen')
    } else {
      await shot(page, 'makler', 'nach-login', 'Makler-Login erfolgreich')
      console.log('  ✅ Makler-Login unerwartet erfolgreich!')
      // Schnell-Smoke
      for (const r of ['/makler/dashboard', '/makler/onboarding', '/makler/partner-werden', '/makler/pending']) {
        const nav = await navSafe(page, r, r)
        await shot(page, 'makler', `route-${r.replace(/\//g, '-')}`, r)
        if (!nav.ok) finding('P0', `MAKLER-ROUTE-500`, 'makler', `${r} HTTP-Fehler`)
      }
    }
  } catch (err) {
    finding('P0', 'MAKLER-CRASH', 'makler', `Script-Crash: ${err.message.substring(0, 100)}`)
  } finally {
    await ctx.close()
  }
}

// ─── KUNDE ────────────────────────────────────────────────────────────────────

async function smokeKunde(browser) {
  console.log('\n═══════════════════════════════════════')
  console.log('  KUNDEN-PORTAL-SMOKE')
  console.log('═══════════════════════════════════════')
  // Strategie: Als Dispatch einloggen, dann Kunden-Fallakte im Dispatch-Portal prüfen
  // + anonyme Kunden-Routen auf Auth-Redirect prüfen
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  const page = await ctx.newPage()
  const jsErrors = collectErrors(page)

  try {
    const login = await loginAs(page, 'dispatch')
    if (!login.ok) {
      finding('P0', 'KUNDE-DISPATCH-LOGIN', 'kunde', `Dispatch-Login für Kunden-Test fehlgeschlagen: ${login.reason}`)
      return
    }
    await shot(page, 'kunde', 'dispatch-fuer-kunden-test', 'Dispatch eingeloggt für Kunden-Test')

    // Lead-Liste
    const leads = await navSafe(page, '/dispatch/leads', 'Lead-Liste')
    if (leads.ok) {
      const firstLink = await page.$('a[href*="/dispatch/leads/"]').catch(() => null)
      if (firstLink) {
        await firstLink.click()
        await page.waitForTimeout(3000)
        await shot(page, 'kunde', 'dispatch-lead-detail', 'Dispatch-Lead-Detail für Kunden-Link-Suche')

        // Kunden-Portal-Link / Magic-Link in Dispatch-Fallakte
        const magicSel = 'button:has-text("Magic"), a:has-text("Magic"), button:has-text("Kunden-Portal"), a:has-text("Kunden-Portal"), button:has-text("Kunden-Link"), [aria-label*="Magic"]'
        const magicBtn = await page.$(magicSel).catch(() => null)
        if (magicBtn) {
          await shot(page, 'kunde', 'magic-link-btn-sichtbar', 'Magic-Link-Button im Dispatch-Portal sichtbar')
          console.log('  Magic-Link-Button: ✅')
        } else {
          finding('P1', 'KUNDE-KEIN-MAGIC-LINK-BTN', 'kunde', 'Magic-Link/Kunden-Portal-Button in Dispatch-Lead-Detail nicht gefunden')
          await shot(page, 'kunde', 'kein-magic-link-btn', 'Dispatch-Lead-Detail ohne Magic-Link-Button')
        }
        if (jsErrors.length > 0) { jsErrors.length = 0 }
      }
    }

    // Kunden-Routen ohne Auth — erwarte Redirect auf Login/Token
    console.log('\n  --- Anonyme Kunden-Routen ---')
    const kundenRoutes = [
      { path: '/kunde', label: 'Kunden-Start', id: 'START' },
      { path: '/kunde/mein-fall', label: 'Kunden-Mein-Fall', id: 'MEIN-FALL' },
      { path: '/kunde/dokumente', label: 'Kunden-Dokumente', id: 'DOKUMENTE' },
    ]

    for (const route of kundenRoutes) {
      console.log(`\n  [Route] ${route.label}`)
      await shot(page, 'kunde', `vor-${route.id.toLowerCase()}`, `Vor Kunden-Route ${route.label}`)
      const nav = await navSafe(page, route.path, route.label)
      await shot(page, 'kunde', `nach-${route.id.toLowerCase()}`, `Kunden-Route ${route.label}`)

      const finalUrl = page.url()
      if (!nav.ok) {
        finding('P0', `KUNDE-${route.id}-500`, 'kunde', `${route.label} HTTP 5xx`)
      } else if (finalUrl.includes('/login') || finalUrl.includes('/token') || finalUrl.includes('/zugang') || finalUrl.includes('/unauthorized')) {
        console.log(`  ✅ Auth-Redirect: ${finalUrl} (korrekt)`)
      } else {
        console.log(`  ℹ️  ${route.label}: ${finalUrl} (kein Redirect, kein Crash — evtl. Rolle mitgebracht)`)
        if (jsErrors.length > 0) {
          finding('P0', `KUNDE-${route.id}-JSERR`, 'kunde', `JS-Fehler in ${route.label}: ${jsErrors[0].substring(0, 100)}`)
          jsErrors.length = 0
        }
      }
    }

    // Termin-Token-Route (anonym, offentlich zugänglich für Kunden)
    console.log('\n  [Route] Termin-Token-Route (anonym)')
    const terminNav = await navSafe(page, '/kunde/termin/test-invalid-token', 'Termin-Token-Route')
    await shot(page, 'kunde', 'termin-token-route', 'Termin-Token-Route')
    const terminUrl = page.url()
    if (!terminNav.ok && terminNav.status >= 500) {
      finding('P0', 'KUNDE-TERMIN-500', 'kunde', `Termin-Token-Route HTTP ${terminNav.status}`)
    } else {
      console.log(`  Termin-Route: ${terminUrl} (Status: ${terminNav.status ?? 'ok'})`)
    }

  } catch (err) {
    console.log(`  ❌ Kunden-Smoke Crash: ${err.message}`)
    finding('P0', 'KUNDE-CRASH', 'kunde', `Script-Crash: ${err.message.substring(0, 100)}`)
    await page.screenshot({ path: path.join(SHOTS_DIR, 'kunde', 'crash.png') }).catch(() => {})
  } finally {
    await ctx.close()
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║   Claimondo Portal-Smoke v2 — app.staging.claimondo.de  ║')
  console.log(`║   ${new Date().toISOString()}                     ║`)
  console.log('╚══════════════════════════════════════════════════════════╝')

  const browser = await chromium.launch({ headless: true })

  try {
    await smokeDispatch(browser)
    await smokeSV(browser)
    await smokeKanzlei(browser)
    await smokeMakler(browser)
    await smokeKunde(browser)
  } finally {
    await browser.close()
  }

  // Zusammenfassung
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║   ERGEBNIS                                               ║')
  console.log('╚══════════════════════════════════════════════════════════╝')

  const bySeverity = { P0: [], P1: [], P2: [], P3: [] }
  for (const f of findings) bySeverity[f.severity]?.push(f)

  console.log(`\nScreenshots gesamt: ${shotCounter}`)
  console.log(`Findings gesamt:    ${findings.length}`)
  for (const [sev, list] of Object.entries(bySeverity)) {
    if (list.length > 0) {
      console.log(`\n${sev} (${list.length}):`)
      for (const f of list) console.log(`  [${f.id}] ${f.portal}: ${f.beschreibung}`)
    }
  }

  const result = {
    datum: new Date().toISOString(),
    screenshots: shotCounter,
    perPortal: {
      dispatch: shotLog.filter(s => s.portal === 'dispatch').length,
      sv: shotLog.filter(s => s.portal === 'sv').length,
      kanzlei: shotLog.filter(s => s.portal === 'kanzlei').length,
      makler: shotLog.filter(s => s.portal === 'makler').length,
      kunde: shotLog.filter(s => s.portal === 'kunde').length,
    },
    findings,
    bySeverity: Object.fromEntries(Object.entries(bySeverity).map(([k, v]) => [k, v.length])),
  }

  fs.writeFileSync(path.join(SHOTS_DIR, 'portal-smoke-result.json'), JSON.stringify(result, null, 2))
  console.log(`\nErgebnis: docs/13.05.2026/smoke-claimondo-de/portal-smoke-result.json`)
  return result
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
