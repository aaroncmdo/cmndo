/**
 * Portal-Smoke gegen app.staging.claimondo.de
 * Startet mit Basic-Auth via Env-Vars (NIEMALS Credentials als Literal hier eintragen).
 *
 * Verwendung:
 *   STAGING_BASIC_AUTH_USER=aaroncmdo STAGING_BASIC_AUTH_PASS=<pass> node smoke-portale.mjs
 */

import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Konfiguration ────────────────────────────────────────────────────────────
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER ?? ''
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS ?? ''

if (!BASIC_USER || !BASIC_PASS) {
  console.error('FEHLER: STAGING_BASIC_AUTH_USER und STAGING_BASIC_AUTH_PASS müssen gesetzt sein.')
  process.exit(1)
}

const BASE = `https://${BASIC_USER}:${BASIC_PASS}@app.staging.claimondo.de`
const BASE_PLAIN = 'https://app.staging.claimondo.de'

const TEST_USERS = {
  dispatch: {
    email: process.env.TEST_DISPATCH_EMAIL ?? 'test-dispatch@claimondo.de',
    pass: process.env.TEST_DISPATCH_PASSWORD ?? 'Test1234!',
  },
  sv: {
    email: process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de',
    pass: process.env.TEST_SV_PASSWORD ?? 'Test1234!',
  },
  admin: {
    email: process.env.TEST_ADMIN_EMAIL ?? 'test-admin@claimondo.de',
    pass: process.env.TEST_ADMIN_PASSWORD ?? 'Test1234!',
  },
  kanzlei: {
    email: process.env.TEST_KANZLEI_EMAIL ?? 'test-kanzlei@claimondo.de',
    pass: process.env.TEST_KANZLEI_PASSWORD ?? 'Test1234!',
  },
  makler: {
    email: process.env.TEST_MAKLER_EMAIL ?? 'test-makler@claimondo.de',
    pass: process.env.TEST_MAKLER_PASSWORD ?? 'Test1234!',
  },
}

const SHOTS_DIR = __dirname
const findings = []
let shotCounter = 0

// ─── Helfer ───────────────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(3, '0')
}

async function shot(page, portal, label, note = '') {
  shotCounter++
  const num = pad(shotCounter)
  const filename = `${num}-${label}.png`
  const dir = path.join(SHOTS_DIR, portal)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`  📸 ${portal}/${filename} — ${note}`)
  return filePath
}

function finding(severity, id, portal, beschreibung, status = 'OFFEN') {
  findings.push({ severity, id, portal, beschreibung, status })
  const icon = severity === 'P0' ? '🔴' : severity === 'P1' ? '🟠' : severity === 'P2' ? '🟡' : '🟢'
  console.log(`  ${icon} ${severity} [${id}] ${beschreibung}`)
}

async function loginAs(page, role) {
  const user = TEST_USERS[role]
  console.log(`\n  → Login als ${role} (${user.email})…`)
  // Mit Basic-Auth zur Login-Seite navigieren
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  // E-Mail + Passwort
  try {
    await page.fill('input[type="email"], input[name="email"]', user.email, { timeout: 8000 })
    await page.fill('input[type="password"], input[name="password"]', user.pass, { timeout: 5000 })
    await page.click('button[type="submit"]', { timeout: 5000 })
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 20000 })
    console.log(`  ✅ Eingeloggt als ${role} → ${page.url()}`)
    return true
  } catch (err) {
    console.log(`  ❌ Login fehlgeschlagen als ${role}: ${err.message}`)
    finding('P0', `LOGIN-${role.toUpperCase()}`, role, `Login fehlgeschlagen: ${err.message}`)
    return false
  }
}

async function checkPageErrors(page, portal, context) {
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  // Kurz warten ob Fehler kommen
  await page.waitForTimeout(1000)
  if (errors.length > 0) {
    const shortErr = errors[0].substring(0, 120)
    finding('P0', `JS-ERR-${context}`, portal, `JS-Laufzeitfehler: ${shortErr}`)
  }
}

async function navigateSafe(page, url, label) {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    const status = resp?.status() ?? 0
    if (status >= 500) {
      console.log(`  ❌ HTTP ${status} auf ${url}`)
      return false
    }
    if (status >= 400) {
      console.log(`  ⚠️  HTTP ${status} auf ${url}`)
      return false
    }
    return true
  } catch (err) {
    console.log(`  ❌ Navigation nach ${url} fehlgeschlagen: ${err.message.substring(0, 80)}`)
    return false
  }
}

// ─── Dispatch-Portal-Smoke ────────────────────────────────────────────────────

async function smokeDispatch(browser) {
  console.log('\n═══ DISPATCH-PORTAL-SMOKE ═══')
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  const page = await ctx.newPage()

  const errors = []
  page.on('pageerror', err => errors.push({ msg: err.message, url: page.url() }))

  try {
    // Login
    const ok = await loginAs(page, 'dispatch')
    if (!ok) {
      await shot(page, 'dispatch', '001-vor-login-fehler', 'Login fehlgeschlagen')
      await ctx.close()
      return
    }

    await shot(page, 'dispatch', '001-nach-login-dashboard', 'Dispatch-Dashboard nach Login')

    // Dashboard
    console.log('\n  --- Dashboard ---')
    const dashUrl = page.url()
    if (!dashUrl.includes('/dispatch')) {
      finding('P0', 'DISPATCH-REDIRECT', 'dispatch', `Nach Login falscher Redirect: ${dashUrl}`)
    }

    // Lead-Liste
    console.log('\n  --- Lead-Liste ---')
    await shot(page, 'dispatch', '002-vor-leads-navigate', 'Vor Navigation zur Lead-Liste')
    const leadsOk = await navigateSafe(page, `${BASE_PLAIN}/dispatch/leads`, 'Lead-Liste')
    await page.waitForTimeout(2000)
    await shot(page, 'dispatch', '003-nach-leads-liste', 'Lead-Liste geladen')

    if (!leadsOk) {
      finding('P0', 'DISPATCH-LEADS-500', 'dispatch', 'Lead-Liste liefert Fehler-Status')
    } else {
      // Prüfen ob Leads vorhanden oder EmptyState
      const hasLeads = await page.$('[data-testid="lead-row"], tr[data-row], .lead-row').catch(() => null)
      const hasEmpty = await page.$('[data-testid="empty-state"], .empty-state').catch(() => null)
      console.log(`  Lead-Rows: ${hasLeads ? 'vorhanden' : 'keine'}, EmptyState: ${hasEmpty ? 'ja' : 'nein'}`)
    }

    // Ersten Lead öffnen (falls vorhanden)
    console.log('\n  --- Lead-Detail ---')
    await shot(page, 'dispatch', '004-vor-lead-detail', 'Vor Lead-Detail-Klick')
    const firstLeadLink = await page.$('a[href*="/dispatch/leads/"]').catch(() => null)
    let leadId = null

    if (firstLeadLink) {
      const href = await firstLeadLink.getAttribute('href')
      leadId = href?.match(/\/dispatch\/leads\/([^/?]+)/)?.[1]
      await firstLeadLink.click()
      await page.waitForURL(/\/dispatch\/leads\//, { timeout: 15000 })
      await page.waitForTimeout(2000)
      await shot(page, 'dispatch', '005-nach-lead-detail-open', 'Lead-Detail geöffnet')
      console.log(`  Lead-Detail: ${page.url()}`)

      // JS-Fehler prüfen
      if (errors.length > 0) {
        const recentErr = errors[errors.length - 1]
        finding('P0', 'DISPATCH-LEAD-DETAIL-JSERR', 'dispatch', `JS-Fehler in Lead-Detail: ${recentErr.msg.substring(0, 100)}`)
      }

      // Phase-Tabs prüfen
      console.log('\n  --- Phasen-Navigation ---')
      const phaseTabs = await page.$$('[data-phase], [data-testid*="phase"], button[aria-selected]').catch(() => [])
      console.log(`  Phasen-Tabs gefunden: ${phaseTabs.length}`)

      // Versuche Stammdaten-Tab
      const stammdatenTab = await page.$('button:has-text("Stammdaten"), a:has-text("Stammdaten"), [aria-label*="Stammdaten"]').catch(() => null)
      if (stammdatenTab) {
        await stammdatenTab.click()
        await page.waitForTimeout(1500)
        await shot(page, 'dispatch', '006-nach-stammdaten-tab', 'Stammdaten-Tab geöffnet')
      } else {
        // Fallback: Phase-4-Route direkt
        if (leadId) {
          const p4ok = await navigateSafe(page, `${BASE_PLAIN}/dispatch/leads/${leadId}?phase=4`, 'Phase 4')
          if (p4ok) {
            await page.waitForTimeout(1500)
            await shot(page, 'dispatch', '006-nach-phase4-direct', 'Phase 4 direkt navigiert')
          }
        }
      }

      // Zurück zur Lead-Liste für weitere Tab-Navigation
      await navigateSafe(page, `${BASE_PLAIN}/dispatch/leads`, 'Lead-Liste zurück')
      await page.waitForTimeout(1000)
    } else {
      finding('P1', 'DISPATCH-NO-LEADS', 'dispatch', 'Keine Leads in der Liste (EmptyState oder leer) — kein Detail-Test möglich')
      await shot(page, 'dispatch', '005-nach-keine-leads', 'Keine Leads vorhanden')
    }

    // Weitere Dispatch-Routen
    console.log('\n  --- Weitere Routen ---')
    const routes = [
      { path: '/dispatch/dashboard', label: 'Dashboard' },
      { path: '/dispatch/kalender', label: 'Kalender' },
      { path: '/dispatch/gutachter-finder', label: 'Gutachter-Finder' },
    ]

    let routeIdx = 7
    for (const route of routes) {
      await shot(page, 'dispatch', `${pad(routeIdx)}-vor-${route.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, `Vor ${route.label}`)
      routeIdx++
      const ok = await navigateSafe(page, `${BASE_PLAIN}${route.path}`, route.label)
      await page.waitForTimeout(2000)
      await shot(page, 'dispatch', `${pad(routeIdx)}-nach-${route.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, `${route.label} geladen`)
      routeIdx++

      if (!ok) {
        finding('P0', `DISPATCH-${route.label.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-500`, 'dispatch', `${route.label} liefert Fehler-Status`)
      } else if (errors.length > 0) {
        const recentErr = errors.at(-1)
        if (recentErr) {
          finding('P0', `DISPATCH-${route.label.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-JSERR`, 'dispatch', `JS-Fehler in ${route.label}: ${recentErr.msg.substring(0, 80)}`)
        }
      }
    }

  } catch (err) {
    console.log(`  ❌ Dispatch-Smoke abgebrochen: ${err.message}`)
    finding('P0', 'DISPATCH-SMOKE-CRASH', 'dispatch', `Smoke-Script-Crash: ${err.message.substring(0, 100)}`)
    await page.screenshot({ path: path.join(SHOTS_DIR, 'dispatch', 'crash.png') }).catch(() => {})
  } finally {
    await ctx.close()
  }
}

// ─── SV-Portal-Smoke ──────────────────────────────────────────────────────────

async function smokeSV(browser) {
  console.log('\n═══ SV/GUTACHTER-PORTAL-SMOKE ═══')
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  const page = await ctx.newPage()

  const errors = []
  page.on('pageerror', err => errors.push({ msg: err.message, url: page.url() }))

  try {
    const ok = await loginAs(page, 'sv')
    if (!ok) {
      await shot(page, 'sv', '001-vor-login-fehler', 'SV-Login fehlgeschlagen')
      await ctx.close()
      return
    }

    await shot(page, 'sv', '001-nach-login', 'SV-Dashboard nach Login')

    const currentUrl = page.url()
    if (!currentUrl.includes('/gutachter') && !currentUrl.includes('/sv')) {
      finding('P1', 'SV-REDIRECT', 'sv', `Nach SV-Login unerwarteter Redirect: ${currentUrl}`)
    }

    // Auftrags-Übersicht
    const svRoutes = [
      { path: '/gutachter/faelle', label: 'Faelle-Uebersicht' },
      { path: '/gutachter/dashboard', label: 'SV-Dashboard' },
      { path: '/gutachter/kalender', label: 'SV-Kalender' },
      { path: '/gutachter/reklamationen', label: 'Reklamationen' },
    ]

    let idx = 2
    for (const route of svRoutes) {
      await shot(page, 'sv', `${pad(idx)}-vor-${route.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, `Vor ${route.label}`)
      idx++
      const ok = await navigateSafe(page, `${BASE_PLAIN}${route.path}`, route.label)
      await page.waitForTimeout(2000)
      await shot(page, 'sv', `${pad(idx)}-nach-${route.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, `${route.label} geladen`)
      idx++

      if (!ok) {
        finding('P0', `SV-${route.label.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-500`, 'sv', `${route.label} liefert Fehler-Status`)
      } else if (errors.length > 0) {
        const recentErr = errors.at(-1)
        if (recentErr && Date.now() - 3000 < Date.now()) { // immer recent
          finding('P0', `SV-${route.label.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-JSERR`, 'sv', `JS-Fehler in ${route.label}: ${recentErr.msg.substring(0, 80)}`)
          errors.length = 0 // reset für nächste Route
        }
      }
    }

    // Erstes Fall-Detail (SV)
    console.log('\n  --- SV Fall-Detail ---')
    const ok2 = await navigateSafe(page, `${BASE_PLAIN}/gutachter/faelle`, 'SV Faelle-Liste')
    if (ok2) {
      await page.waitForTimeout(2000)
      const firstFallLink = await page.$('a[href*="/gutachter/faelle/"], a[href*="/gutachter/auftraege/"]').catch(() => null)
      if (firstFallLink) {
        await shot(page, 'sv', `${pad(idx)}-vor-fall-detail`, 'Vor SV-Fall-Detail')
        idx++
        await firstFallLink.click()
        await page.waitForTimeout(3000)
        await shot(page, 'sv', `${pad(idx)}-nach-fall-detail`, 'SV-Fall-Detail geöffnet')
        idx++
        console.log(`  SV-Fall-Detail: ${page.url()}`)

        // Feldmodus-Trigger suchen
        const feldmodusBtn = await page.$('button:has-text("Feldmodus"), a:has-text("Feldmodus"), [aria-label*="Feldmodus"]').catch(() => null)
        if (feldmodusBtn) {
          await shot(page, 'sv', `${pad(idx)}-vor-feldmodus`, 'Feldmodus-Button sichtbar')
          idx++
          console.log('  Feldmodus-Button gefunden ✅')
        } else {
          finding('P2', 'SV-KEIN-FELDMODUS-BTN', 'sv', 'Feldmodus-Button nicht sichtbar im Fall-Detail')
        }
      } else {
        finding('P1', 'SV-KEINE-FAELLE', 'sv', 'Keine Fälle in SV-Liste — kein Detail-Test möglich')
      }
    }

  } catch (err) {
    console.log(`  ❌ SV-Smoke abgebrochen: ${err.message}`)
    finding('P0', 'SV-SMOKE-CRASH', 'sv', `Smoke-Script-Crash: ${err.message.substring(0, 100)}`)
    await page.screenshot({ path: path.join(SHOTS_DIR, 'sv', 'crash.png') }).catch(() => {})
  } finally {
    await ctx.close()
  }
}

// ─── Kanzlei-Portal-Smoke ─────────────────────────────────────────────────────

async function smokeKanzlei(browser) {
  console.log('\n═══ KANZLEI-PORTAL-SMOKE ═══')
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  const page = await ctx.newPage()

  const errors = []
  page.on('pageerror', err => errors.push({ msg: err.message }))

  try {
    const ok = await loginAs(page, 'kanzlei')
    if (!ok) {
      await shot(page, 'kanzlei', '001-vor-login-fehler', 'Kanzlei-Login fehlgeschlagen')
      await ctx.close()
      return
    }

    await shot(page, 'kanzlei', '001-nach-login', 'Kanzlei-Portal nach Login')

    const kanzleiRoutes = [
      { path: '/kanzlei/dashboard', label: 'Kanzlei-Dashboard' },
      { path: '/kanzlei/faelle', label: 'Kanzlei-Faelle' },
      { path: '/kanzlei/mandanten', label: 'Mandanten' },
    ]

    let idx = 2
    for (const route of kanzleiRoutes) {
      await shot(page, 'kanzlei', `${pad(idx)}-vor-${route.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, `Vor ${route.label}`)
      idx++
      const ok = await navigateSafe(page, `${BASE_PLAIN}${route.path}`, route.label)
      await page.waitForTimeout(2000)
      await shot(page, 'kanzlei', `${pad(idx)}-nach-${route.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, `${route.label} geladen`)
      idx++

      if (!ok) {
        finding('P0', `KANZLEI-${route.label.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-500`, 'kanzlei', `${route.label} liefert Fehler-Status`)
      } else if (errors.length > 0) {
        const recentErr = errors.at(-1)
        if (recentErr) {
          finding('P0', `KANZLEI-${route.label.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-JSERR`, 'kanzlei', `JS-Fehler in ${route.label}: ${recentErr.msg.substring(0, 80)}`)
          errors.length = 0
        }
      }
    }

    // Fall-Detail Kanzlei
    console.log('\n  --- Kanzlei-Fall-Detail ---')
    const ok2 = await navigateSafe(page, `${BASE_PLAIN}/kanzlei/faelle`, 'Kanzlei Faelle')
    if (ok2) {
      await page.waitForTimeout(2000)
      const firstLink = await page.$('a[href*="/kanzlei/faelle/"]').catch(() => null)
      if (firstLink) {
        await shot(page, 'kanzlei', `${pad(idx)}-vor-fall-detail`, 'Vor Kanzlei-Fall-Detail')
        idx++
        await firstLink.click()
        await page.waitForTimeout(3000)
        await shot(page, 'kanzlei', `${pad(idx)}-nach-fall-detail`, 'Kanzlei-Fall-Detail geöffnet')
        idx++
        console.log(`  Kanzlei-Fall-Detail: ${page.url()}`)
      } else {
        finding('P1', 'KANZLEI-KEINE-FAELLE', 'kanzlei', 'Keine Fälle in Kanzlei-Liste')
      }
    }

  } catch (err) {
    console.log(`  ❌ Kanzlei-Smoke abgebrochen: ${err.message}`)
    finding('P0', 'KANZLEI-SMOKE-CRASH', 'kanzlei', `Smoke-Script-Crash: ${err.message.substring(0, 100)}`)
    await page.screenshot({ path: path.join(SHOTS_DIR, 'kanzlei', 'crash.png') }).catch(() => {})
  } finally {
    await ctx.close()
  }
}

// ─── Makler-Portal-Smoke ──────────────────────────────────────────────────────

async function smokeMakler(browser) {
  console.log('\n═══ MAKLER-PORTAL-SMOKE ═══')
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  const page = await ctx.newPage()

  try {
    // Login-Versuch — Test-User existiert vermutlich nicht (B3 aus vorigen Run)
    console.log('  → Login-Versuch als makler (test-makler@claimondo.de)…')
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(2000)

    try {
      await page.fill('input[type="email"], input[name="email"]', TEST_USERS.makler.email, { timeout: 8000 })
      await page.fill('input[type="password"], input[name="password"]', TEST_USERS.makler.pass, { timeout: 5000 })
      await shot(page, 'makler', '001-vor-login-versuch', 'Makler-Login-Formular ausgefüllt')
      await page.click('button[type="submit"]', { timeout: 5000 })
      await page.waitForTimeout(3000)

      const currentUrl = page.url()
      if (currentUrl.includes('/login') || currentUrl.includes('error')) {
        await shot(page, 'makler', '002-nach-login-fehlgeschlagen', 'Makler-Login fehlgeschlagen (erwarteter Blocker B3)')
        finding('P0', 'MAKLER-KEIN-TESTUSER', 'makler', 'test-makler@claimondo.de existiert nicht — Makler-Portal nicht testbar (Blocker B3 aus Vorlauf bestätigt)')
        console.log('  ⚠️  Makler-Login fehlgeschlagen — B3 bestätigt, überspringe Portal-Smoke')
      } else {
        await shot(page, 'makler', '002-nach-login-success', 'Makler-Login erfolgreich (unerwartet!)')
        console.log('  ✅ Makler-Login erfolgreich')
        // Einfacher Smoke wenn Login klappt
        const routes = ['/makler/dashboard', '/makler/partner-werden', '/makler/onboarding']
        let idx = 3
        for (const r of routes) {
          const ok = await navigateSafe(page, `${BASE_PLAIN}${r}`, r)
          await page.waitForTimeout(1500)
          await shot(page, 'makler', `${pad(idx)}-nach-${r.replace(/\//g, '-')}`, `${r} geladen`)
          idx++
          if (!ok) finding('P0', `MAKLER-ROUTE-500`, 'makler', `${r} liefert Fehler`)
        }
      }
    } catch (err) {
      await shot(page, 'makler', '002-nach-login-fehler', `Login-Exception: ${err.message.substring(0, 40)}`)
      finding('P0', 'MAKLER-LOGIN-EXCEPTION', 'makler', `Login-Exception (B3 wahrscheinlich): ${err.message.substring(0, 80)}`)
    }

  } catch (err) {
    console.log(`  ❌ Makler-Smoke abgebrochen: ${err.message}`)
    finding('P0', 'MAKLER-SMOKE-CRASH', 'makler', `Smoke-Script-Crash: ${err.message.substring(0, 100)}`)
  } finally {
    await ctx.close()
  }
}

// ─── Kunden-Portal-Smoke ──────────────────────────────────────────────────────

async function smokeKunde(browser) {
  console.log('\n═══ KUNDEN-PORTAL-SMOKE (Magic-Link via Dispatch-Lead) ═══')
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  const page = await ctx.newPage()

  const errors = []
  page.on('pageerror', err => errors.push({ msg: err.message }))

  try {
    // Als Dispatch einloggen um Kunden-Fallakte zu öffnen
    console.log('  → Login als Dispatch um Lead mit Kunden-Portal-Link zu öffnen…')
    const ok = await loginAs(page, 'dispatch')
    if (!ok) {
      await shot(page, 'kunde', '001-vor-dispatch-login-fehler', 'Dispatch-Login für Kunden-Test fehlgeschlagen')
      await ctx.close()
      return
    }

    // Lead-Liste
    const leadsOk = await navigateSafe(page, `${BASE_PLAIN}/dispatch/leads`, 'Lead-Liste für Kunden-Test')
    await page.waitForTimeout(2000)
    await shot(page, 'kunde', '001-nach-dispatch-leads', 'Lead-Liste für Kunden-Test')

    if (leadsOk) {
      const firstLeadLink = await page.$('a[href*="/dispatch/leads/"]').catch(() => null)
      if (firstLeadLink) {
        await firstLeadLink.click()
        await page.waitForURL(/\/dispatch\/leads\//, { timeout: 15000 })
        await page.waitForTimeout(2000)
        await shot(page, 'kunde', '002-nach-lead-detail-fuer-kunde', 'Lead-Detail (Dispatch) — suche Kunden-Portal-Link')

        // Kunden-Magic-Link-Button suchen
        const magicLinkBtn = await page.$('button:has-text("Magic"), a:has-text("Magic"), button:has-text("Kunden-Portal"), a:has-text("Kunden-Portal"), [aria-label*="Magic"]').catch(() => null)
        if (magicLinkBtn) {
          await shot(page, 'kunde', '003-vor-magic-link-btn', 'Magic-Link-Button sichtbar')
          console.log('  Magic-Link-Button gefunden ✅')
          // Nicht klicken — würde echten Link generieren/versenden
          finding('P3', 'KUNDE-MAGIC-LINK-UI', 'kunde', 'Magic-Link-Button in Dispatch-Fallakte vorhanden (Klick-Test übersprungen, kein echter Versand)', 'INFO')
        } else {
          finding('P1', 'KUNDE-KEIN-MAGIC-LINK-BTN', 'kunde', 'Magic-Link-Button nicht in Dispatch-Fallakte sichtbar')
        }

        // Direkt Kunden-Portal-Route testen (anonyme Route, falls öffentlich)
        console.log('\n  --- Kunden-Portal-Routen (anonym) ---')
        const kundenRoutes = [
          { path: '/kunde/mein-fall', label: 'Kunden-Mein-Fall' },
          { path: '/kunde/dokumente', label: 'Kunden-Dokumente' },
        ]

        let idx = 4
        for (const route of kundenRoutes) {
          await shot(page, 'kunde', `${pad(idx)}-vor-${route.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, `Vor ${route.label}`)
          idx++
          const ok = await navigateSafe(page, `${BASE_PLAIN}${route.path}`, route.label)
          await page.waitForTimeout(2000)
          await shot(page, 'kunde', `${pad(idx)}-nach-${route.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, `${route.label} geladen`)
          idx++

          const finalUrl = page.url()
          // Erwarte Redirect auf Login oder Token-Anforderung (kein Crash)
          if (finalUrl.includes('/login') || finalUrl.includes('/token') || finalUrl.includes('/zugang')) {
            console.log(`  ✅ ${route.label}: Redirect auf Auth → korrekt`)
          } else if (!ok) {
            finding('P0', `KUNDE-${route.label.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-500`, 'kunde', `${route.label} liefert 5xx`)
          } else {
            console.log(`  ℹ️  ${route.label}: ${finalUrl} (kein Redirect, kein Crash)`)
          }
        }

      } else {
        finding('P1', 'KUNDE-KEIN-LEAD-FUER-TEST', 'kunde', 'Keine Leads in Dispatch um Kunden-Link zu testen')
        await shot(page, 'kunde', '002-nach-keine-leads', 'Keine Leads für Kunden-Test')
      }
    }

  } catch (err) {
    console.log(`  ❌ Kunden-Smoke abgebrochen: ${err.message}`)
    finding('P0', 'KUNDE-SMOKE-CRASH', 'kunde', `Smoke-Script-Crash: ${err.message.substring(0, 100)}`)
    await page.screenshot({ path: path.join(SHOTS_DIR, 'kunde', 'crash.png') }).catch(() => {})
  } finally {
    await ctx.close()
  }
}

// ─── Staging-Erreichbarkeit-Test ─────────────────────────────────────────────

async function testStagingReachable(browser) {
  console.log('\n═══ STAGING-ERREICHBARKEIT ═══')
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  const page = await ctx.newPage()

  try {
    console.log(`  → GET ${BASE_PLAIN}/login …`)
    const resp = await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    const status = resp?.status() ?? 0
    console.log(`  HTTP ${status}`)

    if (status === 401) {
      finding('P0', 'STAGING-BASIC-AUTH-FAIL', 'alle', 'Staging-Basic-Auth schlägt trotz Credentials fehl — falsche Credentials oder Basic-Auth nicht aktiv')
      await ctx.close()
      return false
    }
    if (status >= 500) {
      finding('P0', 'STAGING-LOGIN-500', 'alle', `Staging /login liefert HTTP ${status}`)
      await ctx.close()
      return false
    }

    await shot(page, 'dispatch', '000-staging-login-page', 'Staging-Login-Page erreichbar')
    console.log('  ✅ Staging erreichbar und Login-Page geladen')
    await ctx.close()
    return true
  } catch (err) {
    console.log(`  ❌ Staging nicht erreichbar: ${err.message}`)
    finding('P0', 'STAGING-NICHT-ERREICHBAR', 'alle', `Staging nicht erreichbar: ${err.message.substring(0, 100)}`)
    await ctx.close()
    return false
  }
}

// ─── Haupt-Runner ─────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗')
  console.log('║  Claimondo Portal-Smoke — app.staging.claimondo.de   ║')
  console.log(`║  ${new Date().toISOString()}                    ║`)
  console.log('╚═══════════════════════════════════════════════════════╝')

  const browser = await chromium.launch({ headless: true })

  try {
    const stagingOk = await testStagingReachable(browser)
    if (!stagingOk) {
      console.log('\n⛔ Staging nicht erreichbar — Smoke abgebrochen.')
    } else {
      await smokeDispatch(browser)
      await smokeSV(browser)
      await smokeKanzlei(browser)
      await smokeMakler(browser)
      await smokeKunde(browser)
    }
  } finally {
    await browser.close()
  }

  // Ergebnis-Zusammenfassung
  console.log('\n╔═══════════════════════════════════════════════════════╗')
  console.log('║  ERGEBNIS                                             ║')
  console.log('╚═══════════════════════════════════════════════════════╝')
  console.log(`\nScreenshots: ${shotCounter}`)
  console.log(`Findings:    ${findings.length}`)

  const bySeverity = { P0: [], P1: [], P2: [], P3: [] }
  for (const f of findings) {
    bySeverity[f.severity]?.push(f)
  }

  for (const [sev, list] of Object.entries(bySeverity)) {
    if (list.length > 0) {
      console.log(`\n${sev} (${list.length}):`)
      for (const f of list) console.log(`  [${f.id}] ${f.portal}: ${f.beschreibung}`)
    }
  }

  // JSON für Bericht
  const result = {
    datum: new Date().toISOString(),
    screenshots: shotCounter,
    findings,
    bySeverity: Object.fromEntries(Object.entries(bySeverity).map(([k, v]) => [k, v.length])),
  }
  fs.writeFileSync(path.join(SHOTS_DIR, 'portal-smoke-result.json'), JSON.stringify(result, null, 2))
  console.log(`\nErgebnis gespeichert: docs/13.05.2026/smoke-claimondo-de/portal-smoke-result.json`)

  return result
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
