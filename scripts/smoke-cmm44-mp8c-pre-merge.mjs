/**
 * CMM-44 MP-8c Pre-Merge-Smoke gegen Staging.
 * Etabliert die Baseline VOR MP-8c-Merge: zeigt, dass 73/74 Karten in
 * den 3 betroffenen Pages still im erfassung-Fallback hängen
 * (durch claims.id != faelle.id Bug bei v_claim_phase-Lookup).
 *
 * Nach Merge + Deploy denselben Smoke nochmal → Fix verifiziert.
 *
 * Target: https://app.staging.claimondo.de (Basic-Auth)
 * Output: docs/30.05.2026/smoke-mp8c-pre-merge/
 *
 * Pages (alle in MP-8c §2 Spec):
 *   - Admin → /admin/faelle (Kanban, 4 Spalten)
 *   - Admin → /kanzlei/kanban (Kanzlei-Bereich als admin-Cross-Check)
 *   - Admin → /kanzlei/mandate (Mandate-Liste)
 *   - Kanzlei → /kanzlei/kanban (rollen-gated)
 *   - Kanzlei → /kanzlei/mandate (rollen-gated)
 *
 * Bug-Signal: alle Karten in 1 Spalte ('Erfassung') gestapelt = BUG aktiv.
 * Fix-Signal: Karten über mehrere Phasen verteilt = MP-8c live.
 */

import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEnv() {
  const p = join(ROOT, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnv()

const BASE = process.env.SMOKE_STAGING_BASE ?? 'https://app.staging.claimondo.de'
const BA_USER = process.env.STAGING_BASIC_AUTH_USER ?? process.env.SMOKE_BASIC_AUTH_USER ?? 'aaroncmdo'
const BA_PASS = process.env.STAGING_BASIC_AUTH_PASS ?? process.env.SMOKE_BASIC_AUTH_PASS ?? ''
const PW = 'Test1234!'

if (!BA_PASS) {
  console.error('FEHLER: STAGING_BASIC_AUTH_PASS nicht gesetzt (.env.local).')
  process.exit(2)
}

const OUT = join(ROOT, 'docs/30.05.2026/smoke-mp8c-pre-merge')
mkdirSync(OUT, { recursive: true })

const PHASE_LABELS = ['Erfassung', 'Begutachtung', 'Regulierung', 'Abschluss']

const report = []

function rec(o) { report.push(o) }

async function newCtx(browser) {
  return browser.newContext({
    httpCredentials: { username: BA_USER, password: BA_PASS },
    locale: 'de-DE',
    viewport: { width: 1440, height: 960 },
  })
}

function attachListeners(page, bucket) {
  page.on('console', (m) => { if (m.type() === 'error') bucket.console.push(m.text().slice(0, 240)) })
  page.on('pageerror', (e) => { bucket.pageerror.push(String(e.message).slice(0, 240)) })
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(1200)
  await page.fill('input[type="email"], input[name="email"], #email', email)
  await page.fill('input[type="password"], input[name="password"], #password', PW)
  await page.click('button[type="submit"]:has-text("Einloggen"), button:has-text("Einloggen")')
  try {
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 })
    return true
  } catch {
    return false
  }
}

async function shoot(page, label, errs) {
  const file = join(OUT, `${label}.png`)
  await page.waitForTimeout(4000)
  await page.screenshot({ path: file, fullPage: false, timeout: 15000 }).catch((e) => console.warn('shot fail', label, e.message))
  const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
  const found = PHASE_LABELS.filter((l) => text.includes(l))
  // Karten-Verteilung schätzen: zähle wie oft jedes Phase-Label vorkommt
  // (Spalten-Header + Karten-Phase-Anzeige). Wenn Karten verteilt sind,
  // erscheinen alle 4 Labels mehrfach; wenn alle in erfassung hängen, dominiert
  // "Erfassung" + ggf. "vollmacht_offen"-Substate dramatisch.
  const labelCounts = Object.fromEntries(PHASE_LABELS.map((l) => [l, (text.match(new RegExp(`\\b${l}\\b`, 'g')) || []).length]))
  const url = page.url()
  rec({ label, url, phaseLabels: found, labelCounts, console: [...errs.console], pageerror: [...errs.pageerror] })
  console.log(`  [${label}] ${url}`)
  console.log(`     Labels gefunden: ${found.join(', ') || '— KEINE'}`)
  console.log(`     Counts: Erf=${labelCounts.Erfassung} Beg=${labelCounts.Begutachtung} Reg=${labelCounts.Regulierung} Abs=${labelCounts.Abschluss}`)
  if (errs.pageerror.length) console.log(`     ⚠ pageerror: ${errs.pageerror.length}`)
  errs.console.length = 0
  errs.pageerror.length = 0
}

async function visit(page, path, label, errs) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await shoot(page, label, errs)
}

async function main() {
  console.log(`\n=== CMM-44 MP-8c Pre-Merge-Smoke → ${BASE} ===`)
  console.log(`Ziel: dokumentieren dass admin/faelle hub + kanzlei/mandate + kanzlei/kanban`)
  console.log(`im pre-MP-8c-Stand (staging-Tip ${process.env.SMOKE_STAGING_TIP || 'adcec327a'}) die`)
  console.log(`Karten falsch gruppieren (alle in erfassung).\n`)
  const browser = await chromium.launch({ headless: true })

  // ── ADMIN ────────────────────────────────────────────────────────────────────
  try {
    console.log('ADMIN (test-admin@claimondo.de)')
    const ctx = await newCtx(browser)
    const errs = { console: [], pageerror: [] }
    const page = await ctx.newPage()
    attachListeners(page, errs)
    const ok = await login(page, 'test-admin@claimondo.de')
    console.log(`  login: ${ok ? 'ok' : 'FEHLGESCHLAGEN'} (${page.url()})`)
    rec({ label: 'admin-login', ok, url: page.url() })
    if (ok) {
      await visit(page, '/admin/faelle', '01-admin-faelle-kanban', errs)
      await visit(page, '/kanzlei/kanban', '02-admin-in-kanzlei-kanban', errs)
      await visit(page, '/kanzlei/mandate', '03-admin-in-kanzlei-mandate', errs)
    }
    await ctx.close()
  } catch (e) { console.error('ADMIN-Block Fehler:', e.message); rec({ label: 'admin-block-error', error: e.message }) }

  // ── KANZLEI (rollen-gated) ──────────────────────────────────────────────────
  try {
    console.log('\nKANZLEI (test-kanzlei@claimondo.de)')
    const ctx = await newCtx(browser)
    const errs = { console: [], pageerror: [] }
    const page = await ctx.newPage()
    attachListeners(page, errs)
    const ok = await login(page, 'test-kanzlei@claimondo.de')
    console.log(`  login: ${ok ? 'ok' : 'FEHLGESCHLAGEN'} (${page.url()})`)
    rec({ label: 'kanzlei-login', ok, url: page.url() })
    if (ok) {
      await visit(page, '/kanzlei/kanban', '04-kanzlei-kanban', errs)
      await visit(page, '/kanzlei/mandate', '05-kanzlei-mandate', errs)
    }
    await ctx.close()
  } catch (e) { console.error('KANZLEI-Block Fehler:', e.message); rec({ label: 'kanzlei-block-error', error: e.message }) }

  await browser.close()

  // ── Report ──────────────────────────────────────────────────────────────────
  const reportPath = join(OUT, 'report.json')
  writeFileSync(reportPath, JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), report }, null, 2))
  console.log(`\n=== Report: ${reportPath}`)
  console.log(`=== Screenshots: ${OUT}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
