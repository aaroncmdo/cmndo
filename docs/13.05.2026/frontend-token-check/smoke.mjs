#!/usr/bin/env node
// Frontend Token-Sweep Smoke — Visual Regression-Check für PR #992
//
// Prüft pro Route:
//   1. HTTP 200
//   2. Kein "Application Error" / "500" im Body
//   3. Kein residueller `violet-` / `rose-` / `purple-` / `indigo-` Klassen-Name
//      im HTML (Color-Sweep-Regression-Sentinel)
//   4. Screenshot wird gespeichert für visuelle Inspektion

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL ?? 'http://localhost:3010'
const OUT = join(__dirname, 'smoke-screenshots')

const PUBLIC_ROUTES = [
  { path: '/', label: 'home' },
  { path: '/login', label: 'login' },
  { path: '/gutachter-partner', label: 'gutachter-partner' },
  { path: '/passwort-vergessen', label: 'passwort-vergessen' },
  { path: '/datenschutz', label: 'datenschutz' },
  { path: '/dev/phases', label: 'dev-phases' }, // PhaseStep blocked-State (rose→red)
]

const FORBIDDEN_CLASS_PATTERNS = [
  /class="[^"]*\bviolet-\d/,
  /class="[^"]*\bpurple-\d/,
  /class="[^"]*\brose-\d/,
  /class="[^"]*\bindigo-\d/,
]

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

let pass = 0
let fail = 0
const results = []

for (const { path, label } of PUBLIC_ROUTES) {
  const url = BASE + path
  const r = { label, path, status: null, hasError: false, forbiddenHits: [], screenshot: null }
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    r.status = resp?.status() ?? 0
    const html = await page.content()
    if (/Application Error|Internal Server Error|500 - Server-side Exception/i.test(html)) {
      r.hasError = true
    }
    for (const re of FORBIDDEN_CLASS_PATTERNS) {
      const m = html.match(re)
      if (m) r.forbiddenHits.push(m[0].slice(0, 100))
    }
    const sp = join(OUT, `${label}.png`)
    await page.screenshot({ path: sp, fullPage: false })
    r.screenshot = sp
  } catch (err) {
    r.status = 'CRASH'
    r.error = String(err)
  }

  const ok = r.status === 200 && !r.hasError && r.forbiddenHits.length === 0
  if (ok) pass++
  else fail++
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(20)} ${String(r.status).padEnd(5)} forbidden=${r.forbiddenHits.length}${r.hasError ? ' ERROR' : ''}`)
  if (r.forbiddenHits.length) {
    for (const h of r.forbiddenHits) console.log(`    └─ ${h}`)
  }
  results.push(r)
}

await browser.close()

writeFileSync(join(OUT, '..', 'smoke-result.json'), JSON.stringify({ pass, fail, results }, null, 2))
console.log(`\n${pass} pass, ${fail} fail. Screenshots in ${OUT}`)
process.exit(fail > 0 ? 1 : 0)
