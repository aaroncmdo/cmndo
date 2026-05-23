/**
 * scripts/smoke-cmm44-spi5.mjs — CMM-44 SP-I5 PR2 Portal-Smoke gegen Staging.
 * 6 Rüge-Spalten (ruege_*) -> kanzlei_faelle (additiv; counter/frist_tage via DB-Default + View-COALESCE).
 * PR2-Sweep: KANZLEI_FAELLE_COLS += 6 (process-event auto), prozess.startRuege + completion-signals +
 * blocker-detection auf kanzlei_faelle-Embed. Fokus: DB-Sanity (6 cols + View) + keine HARD-Crashes
 * auf den Rüge-konsumierenden Oberflaechen (Admin-Fallakte Prozess-Tab/Rüge, Kunde). Read-only.
 */
import { chromium } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import { getServiceDb } from './smoke/helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'docs', '23.05.2026', 'cmm44-spi5-smoke')
mkdirSync(OUT, { recursive: true })
const BASE = 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS
const TEST_PASS = 'Test1234!'
if (!BASIC_USER || !BASIC_PASS) { console.error('HARD: STAGING_BASIC_AUTH_USER/PASS fehlen'); process.exit(1) }

const SPI5 = ['ruege_erhalten_am', 'ruege_grund', 'ruege_gesendet_am', 'ruege_betrag', 'ruege_counter', 'ruege_frist_tage']
const results = []; let stepN = 0
const pad = (n) => String(n).padStart(3, '0')
async function shoot(page, label) { const name = `${pad(++stepN)}-${label.replace(/[^a-z0-9-]/gi, '_').slice(0, 50)}.png`; await page.screenshot({ path: join(OUT, name), fullPage: false }).catch(() => {}); return name }

async function visit(ctx, user, path, label) {
  const page = await ctx.newPage(); const errs = []; let worst = 0
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 140)}`) })
  page.on('response', (r) => { if (r.url().includes('staging.claimondo') && r.status() >= 500) { worst = Math.max(worst, r.status()); errs.push(`HTTP ${r.status()}`) } })
  let nav = ''
  try { const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })); nav = resp ? `${resp.status()}` : '?' } catch (e) { nav = `NAV-FAIL ${e.message.slice(0, 50)}` }
  await page.waitForTimeout(1500)
  const shot = await shoot(page, `${user}-${label}`)
  const hard = worst >= 500 || errs.some((e) => e.startsWith('pageerror'))
  results.push({ s: `${user} ${path}`, status: hard ? 'HARD' : (errs.length ? 'SOFT' : 'OK'), note: `nav=${nav} ${page.url().replace(BASE, '')} ${shot}${errs.length ? ' | ' + errs.slice(0, 2).join(' ; ') : ''}` })
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
  const { error: kfErr } = await db.from('kanzlei_faelle').select(SPI5.join(',') + ',claim_id').limit(1)
  results.push({ s: 'DB kanzlei_faelle SP-I5 (6 Spalten)', status: kfErr ? 'HARD' : 'OK', note: kfErr ? kfErr.message : 'selektierbar' })
  console.log(`[${kfErr ? 'HARD' : 'OK'}] DB kanzlei_faelle read: ${kfErr ? kfErr.message : 'ok'}`)
  const { data: v, error: vErr } = await db.from('v_faelle_mit_aktuellem_termin').select('ruege_counter, ruege_frist_tage, ruege_gesendet_am').limit(1).maybeSingle()
  results.push({ s: 'DB view v_faelle_mit_aktuellem_termin', status: vErr ? 'HARD' : 'OK', note: vErr ? vErr.message : `ruege_counter=${v?.ruege_counter ?? 'null'} ruege_frist_tage=${v?.ruege_frist_tage ?? 'null'} (COALESCE-Defaults)` })
  console.log(`[${vErr ? 'HARD' : 'OK'}] DB view: ${vErr ? vErr.message : 'ok'}`)

  const { data: anyFall } = await db.from('faelle').select('id').limit(1).maybeSingle()
  const fallId = anyFall?.id ?? null

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  await visit(ctx, 'public', '/', 'landing')
  await login(ctx, 'test-admin@claimondo.de')
  await visit(ctx, 'admin', '/faelle', 'faelle-hub')
  if (fallId) await visit(ctx, 'admin', `/faelle/${fallId}`, 'fallakte-ruege')
  await login(ctx, 'test-kunde@claimondo.de')
  await visit(ctx, 'kunde', '/kunde', 'kunde-dashboard')
  await browser.close()

  const hard = results.filter((r) => r.status === 'HARD')
  console.log('\n===== SP-I5 PR2 SMOKE =====')
  for (const r of results) console.log(`  [${r.status}] ${r.s} — ${r.note}`)
  console.log(`\nHARD=${hard.length} SOFT=${results.filter(r => r.status === 'SOFT').length} OK=${results.filter(r => r.status === 'OK').length}`)
  console.log(`Screenshots: ${OUT}`)
  process.exit(hard.length ? 2 : 0)
}
main().catch((e) => { console.error('SMOKE-CRASH:', e); process.exit(3) })
