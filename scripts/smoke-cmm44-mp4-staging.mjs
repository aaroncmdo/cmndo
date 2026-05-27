/**
 * CMM-44 MP-4 (Reader-Rewrite) — Staging-Smoke der Phasen-Anzeige.
 * Target: https://app.staging.claimondo.de  (Basic-Auth via httpCredentials)
 *
 * Verifiziert dass alle Portale die Phasen-Anzeige aus dem 4-Phasen-Modell
 * (getClaimLifecycle / v_claim_phase) rendern — NICHT mehr aus der toten
 * 10-Phasen/52-Subphasen-Matrix.
 *
 * Deckt ab (REAL-Daten, kein Seed):
 *   - Admin   : /admin/faelle (Kanban 4 Spalten) + /faelle/{id} (Fallakte 4-Phasen-aside)
 *               an je 1 begutachtung- + 1 erfassung-Claim
 *   - Admin   : /kanzlei/kanban + /kanzlei/mandate (admin darf rein, sieht alle 12)
 *   - Kanzlei : /kanzlei/kanban (rollen-gated Render-Check)
 *   - Dispatch: /dispatch (no-crash)
 *   - SV      : / (no-crash; AuftragHeaderPanel orthogonal zu MP-4)
 *
 * Kunde + Makler: separater Lauf nach Seed (test-Accounts haben 0 eigene Daten).
 *
 * Ausführung:
 *   node scripts/smoke-cmm44-mp4-staging.mjs
 * Liest STAGING_BASIC_AUTH_USER / STAGING_BASIC_AUTH_PASS aus .env.local.
 */

import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ─── .env.local laden ────────────────────────────────────────────────────────
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

const OUT = join(ROOT, 'docs/27.05.2026/smoke-mp4-staging')
mkdirSync(OUT, { recursive: true })

// Reale invariant-saubere claim_ids (== faelle.id) von v_claim_phase:
const CLAIM_BEGUT = '28492ffb-0dc1-4d9c-8fda-1ae4378dbd87' // begutachtung / kanzlei_uebergabe
const CLAIM_ERFAS = 'dcc6734d-c4a7-4e8c-bdc5-c7c320d81ab0' // erfassung / vollmacht_offen

const PHASE_LABELS = ['Erfassung', 'Begutachtung', 'Regulierung', 'Abschluss']

const report = []

function rec(o) { report.push(o); }

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
  // Fallakte hat Realtime/Maps → networkidle nie erreicht; fester Settle-Wait
  // + Viewport-Screenshot (fullPage timeoutet auf langen/animierten Seiten).
  await page.waitForTimeout(4000)
  await page.screenshot({ path: file, fullPage: false, timeout: 15000 }).catch((e) => console.warn('shot fail', label, e.message))
  // Text-Signal: welche der 4 Hauptphasen-Labels sind sichtbar?
  const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
  const found = PHASE_LABELS.filter((l) => text.includes(l))
  const url = page.url()
  rec({ label, url, phaseLabels: found, console: [...errs.console], pageerror: [...errs.pageerror] })
  console.log(`  [${label}] ${url}`)
  console.log(`     Phasen-Labels: ${found.join(', ') || '— KEINE'}`)
  if (errs.pageerror.length) console.log(`     ⚠ pageerror: ${errs.pageerror.length}`)
  // Bucket pro Step zurücksetzen, damit Fehler dem richtigen Step zugeordnet werden
  errs.console.length = 0
  errs.pageerror.length = 0
}

async function visit(page, path, label, errs) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await shoot(page, label, errs)
}

async function main() {
  console.log(`\n=== CMM-44 MP-4 Staging-Smoke → ${BASE} ===\n`)
  const browser = await chromium.launch({ headless: true })

  // ── ADMIN ──────────────────────────────────────────────────────────────────
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
      await visit(page, '/admin/faelle', '01-admin-kanban', errs)
      await visit(page, `/faelle/${CLAIM_BEGUT}`, '02-admin-fallakte-begutachtung', errs)
      await visit(page, `/faelle/${CLAIM_ERFAS}`, '03-admin-fallakte-erfassung', errs)
      await visit(page, '/kanzlei/kanban', '04-admin-in-kanzlei-kanban', errs)
      await visit(page, '/kanzlei/mandate', '05-admin-in-kanzlei-mandate', errs)
    }
    await ctx.close()
  } catch (e) { console.error('ADMIN-Block Fehler:', e.message); rec({ label: 'admin-block-error', error: e.message }) }

  // ── KANZLEI (rollen-gated) ───────────────────────────────────────────────────
  try {
    console.log('KANZLEI (test-kanzlei@claimondo.de)')
    const ctx = await newCtx(browser)
    const errs = { console: [], pageerror: [] }
    const page = await ctx.newPage()
    attachListeners(page, errs)
    const ok = await login(page, 'test-kanzlei@claimondo.de')
    console.log(`  login: ${ok ? 'ok' : 'FEHLGESCHLAGEN'} (${page.url()})`)
    rec({ label: 'kanzlei-login', ok, url: page.url() })
    if (ok) {
      await visit(page, '/kanzlei/kanban', '06-kanzlei-kanban', errs)
      await visit(page, '/kanzlei/mandate', '07-kanzlei-mandate', errs)
    }
    await ctx.close()
  } catch (e) { console.error('KANZLEI-Block Fehler:', e.message); rec({ label: 'kanzlei-block-error', error: e.message }) }

  // ── DISPATCH (no-crash) ──────────────────────────────────────────────────────
  try {
    console.log('DISPATCH (test-dispatch@claimondo.de)')
    const ctx = await newCtx(browser)
    const errs = { console: [], pageerror: [] }
    const page = await ctx.newPage()
    attachListeners(page, errs)
    const ok = await login(page, 'test-dispatch@claimondo.de')
    console.log(`  login: ${ok ? 'ok' : 'FEHLGESCHLAGEN'} (${page.url()})`)
    rec({ label: 'dispatch-login', ok, url: page.url() })
    if (ok) await visit(page, '/dispatch', '08-dispatch-home', errs)
    await ctx.close()
  } catch (e) { console.error('DISPATCH-Block Fehler:', e.message); rec({ label: 'dispatch-block-error', error: e.message }) }

  // ── SV (no-crash) ────────────────────────────────────────────────────────────
  try {
    console.log('SV (test-sv@claimondo.de)')
    const ctx = await newCtx(browser)
    const errs = { console: [], pageerror: [] }
    const page = await ctx.newPage()
    attachListeners(page, errs)
    const ok = await login(page, 'test-sv@claimondo.de')
    console.log(`  login: ${ok ? 'ok' : 'FEHLGESCHLAGEN'} (${page.url()})`)
    rec({ label: 'sv-login', ok, url: page.url() })
    if (ok) await shoot(page, '09-sv-home', errs)
    await ctx.close()
  } catch (e) { console.error('SV-Block Fehler:', e.message); rec({ label: 'sv-block-error', error: e.message }) }

  // ── KUNDE (nach Seed: test-kunde ownt Fall cccc…50) ─────────────────────────
  try {
    console.log('KUNDE (test-kunde@claimondo.de)')
    const ctx = await newCtx(browser)
    const errs = { console: [], pageerror: [] }
    const page = await ctx.newPage()
    attachListeners(page, errs)
    const ok = await login(page, 'test-kunde@claimondo.de')
    console.log(`  login: ${ok ? 'ok' : 'FEHLGESCHLAGEN'} (${page.url()})`)
    rec({ label: 'kunde-login', ok, url: page.url() })
    if (ok) {
      // /kunde/faelle redirected bei Single-Fall direkt auf die Detail-Page (progress-card + ClaimStepper)
      await visit(page, '/kunde/faelle', '10-kunde-fall-detail', errs)
    }
    await ctx.close()
  } catch (e) { console.error('KUNDE-Block Fehler:', e.message); rec({ label: 'kunde-block-error', error: e.message }) }

  // ── MAKLER (nach Seed: test-makler hat Consent auf Fall cccc…50) ─────────────
  try {
    console.log('MAKLER (test-makler@claimondo.de)')
    const ctx = await newCtx(browser)
    const errs = { console: [], pageerror: [] }
    const page = await ctx.newPage()
    attachListeners(page, errs)
    const ok = await login(page, 'test-makler@claimondo.de')
    console.log(`  login: ${ok ? 'ok' : 'FEHLGESCHLAGEN'} (${page.url()})`)
    rec({ label: 'makler-login', ok, url: page.url() })
    if (ok) {
      await visit(page, '/makler/akten', '11-makler-akten', errs)
      await visit(page, '/makler/akten/cccc5555-0000-4000-8000-000000000050', '12-makler-akte-detail', errs)
    }
    await ctx.close()
  } catch (e) { console.error('MAKLER-Block Fehler:', e.message); rec({ label: 'makler-block-error', error: e.message }) }

  await browser.close()

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\n=== FERTIG — Screenshots + report.json in ${OUT} ===`)
  const errSteps = report.filter((r) => (r.pageerror?.length ?? 0) > 0)
  console.log(`Steps mit pageerror: ${errSteps.length}`)
  for (const s of errSteps) console.log(`  ${s.label}: ${s.pageerror.join(' | ')}`)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
