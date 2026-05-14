#!/usr/bin/env node
// Vollständiger Visual-Walkthrough nach /kunde/faelle Fix (PR #1046).
// Geht durch Public + Admin + Kunde + SV-Portale, hit auch Detail-Pages
// soweit Test-User Sichtbarkeit hat.

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL ?? 'http://localhost:3010'
const OUT = join(__dirname, 'full-screenshots')
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const FORBIDDEN = [/\bviolet-\d/, /\bpurple-\d/, /\brose-\d/, /\bindigo-\d/]

const PUBLIC_ROUTES = [
  ['/', '01-home'],
  ['/faq', '02-faq'],
  ['/vorteile', '03-vorteile'],
  ['/wie-es-funktioniert', '04-wie-es-funktioniert'],
  ['/ueber-uns', '05-ueber-uns'],
  ['/gutachter-partner', '06-gutachter-partner'],
  ['/gutachter-finden', '07-gutachter-finden'],
  ['/datenschutz', '08-datenschutz'],
  ['/impressum', '09-impressum'],
  ['/login', '10-login'],
  ['/schaden-melden', '11-schaden-melden'],
  ['/schaden-melden/schritt-1', '12-schaden-melden-schritt-1'],
]

const ADMIN_ROUTES = [
  ['/admin', '20-admin-dashboard'],
  ['/admin/dispatch', '21-admin-dispatch'],
  ['/admin/faelle', '22-admin-faelle'],
  ['/admin/sachverstaendige', '23-admin-sv'],
  ['/admin/sachverstaendige/anlegen', '23b-admin-sv-anlegen'],
  ['/admin/kalender', '24-admin-kalender'],
  ['/admin/aufgaben', '25-admin-aufgaben'],
  ['/admin/finance', '26-admin-finance'],
  ['/admin/abrechnungen', '27-admin-abrechnungen'],
  ['/admin/partner', '28-admin-partner'],
  ['/admin/team', '29-admin-team'],
  ['/admin/team/leaderboard', '29b-admin-team-leaderboard'],
  ['/admin/team/incentives', '29c-admin-team-incentives'],
  ['/admin/einstellungen', '30-admin-einstellungen'],
  ['/admin/einstellungen/vertraege', '30b-admin-vertraege'],
  ['/admin/organisationen', '31-admin-organisationen'],
  ['/admin/communities', '32-admin-communities'],
  ['/admin/statistiken', '33-admin-statistiken'],
  ['/admin/versicherungen', '34-admin-versicherungen'],
  ['/admin/sla', '35-admin-sla'],
  ['/admin/partner/waitlist', '36-admin-waitlist'],
  ['/admin/nachrichten', '37-admin-nachrichten'],
]

const KUNDE_ROUTES = [
  ['/kunde', '40-kunde-home'],
  ['/kunde/faelle', '41-kunde-faelle'],
  ['/kunde/termine', '42-kunde-termine'],
  ['/kunde/profil', '43-kunde-profil'],
]

const SV_ROUTES = [
  ['/gutachter', '50-sv-home'],
  ['/gutachter/heute', '51-sv-heute'],
  ['/gutachter/faelle', '52-sv-faelle'],
  ['/gutachter/gebiet', '53-sv-gebiet'],
  ['/gutachter/kalender', '54-sv-kalender'],
  ['/gutachter/abrechnung', '55-sv-abrechnung'],
  ['/gutachter/statistiken', '56-sv-statistiken'],
  ['/gutachter/nachrichten', '57-sv-nachrichten'],
  ['/gutachter/einstellungen', '58-sv-einstellungen'],
]

async function login(page, email, password) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

async function checkPage(page, label, expected = [200, 304, 307, 308]) {
  const r = { label, status: null, hasError: false, forbiddenHits: [], note: '' }
  try {
    const resp = await page.goto(page.url(), { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => null)
    r.status = resp?.status() ?? 0
    const html = await page.content()
    if (/Application Error|Internal Server Error|500 - Server-side Exception|Etwas ist schiefgelaufen/i.test(html)) {
      r.hasError = true
    }
    for (const re of FORBIDDEN) {
      const m = html.match(new RegExp(`class="[^"]*${re.source}[^"]*"`))
      if (m) r.forbiddenHits.push(m[0].slice(0, 80))
    }
    await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true })
  } catch (err) {
    r.status = 'CRASH'
    r.note = String(err).slice(0, 100)
  }
  return r
}

async function visit(page, path, label) {
  const r = { label, path, status: null, hasError: false, forbiddenHits: [], note: '' }
  try {
    const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 })
    r.status = resp?.status() ?? 0
    const html = await page.content()
    if (/Application Error|Internal Server Error|500 - Server-side Exception|Etwas ist schiefgelaufen/i.test(html)) {
      r.hasError = true
    }
    for (const re of FORBIDDEN) {
      const m = html.match(new RegExp(`class="[^"]*${re.source}[^"]*"`))
      if (m) r.forbiddenHits.push(m[0].slice(0, 80))
    }
    await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: false })
  } catch (err) {
    r.status = 'CRASH'
    r.note = String(err).slice(0, 100)
  }
  const ok = (r.status === 200 || r.status === 304 || r.status === 307 || r.status === 308) && !r.hasError && r.forbiddenHits.length === 0
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(36)} ${String(r.status).padEnd(5)} ${r.hasError ? 'APP-ERR ' : ''}${r.forbiddenHits.length ? `cls=${r.forbiddenHits.length}` : ''}${r.note ? ` ${r.note}` : ''}`)
  return r
}

const browser = await chromium.launch()
const results = { public: [], admin: [], kunde: [], sv: [] }

// PUBLIC (no auth)
console.log('\n=== PUBLIC ===')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  for (const [path, label] of PUBLIC_ROUTES) results.public.push(await visit(page, path, label))
  await ctx.close()
}

// ADMIN
console.log('\n=== ADMIN ===')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  try {
    await login(page, 'test-admin@claimondo.de', 'Test1234!')
    for (const [path, label] of ADMIN_ROUTES) results.admin.push(await visit(page, path, label))
  } catch (err) {
    console.error('[admin] login failed:', err)
  }
  await ctx.close()
}

// KUNDE
console.log('\n=== KUNDE ===')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  try {
    await login(page, 'test-kunde@claimondo.de', 'Test1234!')
    for (const [path, label] of KUNDE_ROUTES) results.kunde.push(await visit(page, path, label))
  } catch (err) {
    console.error('[kunde] login failed:', err)
  }
  await ctx.close()
}

// SV
console.log('\n=== SV ===')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  try {
    await login(page, 'test-sv@claimondo.de', 'Test1234!')
    for (const [path, label] of SV_ROUTES) results.sv.push(await visit(page, path, label))
  } catch (err) {
    console.error('[sv] login failed:', err)
  }
  await ctx.close()
}

await browser.close()

const flat = [...results.public, ...results.admin, ...results.kunde, ...results.sv]
const ok = flat.filter((r) => (r.status === 200 || r.status === 304 || r.status === 307 || r.status === 308) && !r.hasError && r.forbiddenHits.length === 0).length
const fail = flat.length - ok
writeFileSync(join(OUT, '..', 'full-result.json'), JSON.stringify(results, null, 2))
console.log(`\n${ok}/${flat.length} ok. ${fail} fail. Screenshots: ${OUT}`)
process.exit(fail > 0 ? 1 : 0)
