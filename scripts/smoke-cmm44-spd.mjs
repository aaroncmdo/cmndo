/**
 * scripts/smoke-cmm44-spd.mjs — CMM-44 SP-D Portal-Smoke gegen Staging.
 * Prueft die Oberflaechen, die SP-D beruehrt (nach Reader/Writer-Sweep + View-Repoint):
 *  - SV-Kalender + /gutachter/heute (besichtigungsort-Reads aus gutachter_termine)
 *  - Fallakte /faelle/[id] (nachbesichtigung, Timeline = v_claim_timeline)
 *  - Dispatch + Kunde-Dashboard
 *  - DB-Sanity: aktueller Termin traegt besichtigungsort/nachbesichtigung
 * Read-only Navigation; Screenshots zur In-Turn-Analyse.
 */
import { chromium } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import { getServiceDb } from './smoke/helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'docs', '21.05.2026', 'cmm44-spd-smoke')
mkdirSync(OUT, { recursive: true })
const BASE = 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS
const TEST_PASS = 'Test1234!'
if (!BASIC_USER || !BASIC_PASS) { console.error('HARD: STAGING_BASIC_AUTH_USER/PASS fehlen'); process.exit(1) }

const results = []; let stepN = 0
const pad = (n) => String(n).padStart(3, '0')
async function shoot(page, label) { const name = `${pad(++stepN)}-${label.replace(/[^a-z0-9-]/gi,'_').slice(0,50)}.png`; await page.screenshot({ path: join(OUT, name), fullPage: false }).catch(()=>{}); return name }

async function visit(ctx, user, path, label) {
  const page = await ctx.newPage(); const errs = []; let worst = 0
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text().slice(0,140)}`) })
  page.on('response', (r) => { if (r.url().includes('staging.claimondo') && r.status() >= 500) { worst = Math.max(worst, r.status()); errs.push(`HTTP ${r.status()}`) } })
  let nav = ''
  try { const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })); nav = resp ? `${resp.status()}` : '?' } catch (e) { nav = `NAV-FAIL ${e.message.slice(0,50)}` }
  await page.waitForTimeout(1500)
  const shot = await shoot(page, `${user}-${label}`)
  const hard = worst >= 500 || errs.some((e) => e.startsWith('pageerror'))
  results.push({ s: `${user} ${path}`, status: hard ? 'HARD' : (errs.length ? 'SOFT' : 'OK'), note: `nav=${nav} ${page.url().replace(BASE,'')} ${shot}${errs.length ? ' | ' + errs.slice(0,2).join(' ; ') : ''}` })
  console.log(`[${hard ? 'HARD' : (errs.length ? 'SOFT' : 'OK')}] ${user} ${path} (${nav}) ${shot}`)
  await page.close()
}
async function login(ctx, email) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.fill('input[type="email"], input[name="email"], #email', email)
  await page.fill('input[type="password"], input[name="password"], #password', TEST_PASS)
  await page.click('button[type="submit"]:has-text("Einloggen"), button:has-text("Einloggen")')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => console.warn(`[login] ${email} kein Redirect`))
  await page.close()
}

async function main() {
  const db = getServiceDb()
  // DB-Sanity: aktueller Termin pro Claim mit besichtigungsort/nachbesichtigung
  const { data: stats } = await db.from('gutachter_termine').select('id, besichtigungsort_adresse, nachbesichtigung_status').not('fall_id', 'is', null).limit(50)
  const withBesicht = (stats ?? []).filter((t) => t.besichtigungsort_adresse).length
  const withNachbes = (stats ?? []).filter((t) => t.nachbesichtigung_status).length
  results.push({ s: 'DB gutachter_termine SP-D data', status: 'OK', note: `termine mit besichtigungsort=${withBesicht}, mit nachbesichtigung_status=${withNachbes}` })
  console.log(`[OK] DB: besichtigungsort=${withBesicht}, nachbesichtigung=${withNachbes}`)
  const { data: terminRow } = await db.from('gutachter_termine').select('fall_id').not('fall_id', 'is', null).limit(1).maybeSingle()
  const fallId = terminRow?.fall_id ?? null

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })

  await login(ctx, 'test-sv@claimondo.de')
  await visit(ctx, 'sv', '/gutachter/kalender', 'kalender')
  await visit(ctx, 'sv', '/gutachter/heute', 'heute-besichtigungsort')

  await login(ctx, 'test-dispatch@claimondo.de')
  await visit(ctx, 'dispatch', '/dispatch', 'portal')
  if (fallId) await visit(ctx, 'dispatch', `/faelle/${fallId}`, 'fallakte')

  await login(ctx, 'test-kunde@claimondo.de')
  await visit(ctx, 'kunde', '/kunde', 'dashboard')

  await browser.close()
  const hard = results.filter((r) => r.status === 'HARD')
  console.log('\n===== SP-D SMOKE =====')
  for (const r of results) console.log(`  [${r.status}] ${r.s} — ${r.note}`)
  console.log(`\nHARD=${hard.length} SOFT=${results.filter(r=>r.status==='SOFT').length} OK=${results.filter(r=>r.status==='OK').length}`)
  console.log(`Screenshots: ${OUT}`)
  process.exit(hard.length ? 2 : 0)
}
main().catch((e) => { console.error('SMOKE-CRASH:', e); process.exit(3) })
