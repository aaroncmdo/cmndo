/**
 * scripts/e2e-platform-sweep.mjs — Light-Sweep: alle Top-Level-Routen pro Rolle
 *
 * Pro Rolle: Login → jede bekannte Top-Level-Route navigieren → Screenshot.
 * Ergebnis: HTTP-Status 200/ok oder 404/500 notiert.
 * Keine tiefen Klicks — nur "Route lädt ohne 500/404".
 *
 * Ausführung:
 *   node scripts/e2e-platform-sweep.mjs
 *
 * Output:
 *   docs/portals-review/PLATFORM-SWEEP-<ts>.md
 *   screenshots: docs/portals-review/screenshots/platform-sweep/<ts>/
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

function ladeEnv() {
  const envPath = join(projectRoot, '.env.local')
  if (!existsSync(envPath)) return
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq < 0) continue
    const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}
ladeEnv()

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

function zeitstempel() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

// Top-Level-Routen pro Rolle
const ROLLEN_ROUTEN = {
  admin: {
    email: 'test-admin@claimondo.de',
    password: 'Test1234!',
    routen: [
      '/admin',
      '/admin/faelle',
      '/admin/sachverstaendige',
      '/admin/leads',
      '/admin/abrechnungen',
      '/admin/finance',
      '/admin/kalender',
      '/admin/statistiken',
      '/admin/tasks',
    ],
  },
  dispatch: {
    email: 'test-dispatch@claimondo.de',
    password: 'Test1234!',
    routen: [
      '/dispatch',
      '/dispatch/dashboard',
      '/dispatch/leads',
      '/dispatch/kalender',
      '/dispatch/statistiken',
    ],
  },
  sv: {
    email: 'test-sv@claimondo.de',
    password: 'Test1234!',
    routen: [
      '/gutachter',
      '/gutachter/heute',
      '/gutachter/auftraege',
      '/gutachter/termine',
      '/gutachter/faelle',
      '/gutachter/kalender',
      '/gutachter/mitteilungen',
      '/gutachter/einstellungen',
      '/gutachter/abrechnung',
      '/gutachter/profil',
    ],
  },
  kunde: {
    email: 'test-kunde@claimondo.de',
    password: 'Test1234!',
    routen: [
      '/kunde',
      '/kunde/faelle',
      '/kunde/einstellungen',
    ],
  },
  kb: {
    email: 'test-kb@claimondo.de',
    password: 'Test1234!',
    routen: [
      '/admin',
      '/admin/faelle',
      '/admin/kalender',
      '/admin/tasks',
    ],
  },
}

async function sweepRolle(browser, rolleName, config, screenshotDir) {
  console.log(`\n▶ Sweep Rolle: ${rolleName} (${config.email})`)
  const ergebnisse = []

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    storageState: {
      cookies: [{
        name: 'claimondo-cookie-consent', value: 'true',
        domain: 'localhost', path: '/', expires: Math.floor(Date.now() / 1000) + 31536000,
        httpOnly: false, secure: false, sameSite: 'Lax',
      }],
      origins: [],
    },
  })

  const page = await context.newPage()

  // Login
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.fill('input[type="email"], input[name="email"], #email', config.email)
    await page.fill('input[type="password"], input[name="password"], #password', config.password)
    await page.click('button[type="submit"]:has-text("Einloggen"), button:has-text("Einloggen")')
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {})

    const loginUrl = page.url()
    if (loginUrl.includes('/login')) {
      console.log(`  ❌ Login fehlgeschlagen — bleibt auf /login`)
      ergebnisse.push({ route: 'LOGIN', status: 'HARD-FAIL', note: 'Login fehlgeschlagen' })
      await context.close()
      return { rolleName, ergebnisse, loginOk: false }
    }
    console.log(`  ✓ Login OK → ${loginUrl}`)
  } catch (err) {
    console.log(`  ❌ Login Exception: ${err.message}`)
    await context.close()
    return { rolleName, ergebnisse, loginOk: false }
  }

  // Routen durchgehen
  for (const route of config.routen) {
    const vollUrl = `${BASE_URL}${route}`
    const safeLabel = `${rolleName}${route.replace(/\//g, '-')}`

    let status = 'OK'
    let note = ''

    try {
      const response = await page.goto(vollUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
      const httpStatus = response?.status() ?? 0

      // Screenshot
      await page.screenshot({
        path: join(screenshotDir, `${safeLabel}.png`),
        fullPage: false,
      }).catch(() => {})

      const finalUrl = page.url()

      if (httpStatus >= 500) {
        status = '500'
        note = `HTTP ${httpStatus} — Server-Fehler`
      } else if (httpStatus === 404 || finalUrl.includes('not-found')) {
        status = '404'
        note = `HTTP ${httpStatus} oder 404-Page`
      } else if (finalUrl.includes('/login')) {
        status = 'AUTH-REDIRECT'
        note = `Redirect auf /login — Auth-Guard aktiv`
      } else if (httpStatus === 0) {
        status = 'TIMEOUT'
        note = 'Kein Response — Timeout'
      } else {
        status = `OK (${httpStatus})`
      }

      // Kurz prüfen ob Next.js Error-Boundary angezeigt wird
      const hasErrorBoundary = await page.getByText(/Application error|Something went wrong/i).isVisible({ timeout: 1000 }).catch(() => false)
      if (hasErrorBoundary) {
        status = 'ERROR-BOUNDARY'
        note = 'Next.js Application-Error-Boundary sichtbar'
      }

    } catch (err) {
      status = 'CRASH'
      note = err.message.slice(0, 100)
      await page.screenshot({
        path: join(screenshotDir, `${safeLabel}-error.png`),
        fullPage: false,
      }).catch(() => {})
    }

    const emoji = status.startsWith('OK') ? '✅' : status === 'AUTH-REDIRECT' ? '⚠️' : '❌'
    console.log(`  ${emoji} ${route} → ${status}${note ? ': ' + note : ''}`)
    ergebnisse.push({ route, status, note })
  }

  await context.close()
  return { rolleName, ergebnisse, loginOk: true }
}

async function main() {
  const ts = zeitstempel()
  const screenshotDir = join(projectRoot, 'docs', 'portals-review', 'screenshots', 'platform-sweep', ts)
  mkdirSync(screenshotDir, { recursive: true })

  console.log('══════════════════════════════════════════════')
  console.log('  Claimondo Platform-Sweep (Light)')
  console.log(`  Zeitstempel: ${ts}`)
  console.log(`  Base-URL:    ${BASE_URL}`)
  console.log('══════════════════════════════════════════════')

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })

  const alleErgebnisse = []
  for (const [rolleName, config] of Object.entries(ROLLEN_ROUTEN)) {
    const ergebnis = await sweepRolle(browser, rolleName, config, screenshotDir)
    alleErgebnisse.push(ergebnis)
  }

  await browser.close()

  // Bericht schreiben
  const lines = [
    `# Platform-Sweep-Bericht — ${ts}`,
    '',
    '> Light-Sweep: Login + alle Top-Level-Routen, kein tiefer Klick. Nur "Route lädt ohne 500/404" geprüft.',
    '',
    '## Zusammenfassung',
    '',
  ]

  for (const { rolleName, ergebnisse, loginOk } of alleErgebnisse) {
    const ok = ergebnisse.filter((e) => e.status.startsWith('OK')).length
    const fail = ergebnisse.filter((e) => !e.status.startsWith('OK') && e.status !== 'AUTH-REDIRECT').length
    const warn = ergebnisse.filter((e) => e.status === 'AUTH-REDIRECT').length
    lines.push(`### ${rolleName} — Login: ${loginOk ? '✅' : '❌'} | Routen: ✅ ${ok} / ⚠️ ${warn} / ❌ ${fail}`)
    lines.push('')
    lines.push('| Route | Status | Notiz |')
    lines.push('|---|---|---|')
    for (const e of ergebnisse) {
      const em = e.status.startsWith('OK') ? '✅' : e.status === 'AUTH-REDIRECT' ? '⚠️' : '❌'
      lines.push(`| \`${e.route}\` | ${em} ${e.status} | ${e.note || '–'} |`)
    }
    lines.push('')
  }

  lines.push(`*Screenshots: \`${screenshotDir}\`*`)

  const berichtPath = join(projectRoot, 'docs', 'portals-review', `PLATFORM-SWEEP-${ts}.md`)
  writeFileSync(berichtPath, lines.join('\n'), 'utf-8')

  console.log(`\nBericht: ${berichtPath}`)
  console.log(`Screenshots: ${screenshotDir}`)
}

main().catch((err) => {
  console.error('[KRITISCH]', err.message)
  process.exit(1)
})
