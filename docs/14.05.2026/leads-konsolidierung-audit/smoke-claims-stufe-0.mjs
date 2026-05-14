#!/usr/bin/env node
// Claims-Stufe-0-Smoke: nach Drop claims.geschaedigter_party_id,
// verursacher_party_id, eigene_versicherung, eigene_policennr.
// Auch v_claim_full View wurde recreated.

import { chromium } from 'playwright'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL ?? 'http://localhost:3010'
const OUT = join(__dirname, 'smoke-claims-stufe-0-screenshots')
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const results = []

async function visit(page, path, label, watchFor = []) {
  const r = { label, path, status: 0, err: false, columnErr: false, consoleErrors: [] }
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text()
      if (/column "(geschaedigter_party_id|verursacher_party_id|eigene_versicherung|eigene_policennr)" does not exist|v_claim_full.*does not exist|permission denied/i.test(t)) errors.push(t.slice(0, 200))
    }
  })
  try {
    const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 })
    r.status = resp?.status() ?? 0
    const html = await page.content()
    r.err = /Application Error|Etwas ist schiefgelaufen|500 - Server-side Exception/i.test(html)
    // Spezifisches PG-Error-Pattern: "column .. does not exist" oder permission-denied
    r.columnErr = /column "(geschaedigter_party_id|verursacher_party_id|eigene_versicherung|eigene_policennr)" does not exist|v_claim_full.*does not exist/i.test(html)
    r.consoleErrors = errors.slice(0, 3)
    await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: false })
  } catch (err) {
    r.status = 'CRASH'
    r.consoleErrors.push(String(err).slice(0, 100))
  }
  const ok = (r.status === 200 || r.status === 304) && !r.err && !r.columnErr && r.consoleErrors.length === 0
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(38)} ${String(r.status).padEnd(5)}${r.err ? ' APP-ERR' : ''}${r.columnErr ? ' COLUMN-ERR' : ''}${r.consoleErrors.length ? ' console-err=' + r.consoleErrors.length : ''}`)
  if (r.consoleErrors.length) for (const e of r.consoleErrors) console.log(`    └─ ${e}`)
  return r
}

async function login(page, email, password) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

// PUBLIC
console.log('\n=== PUBLIC ===')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  for (const [p, l] of [
    ['/', '01-home'],
    ['/login', '02-login'],
    ['/schaden-melden/schritt-1', '03-schaden-melden'],
    ['/gutachter-partner', '04-gutachter-partner'],
  ]) results.push(await visit(page, p, l))
  await ctx.close()
}

// ADMIN — incl. /admin/faelle/anlegen (writes schadens_ursache to faelle directly)
console.log('\n=== ADMIN ===')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page, 'test-admin@claimondo.de', 'Test1234!')
  for (const [p, l] of [
    ['/admin', '10-admin-dashboard'],
    ['/admin/faelle', '11-admin-faelle'],
    ['/admin/faelle/anlegen', '12-admin-faelle-anlegen'],
    ['/admin/sachverstaendige', '13-admin-sv'],
    ['/admin/kalender', '14-admin-kalender'],
    ['/admin/finance', '15-admin-finance'],
    ['/admin/team', '16-admin-team'],
    ['/admin/dispatch', '17-admin-dispatch'],
  ]) results.push(await visit(page, p, l))
  // Specifically: open first lead, try to convert to fall (read-path test)
  // Skip fall-detail probe (Sync-Trigger kann networkidle blocken — keine
  // Aussage zur Stufe-0).
  await ctx.close()
}

// KUNDE
console.log('\n=== KUNDE ===')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page, 'test-kunde@claimondo.de', 'Test1234!')
  for (const [p, l] of [
    ['/kunde', '30-kunde-home'],
    ['/kunde/faelle', '31-kunde-faelle'],
    ['/kunde/termine', '32-kunde-termine'],
    ['/kunde/profil', '33-kunde-profil'],
  ]) results.push(await visit(page, p, l))
  await ctx.close()
}

// SV
console.log('\n=== SV ===')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page, 'test-sv@claimondo.de', 'Test1234!')
  for (const [p, l] of [
    ['/gutachter', '40-sv-home'],
    ['/gutachter/heute', '41-sv-heute'],
    ['/gutachter/faelle', '42-sv-faelle'],
    ['/gutachter/kalender', '43-sv-kalender'],
  ]) results.push(await visit(page, p, l))
  await ctx.close()
}

await browser.close()

const ok = results.filter((r) => (r.status === 200 || r.status === 304) && !r.err && !r.columnErr && r.consoleErrors.length === 0).length
const fail = results.length - ok
writeFileSync(join(OUT, '..', 'smoke-claims-stufe-0-result.json'), JSON.stringify(results, null, 2))
console.log(`\n${ok}/${results.length} ok. ${fail} fail. Screenshots: ${OUT}`)
process.exit(fail > 0 ? 1 : 0)
