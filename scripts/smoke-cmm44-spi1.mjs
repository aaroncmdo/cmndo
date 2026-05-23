/**
 * scripts/smoke-cmm44-spi1.mjs — CMM-44 SP-I1 Portal-Smoke gegen Staging.
 * SP-I1 verschiebt 4 dormante LexDrive/Klage-Spalten faelle -> kanzlei_faelle
 * und repointet v_faelle_mit_aktuellem_termin. Einziger App-Leser:
 * SV /gutachter/fall/[id] (lexdrive_case_id ueber die View -> Pattern E).
 * Prueft:
 *  - DB: kanzlei_faelle traegt die 4 SP-I1-Spalten (Schema)
 *  - DB: v_faelle_mit_aktuellem_termin liefert die 4 Spalten zur Laufzeit (PostgREST)
 *  - SV   /gutachter/fall/[id] + /gutachter/faelle (lexdrive_case_id-Read via View)
 *  - Admin /faelle + /faelle/[id] (Fallakte rendert ueber die repointete View)
 *  - Kunde /kunde + Public / (Sanity)
 * Read-only Navigation; Screenshots zur In-Turn-Analyse.
 */
import { chromium } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import { getServiceDb } from './smoke/helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'docs', '23.05.2026', 'cmm44-spi1-smoke')
mkdirSync(OUT, { recursive: true })
const BASE = 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS
const TEST_PASS = 'Test1234!'
if (!BASIC_USER || !BASIC_PASS) { console.error('HARD: STAGING_BASIC_AUTH_USER/PASS fehlen'); process.exit(1) }

const SPI1 = ['lexdrive_case_id', 'lexdrive_ocr_data', 'lexdrive_ocr_received_at', 'klage_uebergeben_am']
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

  // DB-Sanity 1: kanzlei_faelle traegt die 4 SP-I1-Spalten? (0 Rows ok — Fehler nur wenn Spalte fehlt)
  const { error: kfErr } = await db.from('kanzlei_faelle').select(SPI1.join(',') + ',id,claim_id,fall_id').limit(1)
  results.push({ s: 'DB kanzlei_faelle SP-I1 Spalten', status: kfErr ? 'HARD' : 'OK', note: kfErr ? kfErr.message : 'alle 4 Spalten selektierbar (Schema ok)' })
  console.log(`[${kfErr ? 'HARD' : 'OK'}] DB kanzlei_faelle SP-I1 read: ${kfErr ? kfErr.message : 'ok'}`)

  // DB-Sanity 2: liefert die repointete View die 4 Spalten zur Laufzeit (PostgREST)?
  const { data: vrow, error: vErr } = await db.from('v_faelle_mit_aktuellem_termin').select('id,' + SPI1.join(',') + ',mandatsnummer').limit(1).maybeSingle()
  results.push({ s: 'DB view SP-I1 Spalten', status: vErr ? 'HARD' : 'OK', note: vErr ? vErr.message : `view ok; lexdrive_case_id=${vrow?.lexdrive_case_id ?? 'null'} klage=${vrow?.klage_uebergeben_am ?? 'null'} mandatsnummer=${vrow?.mandatsnummer ?? 'null'}` })
  console.log(`[${vErr ? 'HARD' : 'OK'}] DB view read: ${vErr ? vErr.message : 'ok'}`)

  // SV + von ihm besessenen Fall ermitteln (RLS: SV sieht nur eigene Faelle)
  let svEmail = 'test-sv@claimondo.de', svFallId = null, anyFallId = null
  const { data: svp } = await db.from('profiles').select('id,email').eq('rolle', 'sachverstaendiger').like('email', 'test-%').limit(1).maybeSingle()
  if (svp?.email) svEmail = svp.email
  if (svp?.id) { const { data: f } = await db.from('faelle').select('id').eq('sv_id', svp.id).limit(1).maybeSingle(); svFallId = f?.id ?? null }
  const { data: af } = await db.from('faelle').select('id').limit(1).maybeSingle(); anyFallId = af?.id ?? null
  console.log(`[info] svEmail=${svEmail} svFallId=${svFallId} anyFallId=${anyFallId}`)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })

  // Public Sanity
  await visit(ctx, 'public', '/', 'landing')

  // SV — primaerer SP-I1-Leser (lexdrive_case_id via View)
  await login(ctx, svEmail)
  await visit(ctx, 'sv', '/gutachter/faelle', 'sv-faelle-liste')
  if (svFallId) await visit(ctx, 'sv', `/gutachter/fall/${svFallId}`, 'sv-fall-lexdrive-read')
  else console.warn('[info] kein test-sv-eigener Fall — SV-Fallseite uebersprungen')

  // Admin — Fallakte rendert ueber die repointete View
  await login(ctx, 'test-admin@claimondo.de')
  await visit(ctx, 'admin', '/faelle', 'faelle-liste')
  if (anyFallId) await visit(ctx, 'admin', `/faelle/${anyFallId}`, 'fallakte')

  // Kunde Sanity
  await login(ctx, 'test-kunde@claimondo.de')
  await visit(ctx, 'kunde', '/kunde', 'dashboard')

  await browser.close()
  const hard = results.filter((r) => r.status === 'HARD')
  console.log('\n===== SP-I1 SMOKE =====')
  for (const r of results) console.log(`  [${r.status}] ${r.s} — ${r.note}`)
  console.log(`\nHARD=${hard.length} SOFT=${results.filter(r => r.status === 'SOFT').length} OK=${results.filter(r => r.status === 'OK').length}`)
  console.log(`Screenshots: ${OUT}`)
  process.exit(hard.length ? 2 : 0)
}
main().catch((e) => { console.error('SMOKE-CRASH:', e); process.exit(3) })
