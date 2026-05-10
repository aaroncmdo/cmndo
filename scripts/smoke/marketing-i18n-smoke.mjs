#!/usr/bin/env node
/**
 * Marketing-Smoke mit Sprachen + Subdomains.
 *
 * Crawlt die öffentlichen Marketing-Pages in allen 6 Sprachen + die
 * gutachter.claimondo.de B2B-Landing. Pro Page: Screenshot + HTTP-Status
 * + Console-Errors + LCP-Marker. Output: tmp/smoke-runs/<timestamp>/.
 *
 * Use:
 *   node scripts/smoke/marketing-i18n-smoke.mjs
 *   node scripts/smoke/marketing-i18n-smoke.mjs --base=https://claimondo.de
 *   node scripts/smoke/marketing-i18n-smoke.mjs --langs=de,en
 *   node scripts/smoke/marketing-i18n-smoke.mjs --headed
 *
 * Voraussetzung: Playwright installiert (npm install). Browser:
 *   npx playwright install chromium
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '../..')

// CLI
const args = process.argv.slice(2)
const baseArg = args.find((a) => a.startsWith('--base='))
const langsArg = args.find((a) => a.startsWith('--langs='))
const headed = args.includes('--headed')
const baseMain = baseArg ? baseArg.split('=')[1] : 'https://claimondo.de'
const baseGutachter = baseMain.replace('://claimondo.de', '://gutachter.claimondo.de')

const ALL_LANGS = ['de', 'en', 'ar', 'tr', 'pl', 'ru']
const langs = langsArg ? langsArg.split('=')[1].split(',') : ALL_LANGS

// Marketing-Pages (Pfad ohne Locale-Präfix — next-intl macht den Rewrite)
const MARKETING_ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/vorteile', name: 'vorteile' },
  { path: '/wie-es-funktioniert', name: 'wie-es-funktioniert' },
  { path: '/faq', name: 'faq' },
  { path: '/ueber-uns', name: 'ueber-uns' },
  { path: '/kfz-gutachter', name: 'kfz-gutachter' },
  { path: '/gutachter-finden', name: 'gutachter-finden' },
  { path: '/schadensreport-2026', name: 'schadensreport-2026' },
  { path: '/impressum', name: 'impressum' },
  { path: '/datenschutz', name: 'datenschutz' },
  { path: '/agb', name: 'agb' },
]

// gutachter.claimondo.de hat keinen Sprachen-Switch (B2B, nur DE) —
// einzelne Page, ein Screenshot.
const GUTACHTER_ROUTES = [{ path: '/', name: 'gutachter-b2b-landing' }]

// ─── Setup ─────────────────────────────────────────────────────────

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT_DIR = join(projectRoot, 'tmp', 'smoke-runs', TIMESTAMP)
mkdirSync(OUT_DIR, { recursive: true })

console.log(`[smoke] Output: ${OUT_DIR}`)
console.log(`[smoke] Base: ${baseMain}`)
console.log(`[smoke] Langs: ${langs.join(', ')}`)

const report = {
  timestamp: TIMESTAMP,
  base: baseMain,
  langs,
  results: /** @type {Array<any>} */ ([]),
}

// ─── Browser ───────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: !headed })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'de-DE',
  userAgent:
    'Mozilla/5.0 ClaimondoSmokeBot/1.0 (Playwright; +https://claimondo.de)',
})

async function smoke(label, url, screenshotPath, langCookie = null) {
  const page = await context.newPage()
  const consoleErrors = /** @type {string[]} */ ([])
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  const result = {
    label,
    url,
    status: null,
    title: null,
    h1: null,
    htmlLang: null,
    dir: null,
    consoleErrors: 0,
    consoleSamples: /** @type {string[]} */ ([]),
    loadTimeMs: null,
    error: null,
    screenshot: null,
  }

  try {
    // Locale-Cookie (next-intl liest den)
    if (langCookie) {
      await context.addCookies([
        {
          name: 'NEXT_LOCALE',
          value: langCookie,
          url: baseMain,
        },
      ])
    }

    const t0 = Date.now()
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })
    result.status = response?.status() ?? null
    result.loadTimeMs = Date.now() - t0
    result.title = await page.title()
    result.h1 = await page
      .locator('h1')
      .first()
      .textContent({ timeout: 3000 })
      .catch(() => null)
    result.htmlLang = await page.locator('html').getAttribute('lang')
    result.dir = await page.locator('html').getAttribute('dir')
    result.consoleErrors = consoleErrors.length
    result.consoleSamples = consoleErrors.slice(0, 3)

    await page.screenshot({ path: screenshotPath, fullPage: true })
    result.screenshot = screenshotPath.replace(OUT_DIR + '/', '')

    const status = result.status === 200 ? '✓' : '✗'
    console.log(
      `${status} ${label}  HTTP ${result.status}  lang=${result.htmlLang}  dir=${result.dir ?? '-'}  errs=${consoleErrors.length}  ${result.loadTimeMs}ms`,
    )
  } catch (err) {
    result.error = String(err?.message ?? err)
    console.error(`✗ ${label}  FEHLER: ${result.error}`)
  } finally {
    await page.close()
  }
  return result
}

// ─── Marketing × Sprachen ─────────────────────────────────────────

for (const lang of langs) {
  const langDir = join(OUT_DIR, 'marketing', lang)
  mkdirSync(langDir, { recursive: true })

  for (const route of MARKETING_ROUTES) {
    const url = baseMain + route.path
    const screenshotPath = join(langDir, `${route.name}.png`)
    const r = await smoke(
      `marketing/${lang}${route.path}`,
      url,
      screenshotPath,
      lang,
    )
    report.results.push({ ...r, lang, area: 'marketing', route: route.path })
  }
}

// ─── gutachter.claimondo.de (kein Sprachen-Switch) ────────────────

const gDir = join(OUT_DIR, 'gutachter')
mkdirSync(gDir, { recursive: true })
for (const route of GUTACHTER_ROUTES) {
  const url = baseGutachter + route.path
  const screenshotPath = join(gDir, `${route.name}.png`)
  const r = await smoke(`gutachter${route.path}`, url, screenshotPath, null)
  report.results.push({ ...r, lang: 'de', area: 'gutachter', route: route.path })
}

// ─── Bonus: gutachter.claimondo.de Form-Live-Karten-Test ───────────

try {
  const page = await context.newPage()
  await page.goto(baseGutachter + '/', { waitUntil: 'networkidle', timeout: 30000 })

  // PLZ eingeben → Mapbox sollte hinfliegen
  const plzInput = page.locator('input[name="plz"]')
  await plzInput.fill('50670')
  await page.waitForTimeout(2500) // Geocoding + flyTo

  await page.screenshot({
    path: join(gDir, 'form-with-plz-50670.png'),
    fullPage: true,
  })

  const hint = await page
    .locator('text=/Köln/i')
    .first()
    .textContent({ timeout: 2000 })
    .catch(() => null)

  report.results.push({
    label: 'gutachter/form-live-map',
    area: 'gutachter',
    interaction: 'fill PLZ 50670',
    hint_visible: !!hint,
    hint_text: hint,
    screenshot: 'gutachter/form-with-plz-50670.png',
  })
  console.log(`✓ gutachter form PLZ-Test  hint=${hint?.slice(0, 60) ?? 'null'}`)
  await page.close()
} catch (err) {
  console.error(`✗ gutachter form PLZ-Test FEHLER: ${err}`)
}

// ─── Cleanup + Report ─────────────────────────────────────────────

await browser.close()

const counts = {
  total: report.results.length,
  ok: report.results.filter((r) => r.status === 200).length,
  errors: report.results.filter((r) => r.status && r.status !== 200).length,
  exceptions: report.results.filter((r) => r.error).length,
  consoleErrorPages: report.results.filter((r) => r.consoleErrors > 0).length,
}

writeFileSync(
  join(OUT_DIR, 'report.json'),
  JSON.stringify({ ...report, counts }, null, 2),
  'utf-8',
)

const summary = renderSummary(report, counts)
writeFileSync(join(OUT_DIR, 'SUMMARY.md'), summary, 'utf-8')

console.log('\n──────────────────')
console.log(`✓ Done: ${counts.ok}/${counts.total} HTTP 200`)
console.log(`✗ Errors: ${counts.errors} HTTP non-200, ${counts.exceptions} exceptions`)
console.log(`⚠ Console-Errors auf ${counts.consoleErrorPages} Pages`)
console.log(`📁 ${OUT_DIR}`)
console.log(`📄 ${join(OUT_DIR, 'SUMMARY.md')}`)

process.exit(counts.errors + counts.exceptions === 0 ? 0 : 1)

function renderSummary(report, counts) {
  const lines = []
  lines.push(`# Marketing-i18n-Smoke — ${report.timestamp}`)
  lines.push('')
  lines.push(`**Base:** ${report.base}`)
  lines.push(`**Sprachen:** ${report.langs.join(', ')}`)
  lines.push('')
  lines.push(`## Übersicht`)
  lines.push('')
  lines.push(`- Gesamt: **${counts.total}**`)
  lines.push(`- HTTP 200: **${counts.ok}**`)
  lines.push(`- HTTP non-200: **${counts.errors}**`)
  lines.push(`- Exceptions: **${counts.exceptions}**`)
  lines.push(`- Console-Errors: **${counts.consoleErrorPages}** Pages`)
  lines.push('')

  // Pro Sprache
  for (const lang of report.langs) {
    const rows = report.results.filter((r) => r.lang === lang && r.area === 'marketing')
    if (rows.length === 0) continue
    lines.push(`## Marketing — ${lang.toUpperCase()}`)
    lines.push('')
    lines.push('| Route | Status | html-lang | dir | Title | H1 (excerpt) | Console-Errs | Load |')
    lines.push('|---|---|---|---|---|---|---|---|')
    for (const r of rows) {
      const t = (r.title ?? '').slice(0, 40)
      const h = (r.h1 ?? '').slice(0, 40).replace(/\n/g, ' ')
      lines.push(
        `| ${r.route} | ${r.status ?? '-'} | ${r.htmlLang ?? '-'} | ${r.dir ?? '-'} | ${t} | ${h} | ${r.consoleErrors} | ${r.loadTimeMs}ms |`,
      )
    }
    lines.push('')
  }

  // Gutachter
  const gRows = report.results.filter((r) => r.area === 'gutachter')
  if (gRows.length > 0) {
    lines.push(`## Gutachter B2B-Landing`)
    lines.push('')
    for (const r of gRows) {
      lines.push(
        `- **${r.label}** — ${r.status ? 'HTTP ' + r.status : ''} ${r.error ? '· FEHLER: ' + r.error : ''}`,
      )
      if (r.screenshot) lines.push(`  - Screenshot: \`${r.screenshot}\``)
      if (r.hint_text) lines.push(`  - Live-Karten-Hint: "${r.hint_text}"`)
    }
    lines.push('')
  }

  // Console-Error-Details
  const errPages = report.results.filter((r) => r.consoleErrors > 0)
  if (errPages.length > 0) {
    lines.push(`## Console-Error-Samples`)
    lines.push('')
    for (const r of errPages) {
      lines.push(`### ${r.label}`)
      for (const s of r.consoleSamples) {
        lines.push(`- \`${s.slice(0, 200)}\``)
      }
      lines.push('')
    }
  }

  return lines.join('\n') + '\n'
}
