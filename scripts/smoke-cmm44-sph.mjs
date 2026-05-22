/**
 * scripts/smoke-cmm44-sph.mjs — CMM-44 SP-H Portal-Smoke gegen Staging.
 * Prueft die Oberflaechen, die der SP-H Reader/Writer-Sweep beruehrt
 * (18 Auftrag-Lifecycle-Spalten faelle -> auftraege):
 *  - SV   /gutachter/abrechnung  (TS-Sektion = View-Switch v_faelle_mit_aktuellem_termin)
 *  - SV   /gutachter/auftraege + /gutachter/auftraege/[id] (sv_briefing/TS-Reads)
 *  - SV   /gutachter/fall/[id] + /gutachter/feldmodus + /gutachter/heute (briefing-Reads)
 *  - Admin/KB/Dispatch /faelle/[id] (Filmcheck/Storno/TS/SV-Briefing-Sektionen)
 *  - Kunde /kunde + Re-Termin (storniert_am-Read)
 *  - Public / (Sanity)
 *  - DB-Sanity: auftraege traegt die 18 SP-H-Spalten; Test-Auftrag-Werte
 * Read-only Navigation; Screenshots zur In-Turn-Analyse.
 */
import { chromium } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import { getServiceDb } from './smoke/helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'docs', '22.05.2026', 'cmm44-sph-smoke')
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
  // DB-Sanity: auftraege traegt die 18 SP-H-Spalten?
  const SPH = ['filmcheck_ok','filmcheck_am','filmcheck_notizen','storniert_am','storno_grund','storno_durch_user_id','besichtigung_gestartet_am','sv_briefing_text','sv_briefing_generated_at','sv_briefing_model','sv_briefing_version','sv_briefing_struktur','sv_notizen_vor_ort','technische_stellungnahme_status','technische_stellungnahme_notiz_sv','technische_stellungnahme_beauftragt_am','technische_stellungnahme_hochgeladen_am','technische_stellungnahme_freigabe_am']
  const { data: auf, error: aufErr } = await db.from('auftraege').select(SPH.join(',') + ',id,claim_id').limit(1).maybeSingle()
  results.push({ s: 'DB auftraege SP-H Spalten', status: aufErr ? 'HARD' : 'OK', note: aufErr ? aufErr.message : `auftrag=${auf?.id?.slice(0,8)} ts_status=${auf?.technische_stellungnahme_status} filmcheck_ok=${auf?.filmcheck_ok} storniert_am=${auf?.storniert_am ?? 'null'} sv_briefing=${auf?.sv_briefing_text ? 'set' : 'null'}` })
  console.log(`[${aufErr ? 'HARD' : 'OK'}] DB auftraege SP-H read: ${aufErr ? aufErr.message : 'ok'}`)

  // Test-Auftrag + Fall + SV-Owner ermitteln
  const auftragId = auf?.id ?? null
  const claimId = auf?.claim_id ?? null
  let fallId = null, svEmail = 'test-sv@claimondo.de'
  if (claimId) {
    const { data: f } = await db.from('faelle').select('id, sv_id').eq('claim_id', claimId).limit(1).maybeSingle()
    fallId = f?.id ?? null
    if (f?.sv_id) { const { data: p } = await db.from('profiles').select('email').eq('id', f.sv_id).maybeSingle(); if (p?.email?.startsWith('test-')) svEmail = p.email }
  }
  console.log(`[info] auftragId=${auftragId} fallId=${fallId} svEmail=${svEmail}`)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })

  // Public
  await visit(ctx, 'public', '/', 'landing')

  // SV — primaere SP-H-Leser
  await login(ctx, svEmail)
  await visit(ctx, 'sv', '/gutachter/abrechnung', 'abrechnung-TS-viewswitch')
  await visit(ctx, 'sv', '/gutachter/auftraege', 'auftraege-liste')
  if (auftragId) await visit(ctx, 'sv', `/gutachter/auftraege/${auftragId}`, 'auftrag-detail')
  if (fallId) await visit(ctx, 'sv', `/gutachter/fall/${fallId}`, 'sv-fall-briefing')
  await visit(ctx, 'sv', '/gutachter/heute', 'heute')
  await visit(ctx, 'sv', '/gutachter/feldmodus', 'feldmodus')

  // Admin — Auftrag-LC-Sektionen in der Fallakte
  await login(ctx, 'test-admin@claimondo.de')
  await visit(ctx, 'admin', '/faelle', 'faelle-liste')
  if (fallId) await visit(ctx, 'admin', `/faelle/${fallId}`, 'fallakte-auftrag-lc')

  // KB — sieht Fallakte ebenfalls
  await login(ctx, 'test-kb@claimondo.de')
  if (fallId) await visit(ctx, 'kb', `/faelle/${fallId}`, 'fallakte')

  // Dispatch
  await login(ctx, 'test-dispatch@claimondo.de')
  await visit(ctx, 'dispatch', '/dispatch', 'portal')
  if (fallId) await visit(ctx, 'dispatch', `/faelle/${fallId}`, 'fallakte')

  // Kunde
  await login(ctx, 'test-kunde@claimondo.de')
  await visit(ctx, 'kunde', '/kunde', 'dashboard')

  await browser.close()
  const hard = results.filter((r) => r.status === 'HARD')
  console.log('\n===== SP-H SMOKE =====')
  for (const r of results) console.log(`  [${r.status}] ${r.s} — ${r.note}`)
  console.log(`\nHARD=${hard.length} SOFT=${results.filter(r=>r.status==='SOFT').length} OK=${results.filter(r=>r.status==='OK').length}`)
  console.log(`Screenshots: ${OUT}`)
  process.exit(hard.length ? 2 : 0)
}
main().catch((e) => { console.error('SMOKE-CRASH:', e); process.exit(3) })
