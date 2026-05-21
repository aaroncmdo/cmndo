/**
 * scripts/smoke-cmm44-spg2.mjs — CMM-44 SP-G2 Termin-Pfad-Smoke gegen Staging.
 *
 * Prueft die Oberflaechen, die SP-G2 beruehrt:
 *  - Termin-Anzeige (PR1-Writer fuellen claim_id): SV-Kalender, Kunde-Termine
 *  - View-Consumer (PR2 re-keyt diese Views): Admin/Dispatch + Fallakte-Timeline
 *    (v_faelle_mit_aktuellem_termin + v_claim_timeline)
 *  - DB-Invariante: gutachter_termine.claim_id gesetzt wenn fall_id gesetzt (0 Verstoesse)
 *
 * Read-only (keine Buchung) — als PRE-MERGE-BASELINE und Re-Run-Harness fuer
 * nach dem staging-Merge (dann zusaetzlich der Buchungs-Write-Flow).
 *
 * Run:
 *   node scripts/smoke-cmm44-spg2.mjs
 * (liest STAGING_BASIC_AUTH_USER/PASS + SUPABASE_SERVICE_ROLE_KEY aus .env.local)
 */
import { chromium } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import { getServiceDb } from './smoke/helpers.mjs' // import triggert ladeEnv()

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'docs', '21.05.2026', 'cmm44-spg2-smoke-pr1-baseline')
mkdirSync(OUT, { recursive: true })

const BASE = 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS
const TEST_PASS = 'Test1234!'

if (!BASIC_USER || !BASIC_PASS) {
  console.error('HARD: STAGING_BASIC_AUTH_USER/PASS fehlen (.env.local).')
  process.exit(1)
}

const results = [] // { surface, status, note }
let stepN = 0
const pad = (n) => String(n).padStart(3, '0')

async function shoot(page, label) {
  const name = `${pad(++stepN)}-${label.replace(/[^a-z0-9-]/gi, '_').slice(0, 50)}.png`
  await page.screenshot({ path: join(OUT, name), fullPage: false }).catch(() => {})
  return name
}

/** Navigiert + sammelt 5xx / pageerror / Konsolen-Fehler. */
async function visit(context, user, path, label) {
  const page = await context.newPage()
  const errs = []
  let worst = 0
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console.error: ${m.text().slice(0, 160)}`) })
  page.on('response', (r) => { if (r.url().includes('staging.claimondo') && r.status() >= 500) { worst = Math.max(worst, r.status()); errs.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`) } })

  let nav = ''
  try {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () =>
      page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 }))
    nav = resp ? `${resp.status()}` : '?'
  } catch (e) {
    nav = `NAV-FAIL ${e.message.slice(0, 60)}`
  }
  await page.waitForTimeout(1500)
  const finalUrl = page.url().replace(BASE, '')
  const shot = await shoot(page, `${user}-${label}`)
  const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 0) // not needed

  const hard = worst >= 500 || errs.some((e) => e.startsWith('pageerror'))
  const status = hard ? 'HARD' : (errs.length ? 'SOFT' : 'OK')
  results.push({ surface: `${user} ${path}`, status, note: `nav=${nav} final=${finalUrl} shot=${shot}${errs.length ? ' | ' + errs.slice(0, 3).join(' ; ') : ''}` })
  console.log(`[${status}] ${user} ${path} -> ${finalUrl} (nav ${nav}) ${shot}`)
  await page.close()
}

async function login(context, email) {
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.fill('input[type="email"], input[name="email"], #email', email)
  await page.fill('input[type="password"], input[name="password"], #password', TEST_PASS)
  await page.click('button[type="submit"]:has-text("Einloggen"), button:has-text("Einloggen")')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() =>
    console.warn(`[login] ${email}: kein Redirect`))
  await shoot(page, `login-${email.split('@')[0]}`)
  await page.close()
}

async function main() {
  // --- Preflight: DB-Invariante + ein Fall mit Termin -------------------
  const db = getServiceDb()
  const { data: viol } = await db.from('gutachter_termine').select('id').not('fall_id', 'is', null).is('claim_id', null)
  const violations = viol?.length ?? 0
  results.push({ surface: 'DB invariant', status: violations === 0 ? 'OK' : 'HARD', note: `gutachter_termine fall_id set & claim_id null = ${violations} (muss 0)` })
  console.log(`[${violations === 0 ? 'OK' : 'HARD'}] DB invariant: ${violations} Verstoesse`)

  const { data: terminRow } = await db.from('gutachter_termine').select('id, fall_id, claim_id').not('fall_id', 'is', null).limit(1).maybeSingle()
  const fallId = terminRow?.fall_id ?? null
  console.log(`[info] Beispiel-Termin fall_id=${fallId} claim_id=${terminRow?.claim_id ?? 'null'}`)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })

  // SV-Portal — Termin-Anzeige (get-sv-tagesplan)
  await login(ctx, 'test-sv@claimondo.de')
  await visit(ctx, 'sv', '/gutachter/kalender', 'kalender')
  await visit(ctx, 'sv', '/gutachter', 'dashboard')

  // Dispatch — Portal + Fallakte-Timeline (v_claim_timeline) wenn Fall vorhanden
  await login(ctx, 'test-dispatch@claimondo.de')
  await visit(ctx, 'dispatch', '/dispatch', 'portal')
  if (fallId) await visit(ctx, 'dispatch', `/faelle/${fallId}`, 'fallakte-timeline')

  // Kunde — Termin-Anzeige
  await login(ctx, 'test-kunde@claimondo.de')
  await visit(ctx, 'kunde', '/kunde', 'dashboard')

  await browser.close()

  // --- Bericht ----------------------------------------------------------
  const hard = results.filter((r) => r.status === 'HARD')
  const soft = results.filter((r) => r.status === 'SOFT')
  console.log('\n===== SP-G2 SMOKE BASELINE =====')
  for (const r of results) console.log(`  [${r.status}] ${r.surface} — ${r.note}`)
  console.log(`\nHARD=${hard.length} SOFT=${soft.length} OK=${results.length - hard.length - soft.length}`)
  console.log(`Screenshots: ${OUT}`)
  process.exit(hard.length ? 2 : 0)
}

main().catch((e) => { console.error('SMOKE-CRASH:', e); process.exit(3) })
