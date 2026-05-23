/**
 * scripts/smoke-cmm44-spi3.mjs — CMM-44 SP-I3 PR2 Portal-Smoke gegen Staging.
 * Prueft die vom Reader/Writer-Sweep beruehrten Oberflaechen (Regulierung/VS ->
 * kanzlei_faelle): Admin /faelle + Fallakte (VS-Reaktion/Regulierung-Section),
 * Admin /admin/finance + /admin/statistiken (regulierung_am-Aggregation via
 * v_faelle_mit_aktuellem_termin / v_claim_full), SV /gutachter/fall/[id]
 * (+ stellungnahme, vs_kuerzung_grund/kuerzungs_betrag aus kanzlei_faelle),
 * Kunde /kunde + /kunde/faelle (regulierung_am Listenview=null/Detail=kf),
 * Public / (Sanity). cov=0 fuer 13 Spalten -> Fokus = keine HARD-Crashes durch
 * die View-/Embed-Repoints. Read-only Navigation; Screenshots zur In-Turn-Analyse.
 */
import { chromium } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import { getServiceDb } from './smoke/helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'docs', '23.05.2026', 'cmm44-spi3-smoke')
mkdirSync(OUT, { recursive: true })
const BASE = 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS
const TEST_PASS = 'Test1234!'
if (!BASIC_USER || !BASIC_PASS) { console.error('HARD: STAGING_BASIC_AUTH_USER/PASS fehlen'); process.exit(1) }

const SPI3 = ['regulierung_am','regulierung_angekuendigt_am','vs_eskalationsstufe','regulierungsweise','vs_reaktion_typ','vs_reaktion_am','kuerzungs_betrag','vs_frist_bis','vs_kuerzung_grund','vs_quote_prozent','vs_quote_grund','vs_quote_akzeptiert_am','vs_quote_betrag_ausgezahlt','vs_kuerzungs_typ']
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
  // DB-Sanity: kanzlei_faelle traegt die 14 SP-I3-Spalten (additiv) + vs_eskalationsstufe-Default.
  const { data: kf, error: kfErr } = await db.from('kanzlei_faelle').select(SPI3.join(',') + ',claim_id,fall_id').limit(1).maybeSingle()
  results.push({ s: 'DB kanzlei_faelle SP-I3 (14 Spalten)', status: kfErr ? 'HARD' : 'OK', note: kfErr ? kfErr.message : `vs_eskalationsstufe=${kf?.vs_eskalationsstufe ?? 'null'} regulierung_am=${kf?.regulierung_am ?? 'null'}` })
  console.log(`[${kfErr ? 'HARD' : 'OK'}] DB kanzlei_faelle read: ${kfErr ? kfErr.message : 'ok'}`)
  // View-Sanity: alle 4 repointeten Views selektierbar (regulierung_am/vs_* aus kf).
  for (const v of ['v_faelle_mit_aktuellem_termin', 'faelle_kunde_view', 'faelle_sv_view', 'v_claim_full']) {
    const { error: vErr } = await db.from(v).select('id').limit(1)
    results.push({ s: `DB view ${v}`, status: vErr ? 'HARD' : 'OK', note: vErr ? vErr.message : 'selektierbar' })
    console.log(`[${vErr ? 'HARD' : 'OK'}] DB view ${v}: ${vErr ? vErr.message : 'ok'}`)
  }

  // SV-eigener Fall fuer /gutachter/fall + stellungnahme.
  let svEmail = 'test-sv@claimondo.de', svFallId = null
  const { data: svp } = await db.from('profiles').select('id,email').eq('rolle', 'sachverstaendiger').like('email', 'test-%').limit(1).maybeSingle()
  if (svp?.email) svEmail = svp.email
  if (svp?.id) { const { data: f } = await db.from('faelle').select('id').eq('sv_id', svp.id).limit(1).maybeSingle(); svFallId = f?.id ?? null }
  const { data: anyFall } = await db.from('faelle').select('id').limit(1).maybeSingle()
  const fallId = anyFall?.id ?? null
  console.log(`[info] svEmail=${svEmail} svFallId=${svFallId} fallId=${fallId}`)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })

  await visit(ctx, 'public', '/', 'landing')

  // Admin — Fallakte (VS-Reaktion/Regulierung-Section) + Finance + Statistiken (regulierung_am-Aggregation)
  await login(ctx, 'test-admin@claimondo.de')
  await visit(ctx, 'admin', '/faelle', 'faelle-hub')
  if (fallId) await visit(ctx, 'admin', `/faelle/${fallId}`, 'fallakte-vs-section')
  await visit(ctx, 'admin', '/admin/finance', 'finance-regulierung-aggregation')
  await visit(ctx, 'admin', '/admin/statistiken', 'statistiken-regulierung')

  // SV — Fallakte + Stellungnahme (vs_kuerzung_grund/kuerzungs_betrag aus kanzlei_faelle)
  await login(ctx, svEmail)
  if (svFallId) {
    await visit(ctx, 'sv', `/gutachter/fall/${svFallId}`, 'sv-fall')
    await visit(ctx, 'sv', `/gutachter/fall/${svFallId}/stellungnahme`, 'sv-stellungnahme-kuerzung')
  }

  // Kunde — Dashboard + Fall-Liste (regulierung_am Listenview=null / Detail=kf)
  await login(ctx, 'test-kunde@claimondo.de')
  await visit(ctx, 'kunde', '/kunde', 'kunde-dashboard')
  await visit(ctx, 'kunde', '/kunde/faelle', 'kunde-faelle-liste')

  await browser.close()
  const hard = results.filter((r) => r.status === 'HARD')
  console.log('\n===== SP-I3 PR2 SMOKE =====')
  for (const r of results) console.log(`  [${r.status}] ${r.s} — ${r.note}`)
  console.log(`\nHARD=${hard.length} SOFT=${results.filter(r => r.status === 'SOFT').length} OK=${results.filter(r => r.status === 'OK').length}`)
  console.log(`Screenshots: ${OUT}`)
  process.exit(hard.length ? 2 : 0)
}
main().catch((e) => { console.error('SMOKE-CRASH:', e); process.exit(3) })
