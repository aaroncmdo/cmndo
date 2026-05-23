/**
 * scripts/smoke-cmm44-spi2.mjs — CMM-44 SP-I2 PR2 Portal-Smoke gegen Staging.
 * Prueft die vom Reader/Writer-Sweep beruehrten Oberflaechen (AS + mandatsnummer
 * -> kanzlei_faelle): admin /faelle (Label claim_nummer + mandatsnummer-Sekundaer),
 * Kanzlei /mandate + /kanban (mandatsnummer-Spalte), Kunde /kunde (Frist-Card +
 * WA-Hinweis), SV /gutachter/fall/[id] (mandatsnummer ab Kanzlei-Phase = Gate),
 * Public / (Sanity). Read-only Navigation; Screenshots zur In-Turn-Analyse.
 */
import { chromium } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import { getServiceDb } from './smoke/helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'docs', '23.05.2026', 'cmm44-spi2-smoke')
mkdirSync(OUT, { recursive: true })
const BASE = 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS
const TEST_PASS = 'Test1234!'
if (!BASIC_USER || !BASIC_PASS) { console.error('HARD: STAGING_BASIC_AUTH_USER/PASS fehlen'); process.exit(1) }

const SPI2 = ['anschlussschreiben_am','anschlussschreiben_url','anschlussschreiben_sendedatum','anschlussschreiben_unterschrift','anschlussschreiben_ocr_am','as_geforderte_summe','as_frist','as_vs_reaktion_text','as_salesforce_id','as_zuletzt_synced_am','mandatsnummer']
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
  // DB-Sanity: kanzlei_faelle traegt die 11 Spalten + mandatsnummer-Backfill
  const { data: kf, error: kfErr } = await db.from('kanzlei_faelle').select(SPI2.join(',') + ',claim_id,fall_id').not('mandatsnummer', 'is', null).limit(1).maybeSingle()
  results.push({ s: 'DB kanzlei_faelle SP-I2 + mandatsnummer', status: kfErr ? 'HARD' : 'OK', note: kfErr ? kfErr.message : `mandatsnummer=${kf?.mandatsnummer ?? 'null'} anschlussschreiben_am=${kf?.anschlussschreiben_am ?? 'null'}` })
  console.log(`[${kfErr ? 'HARD' : 'OK'}] DB kanzlei_faelle read: ${kfErr ? kfErr.message : 'ok'}`)

  // Kanzlei-Phase-Fall (mandatsnummer) fuer admin-Detail + SV-eigener Fall
  const mandatFallId = kf?.fall_id ?? null
  let svEmail = 'test-sv@claimondo.de', svFallId = null
  const { data: svp } = await db.from('profiles').select('id,email').eq('rolle', 'sachverstaendiger').like('email', 'test-%').limit(1).maybeSingle()
  if (svp?.email) svEmail = svp.email
  if (svp?.id) { const { data: f } = await db.from('faelle').select('id').eq('sv_id', svp.id).limit(1).maybeSingle(); svFallId = f?.id ?? null }
  console.log(`[info] mandatFallId=${mandatFallId} svEmail=${svEmail} svFallId=${svFallId}`)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })

  await visit(ctx, 'public', '/', 'landing')

  // Admin — faelle-Hub (Label claim_nummer + mandatsnummer-Sekundaer) + Fallakte
  await login(ctx, 'test-admin@claimondo.de')
  await visit(ctx, 'admin', '/faelle', 'faelle-hub-label')
  if (mandatFallId) await visit(ctx, 'admin', `/faelle/${mandatFallId}`, 'fallakte-mandat')

  // Kanzlei — Mandate + Kanban (mandatsnummer-Spalte aus kanzlei_faelle)
  await login(ctx, 'test-kanzlei@claimondo.de')
  await visit(ctx, 'kanzlei', '/kanzlei/mandate', 'kanzlei-mandate-mandatsnr')
  await visit(ctx, 'kanzlei', '/kanzlei/kanban', 'kanzlei-kanban-mandatsnr')

  // SV — Fallakte (mandatsnummer-Block nur ab Kanzlei-Phase = Gate)
  await login(ctx, svEmail)
  if (svFallId) await visit(ctx, 'sv', `/gutachter/fall/${svFallId}`, 'sv-fall-gate')

  // Kunde — Frist-Card + WA-Hinweis
  await login(ctx, 'test-kunde@claimondo.de')
  await visit(ctx, 'kunde', '/kunde', 'kunde-dashboard')

  await browser.close()
  const hard = results.filter((r) => r.status === 'HARD')
  console.log('\n===== SP-I2 PR2 SMOKE =====')
  for (const r of results) console.log(`  [${r.status}] ${r.s} — ${r.note}`)
  console.log(`\nHARD=${hard.length} SOFT=${results.filter(r => r.status === 'SOFT').length} OK=${results.filter(r => r.status === 'OK').length}`)
  console.log(`Screenshots: ${OUT}`)
  process.exit(hard.length ? 2 : 0)
}
main().catch((e) => { console.error('SMOKE-CRASH:', e); process.exit(3) })
