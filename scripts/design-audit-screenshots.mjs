// Design-Audit Screenshot-Pass für Kunde-facing Routen.
// Fährt Public-Routes durch und schiesst Desktop + Mobile-Viewport-Screenshots.

import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3007'
const OUT  = process.env.AUDIT_OUT ?? 'docs/14.05.2026/design-audit/screenshots'

const ROUTES = [
  // Marketing / Public
  { name: 'home',                path: '/' },
  { name: 'faq',                 path: '/faq' },
  { name: 'gutachter-finden',    path: '/gutachter-finden' },
  { name: 'wie-es-funktioniert', path: '/wie-es-funktioniert' },
  { name: 'vorteile',            path: '/vorteile' },
  { name: 'ueber-uns',           path: '/ueber-uns' },
  { name: 'schaden-melden',      path: '/schaden-melden' },
  { name: 'beratung-anfragen',   path: '/beratung-anfragen' },
  { name: 'ersteinschaetzung',   path: '/ersteinschaetzung' },
  { name: 'kfz-gutachter',       path: '/kfz-gutachter' },
  // Auth-Routes (öffentlich)
  { name: 'login',               path: '/login' },
  { name: 'passwort-vergessen',  path: '/passwort-vergessen' },
  // Legal
  { name: 'impressum',           path: '/impressum' },
  { name: 'datenschutz',         path: '/datenschutz' },
  { name: 'agb',                 path: '/agb' },
]

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 390,  height: 844, isMobile: true, deviceScaleFactor: 2 },
]

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const results = []

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor ?? 1,
    isMobile: vp.isMobile ?? false,
    userAgent: vp.isMobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  })
  const page = await ctx.newPage()

  // Ignoriere bestimmte known-noise console errors (mapbox 3D layer etc.)
  page.on('pageerror', err => {
    results.push({ route: page.url(), viewport: vp.name, type: 'pageerror', msg: err.message })
  })

  for (const r of ROUTES) {
    const url = BASE + r.path
    const file = join(OUT, `${r.name}-${vp.name}.png`)
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 })
      const status = resp ? resp.status() : 0
      await page.waitForTimeout(500)
      await page.screenshot({ path: file, fullPage: true })
      results.push({ route: r.path, viewport: vp.name, status, file })
      console.log(`OK   ${vp.name.padEnd(7)} ${String(status).padEnd(3)} ${r.path}`)
    } catch (err) {
      results.push({ route: r.path, viewport: vp.name, error: err.message })
      console.log(`FAIL ${vp.name.padEnd(7)} ERR ${r.path} :: ${err.message.split('\n')[0]}`)
    }
  }
  await ctx.close()
}

await browser.close()

console.log('\n--- Summary ---')
const errs = results.filter(r => r.error || r.type === 'pageerror' || (r.status && r.status >= 400))
console.log(`Total: ${results.length}, OK: ${results.length - errs.length}, ERR: ${errs.length}`)
if (errs.length) {
  console.log('\nIssues:')
  for (const e of errs) console.log(`  ${e.viewport ?? '-'} ${e.route} :: ${e.error ?? e.msg ?? `HTTP ${e.status}`}`)
}
