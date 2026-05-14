// UWG/Brand-Voice/SEO-Smoke-Test für die Marketing-Surface gegen
// einen laufenden Next.js-Dev/Preview-Server. Kombiniert die Lint-Regeln
// aus dem Cowork-Prototyp-Smoke (_PROTOTYPEN/smoke-test.mjs) mit echten
// Next.js-Routen + JSON-LD-Validierung + Screenshots.
//
// USAGE:
//   # Server starten (separates Terminal):
//   npm run dev   # oder: SCREENSHOT_BASE_URL=https://staging.claimondo.de
//
//   # Smoke-Test fahren:
//   npm run smoke:marketing-uwg
//   node scripts/smoke/marketing-uwg-smoke.mjs --routes=/,/vorteile,/kfz-gutachter/koeln
//
// OUTPUT:
//   tmp/smoke-runs/<timestamp>-uwg/report.md      (lesbar mit Fix-Vorschlägen)
//   tmp/smoke-runs/<timestamp>-uwg/report.json    (Findings + Severity)
//   tmp/smoke-runs/<timestamp>-uwg/<route>-{desktop,mobile}.png
//
// EXIT CODES:
//   0 — alle Routes 200 + keine High-Severity-Findings
//   1 — eine oder mehr Routes nicht erreichbar oder High-Severity-Findings
//
// ENV:
//   SCREENSHOT_BASE_URL  Base-URL des Servers (default: http://localhost:3002)
//   SMOKE_ROUTES         Komma-Liste an Routen statt Default
//   HEADLESS             'false' → Chrome sichtbar (Debug-Modus)

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3002'
const HEADLESS = process.env.HEADLESS !== 'false'

const argRoutes = process.argv.find((a) => a.startsWith('--routes='))?.slice('--routes='.length)
const ROUTES = (process.env.SMOKE_ROUTES ?? argRoutes ?? [
  '/',
  '/vorteile',
  '/ueber-uns',
  '/faq',
  '/schadensreport-2026',
  '/gutachter-finden',
  '/wie-es-funktioniert',
  '/kfz-gutachter',
  '/kfz-gutachter/koeln',
  '/kfz-gutachter/duesseldorf',
  '/beratung-anfragen',
  '/ersteinschaetzung',
  '/llms.txt',
  '/llms-full.txt',
].join(',')).split(',').map((s) => s.trim()).filter(Boolean)

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
}

// UWG-Phantom-Patterns — dürfen NICHT auf der gerenderten Seite vorkommen.
const PHANTOMS = [
  { re: /\b110\+\s*DAT/i, hint: '110+ DAT Phantom — Aggregator-Framing statt absoluter Zahl' },
  { re: /\b89\+\s*(DAT|Sachverständige|Partner|Gutachter)/i, hint: '89+ Phantom' },
  { re: /\+33\s*%\s*mehr/i, hint: '+33 % unbelegt — auf 30–40 % NDR/BGH umstellen' },
  { re: /Köln\s*·\s*23\s*SV/i, hint: 'Phantom-Stadt-Zahl' },
  { re: /(Düsseldorf|Dortmund|Essen|Bonn)\s*·\s*\d+\s*SV/i, hint: 'Phantom-Stadt-Zahl' },
  { re: /0221\s*123\s*456\s*78/, hint: 'Footer-Platzhalter-Telefon' },
  { re: /\+4922112345678/, hint: 'Footer-Platzhalter-Telefon (E.164)' },
  { re: /\b72\s+(Städte|Stadt-Pages|indexierbare)/i, hint: 'Phantom „72 Städte"' },
]

// Brand-Voice-Blocklist (aus BRAND-VOICE-AUDIT.md §3.2).
const BLOCKLIST = [
  { re: /\beinfach\.\s*fair\.\s*deutschlandweit\.?\b/i, hint: 'Buzzword-Tripel' },
  { re: /\bschnell,?\s*einfach,?\s*transparent\b/i, hint: 'Buzzword-Tripel' },
  { re: /\bmarktführer\b/i, hint: 'Superlativ ohne Beleg' },
  { re: /\bnr\.?\s*1\b/i, hint: 'Superlativ ohne Beleg' },
  { re: /\bbest-?in-?class\b/i, hint: 'Superlativ ohne Beleg' },
  { re: /\bLexDrive\b/, hint: 'Kanzlei-Name in Marketing-Surface (anonymisieren)' },
]

// SEO/Compliance-Pflicht-Strings — MÜSSEN auf jeder Marketing-Route vorhanden sein.
// LLMs-txt Routes haben spezielle Anforderungen (nicht alle Trust-Anker dort).
const REQUIRED_BY_ROUTE = (route) => {
  const isLlms = route.startsWith('/llms')
  return [
    { needle: '§249 BGB', hint: 'Compliance-Anker bei 0-€-Versprechen', critical: !isLlms },
    { needle: 'DAT', hint: 'Trust-Anker (DAT-Netzwerk)' },
    ...(isLlms ? [] : [{ needle: 'BGH VI ZR', hint: 'Recht-Anker (mind. 1 BGH-Aktenzeichen)' }]),
  ]
}

// ASCII-Umlaut-Ersatz (verbindlich UTF-8 ä/ö/ü/ß).
const ASCII_REPL =
  /\b(Fuer|fuer|naechst|Naechst|ueber|Ueber|aendern|Aenderung|loesch|Loesch|grosse|groesse|moegli|Moegli|spaet|Spaet|haeuf|Haeuf|jaehr|Jaehr|geprueft|gepruef|Schaeden|schaeden|Anwaelte|anwaelte)\b/g

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}
function slugify(route) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9-]+/gi, '-')
}

async function smokeRoute(browser, route, viewport, outDir) {
  const findings = []
  const ctx = await browser.newContext({ viewport: VIEWPORTS[viewport] })
  const page = await ctx.newPage()
  let status = 0
  let isText = false
  try {
    const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60_000 })
    status = resp?.status() ?? 0
    isText = (resp?.headers()['content-type'] ?? '').startsWith('text/plain')
  } catch (err) {
    findings.push({ severity: 'high', rule: 'http_error', route, viewport, message: `Goto failed: ${err.message}` })
    await ctx.close()
    return { status: 0, findings, screenshotPath: null }
  }

  if (status < 200 || status >= 400) {
    findings.push({ severity: 'high', rule: 'http_error', route, viewport, message: `HTTP ${status}`, fix: 'Route prüfen oder Build-Output checken' })
  }

  // Text body (auch für /llms.txt etc.) oder DOM-Text bei HTML
  let body
  if (isText) {
    body = await page.evaluate(() => document.body.innerText)
  } else {
    body = await page.evaluate(() => document.body?.innerText ?? '')
  }

  // 1. Phantom-Patterns
  for (const p of PHANTOMS) {
    const m = body.match(p.re)
    if (m) {
      findings.push({
        severity: 'high', rule: 'uwg_phantom', route, viewport,
        message: `Phantom-Match: „${m[0]}"`,
        fix: p.hint,
      })
    }
  }
  // 2. Brand-Voice-Blocklist
  for (const b of BLOCKLIST) {
    const m = body.match(b.re)
    if (m) {
      findings.push({
        severity: 'medium', rule: 'voice_blocklist', route, viewport,
        message: `Marketing-Wording: „${m[0]}"`,
        fix: b.hint,
      })
    }
  }
  // 3. SEO/Compliance-Pflicht-Strings
  for (const r of REQUIRED_BY_ROUTE(route)) {
    if (!body.includes(r.needle)) {
      findings.push({
        severity: r.critical ? 'high' : 'medium',
        rule: 'seo_coverage', route, viewport,
        message: `Pflicht-String fehlt: „${r.needle}" — ${r.hint}`,
        fix: r.critical ? 'KRITISCH ergänzen (UWG-/Compliance-Pflicht)' : 'Trust-Anker ergänzen',
      })
    }
  }
  // 4. §249-Disclaimer bei 0-€-Aussagen
  const hasMoneyClaim = /(\b0\s*€|\bkostenfrei\b|\bkostenlos\b)/i.test(body)
  const hasDisclaimer = /§\s*249\s*BGB|vorbehaltlich Anerkenntnis/i.test(body)
  if (hasMoneyClaim && !hasDisclaimer) {
    findings.push({
      severity: 'high', rule: 'no_249_disclaimer', route, viewport,
      message: '„0 €/kostenfrei" gefunden, aber kein §249-BGB-Disclaimer auf der Route',
      fix: '„nach §249 BGB, vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer" ergänzen',
    })
  }
  // 5. ASCII-Umlaut-Ersatz
  const asciiHits = [...new Set(body.match(ASCII_REPL) ?? [])]
  if (asciiHits.length > 0) {
    findings.push({
      severity: 'medium', rule: 'ascii_umlaut_replacement', route, viewport,
      message: `ASCII-Ersatz-Strings: ${asciiHits.join(', ')}`,
      fix: 'Echte ä/ö/ü/ß-Umlaute verwenden (siehe AGENTS.md §Sprache)',
    })
  }

  // Nur HTML-Routes haben JSON-LD + Title/Meta
  if (!isText) {
    // 6. JSON-LD-Validität
    const ldErrors = await page.evaluate(() => {
      const errs = []
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      scripts.forEach((s, i) => {
        try { JSON.parse(s.textContent || '') }
        catch (e) { errs.push(`LD#${i}: ${e.message}`) }
      })
      return { count: scripts.length, errs }
    })
    if (ldErrors.errs.length > 0) {
      for (const e of ldErrors.errs) {
        findings.push({
          severity: 'high', rule: 'jsonld_invalid', route, viewport,
          message: `Invalides JSON-LD: ${e}`,
          fix: 'Trailing-Commas / Escape-Quotes prüfen',
        })
      }
    }
    if (ldErrors.count === 0 && route !== '/datenschutz' && route !== '/impressum') {
      findings.push({
        severity: 'medium', rule: 'jsonld_missing', route, viewport,
        message: 'Keine JSON-LD-Schemas auf Marketing-Page',
        fix: 'Mind. Organization+Breadcrumbs ergänzen (SCHEMA-LIBRARY.md)',
      })
    }
    // 7. Title + Meta-Description-Presence
    const head = await page.evaluate(() => ({
      title: document.title || '',
      desc: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    }))
    if (!head.title) findings.push({ severity: 'high', rule: 'no_title', route, viewport, message: '<title> leer', fix: 'generateMetadata().title setzen' })
    if (!head.desc) findings.push({ severity: 'medium', rule: 'no_meta_description', route, viewport, message: 'meta description fehlt', fix: 'generateMetadata().description setzen' })
    // 8. Horizontal-Overflow nur im Mobile-Viewport
    if (viewport === 'mobile') {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (overflow > 2) {
        findings.push({
          severity: 'medium', rule: 'horizontal_overflow', route, viewport,
          message: `${overflow}px horizontales Overflow (DOM > Viewport)`,
          fix: 'overflow-x-hidden auf Container oder problematisches Element kürzen',
        })
      }
    }
  }

  // Screenshot (nur HTML-Routes, llms.txt et al. sind Pure-Text)
  let screenshotPath = null
  if (!isText) {
    screenshotPath = join(outDir, `${slugify(route)}-${viewport}.png`)
    try {
      await page.screenshot({ path: screenshotPath, fullPage: viewport === 'desktop' })
    } catch {/* ignore screenshot failures */}
  }

  await ctx.close()
  return { status, findings, screenshotPath }
}

async function main() {
  const stamp = ts()
  const outDir = join('tmp', 'smoke-runs', `${stamp}-uwg`)
  await mkdir(outDir, { recursive: true })

  console.log(`🔎 Marketing-UWG-Smoke gegen ${BASE}`)
  console.log(`   Routes: ${ROUTES.length} · Output: ${outDir}/\n`)

  const browser = await chromium.launch({ headless: HEADLESS })
  const allFindings = []
  const summary = []

  for (const route of ROUTES) {
    const routeFindings = []
    let routeStatus = 0
    for (const vp of Object.keys(VIEWPORTS)) {
      const { status, findings } = await smokeRoute(browser, route, vp, outDir)
      routeStatus = status || routeStatus
      routeFindings.push(...findings)
    }
    const high = routeFindings.filter((f) => f.severity === 'high').length
    const med = routeFindings.filter((f) => f.severity === 'medium').length
    summary.push({ route, status: routeStatus, high, med })
    allFindings.push(...routeFindings)
    const icon = high > 0 ? '❌' : med > 0 ? '🟡' : '✓'
    console.log(`${icon} ${route.padEnd(40)} HTTP ${routeStatus} · 🔴 ${high} 🟡 ${med}`)
  }
  await browser.close()

  // Reports
  const totalHigh = allFindings.filter((f) => f.severity === 'high').length
  const totalMed = allFindings.filter((f) => f.severity === 'medium').length
  await writeFile(join(outDir, 'report.json'), JSON.stringify({
    run_at: new Date().toISOString(), base: BASE, summary,
    counts: { high: totalHigh, medium: totalMed, total: allFindings.length },
    findings: allFindings,
  }, null, 2))

  const md = [
    `# Marketing-UWG-Smoke Report`,
    ``,
    `**Run:** ${new Date().toISOString()}`,
    `**Base:** ${BASE}`,
    `**Findings:** 🔴 ${totalHigh} High · 🟡 ${totalMed} Medium · Total ${allFindings.length}`,
    ``,
    `## Per Route`,
    ``,
    `| Route | HTTP | 🔴 High | 🟡 Medium |`,
    `|---|---|---|---|`,
    ...summary.map((s) => `| \`${s.route}\` | ${s.status} | ${s.high} | ${s.med} |`),
    ``,
    `## Findings`,
    ``,
    allFindings.length === 0
      ? `🟢 Keine Findings — Marketing-Surface ist Smoke-Test-fest.`
      : allFindings
          .sort((a, b) => (a.severity === 'high' ? -1 : 1))
          .map((f, i) =>
            [
              `### ${i + 1}. ${f.severity === 'high' ? '🔴' : '🟡'} ${f.rule}  (${f.route} · ${f.viewport})`,
              ``,
              `**Issue:** ${f.message}`,
              ``,
              `**Fix:** ${f.fix ?? '(siehe Rule-Doku)'}`,
              ``,
            ].join('\n'),
          )
          .join('\n'),
  ].join('\n')

  await writeFile(join(outDir, 'report.md'), md)

  console.log(`\n📄 Report: ${join(outDir, 'report.md')}`)
  console.log(`📊 Findings: 🔴 ${totalHigh} · 🟡 ${totalMed}`)

  if (totalHigh > 0 || summary.some((s) => s.status < 200 || s.status >= 400)) {
    process.exit(1)
  }
}

await main()
