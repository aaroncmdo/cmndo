/**
 * scripts/journey/_helpers.mjs — Journey-Smoke-Helper
 *
 * Unterschied zum bestehenden state-smoke (scripts/smoke/helpers.mjs):
 *  - KEINE Service-Role-Mutationen für Forward-Progress
 *  - Jede Aktion wird per UI-Klick ausgeführt
 *  - Pro Aktion: Screenshot + 4-Rollen-Cross-Check (Admin/Dispatch/SV/Kunde)
 *  - Pop-Over- und Exit-Pfade werden explizit getestet
 *
 * Findings-Schema:
 *   { sev: 'PASS'|'INFO'|'SOFT'|'HARD'; phase: number; msg: string; tag?: string }
 *
 * Cross-Role-Checkpoints:
 *   await checkpoint(role, async (page) => {
 *     await page.goto(...)
 *     await assertVisible(page, locator, 'erwartete Sicht')
 *   })
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..', '..')
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// .env.local laden ohne dotenv-Dependency
function loadEnv() {
  const envPath = join(projectRoot, '.env.local')
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const adminDb =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null

export function getAdminDb() {
  if (!adminDb) throw new Error('Service-Role nicht verfügbar — .env.local prüfen')
  return adminDb
}

// ─── Journey-Output-Verzeichnis ────────────────────────────────────────────

const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
export const JOURNEY_OUT = join(projectRoot, 'docs', 'portals-review', 'journey', RUN_TS)
mkdirSync(JOURNEY_OUT, { recursive: true })

// ─── Findings Sammler ──────────────────────────────────────────────────────

const findings = []

export function record(sev, phase, msg, tag) {
  findings.push({ sev, phase, msg, tag, ts: new Date().toISOString() })
  const prefix = { PASS: '✅', INFO: 'ℹ️', SOFT: '⚠️', HARD: '❌' }[sev] ?? '·'
  console.log(`[Phase ${phase}] ${prefix} ${msg}${tag ? ` (${tag})` : ''}`)
}

export function getFindings() {
  return findings
}

export function writeReport() {
  const path = join(JOURNEY_OUT, 'JOURNEY-REPORT.md')
  const grouped = {}
  for (const f of findings) {
    if (!grouped[f.phase]) grouped[f.phase] = []
    grouped[f.phase].push(f)
  }
  const lines = [`# Journey-Smoke ${RUN_TS}`, '']
  for (const phase of Object.keys(grouped).sort((a, b) => Number(a) - Number(b))) {
    const fs = grouped[phase]
    const counts = {
      PASS: fs.filter((f) => f.sev === 'PASS').length,
      SOFT: fs.filter((f) => f.sev === 'SOFT').length,
      HARD: fs.filter((f) => f.sev === 'HARD').length,
    }
    lines.push(`## Phase ${phase} — PASS:${counts.PASS} SOFT:${counts.SOFT} HARD:${counts.HARD}`)
    lines.push('')
    for (const f of fs) {
      const prefix = { PASS: '✅', INFO: 'ℹ️', SOFT: '⚠️', HARD: '❌' }[f.sev]
      lines.push(`- ${prefix} **${f.sev}:** ${f.msg}${f.tag ? ` _(${f.tag})_` : ''}`)
    }
    lines.push('')
  }
  writeFileSync(path, lines.join('\n'), 'utf-8')
  return path
}

// ─── Browser-Lifecycle ─────────────────────────────────────────────────────

let browser = null
const contexts = new Map() // role → BrowserContext

export async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: process.env.JOURNEY_HEADLESS !== 'false' })
  }
  return browser
}

export async function getContext(role) {
  if (contexts.has(role)) return contexts.get(role)
  const b = await getBrowser()
  const ctx = await b.newContext({
    viewport: { width: 1366, height: 900 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  })
  await ctx.addCookies([
    { name: 'claimondo-cookie-consent', value: '1', domain: 'localhost', path: '/', expires: Date.now() / 1000 + 86400 },
  ])
  contexts.set(role, ctx)
  return ctx
}

export async function teardown() {
  for (const ctx of contexts.values()) {
    await ctx.close().catch(() => {})
  }
  contexts.clear()
  if (browser) await browser.close().catch(() => {})
  browser = null
}

// ─── Auth ──────────────────────────────────────────────────────────────────

const ROLE_CREDS = {
  admin: { email: 'test-admin@claimondo.de', pwd: 'Test1234!' },
  dispatch: { email: 'test-dispatch@claimondo.de', pwd: 'Test1234!' },
  sv: { email: 'test-sv@claimondo.de', pwd: 'Test1234!' },
  kunde: { email: 'test-kunde@claimondo.de', pwd: 'Test1234!' },
  kanzlei: { email: 'test-kanzlei@claimondo.de', pwd: 'Test1234!' },
}

export async function loginAs(role) {
  const creds = ROLE_CREDS[role]
  if (!creds) throw new Error(`Unbekannte Rolle: ${role}`)
  const ctx = await getContext(role)
  // Bereits eingeloggt?
  const existing = ctx.pages().find((p) => !p.isClosed())
  let page = existing ?? (await ctx.newPage())
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  // Wenn schon eingeloggt, redirected /login auf das Portal
  if (!page.url().includes('/login')) return page

  await page.locator('input[type="email"]').first().fill(creds.email)
  await page.locator('input[type="password"]').first().fill(creds.pwd)
  await page.getByRole('button', { name: /anmelden|login|einloggen/i }).first().click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 }).catch(() => {})
  return page
}

// ─── Asserts ───────────────────────────────────────────────────────────────

export async function assertVisible(page, locator, msg, phase, opts = {}) {
  const timeout = opts.timeout ?? 5_000
  const ok = await locator.isVisible({ timeout }).catch(() => false)
  record(ok ? 'PASS' : 'SOFT', phase, ok ? `sichtbar: ${msg}` : `NICHT sichtbar: ${msg}`, opts.tag)
  return ok
}

export async function assertHidden(page, locator, msg, phase, opts = {}) {
  const timeout = opts.timeout ?? 1_500
  const visible = await locator.isVisible({ timeout }).catch(() => false)
  record(!visible ? 'PASS' : 'SOFT', phase, !visible ? `verborgen wie erwartet: ${msg}` : `unerwartet sichtbar (sollte weg sein): ${msg}`, opts.tag)
  return !visible
}

export async function shoot(page, name) {
  const path = join(JOURNEY_OUT, `${name}.png`)
  await page.screenshot({ path, fullPage: false }).catch(() => {})
  return path
}

// ─── Cross-Role-Checkpoint ─────────────────────────────────────────────────

/**
 * Logged eine Rolle ein, navigiert + checkt.
 * @param {'admin'|'dispatch'|'sv'|'kunde'|'kanzlei'} role
 * @param {(page) => Promise<void>} fn
 */
export async function checkpoint(role, fn) {
  const page = await loginAs(role)
  try {
    await fn(page)
  } catch (err) {
    record('SOFT', 0, `Checkpoint(${role}) Fehler: ${err.message}`, 'checkpoint')
  }
}

// ─── Popover / Modal ───────────────────────────────────────────────────────

/**
 * Klickt einen Trigger und prüft dass ein Popover/Modal erscheint.
 * Returns true wenn das Pop-Over im DOM auftaucht (rolle dialog / popover).
 */
export async function openPopover(page, triggerLocator, phase, label) {
  await triggerLocator.click({ trial: false }).catch(() => {})
  await page.waitForTimeout(300)
  const popover = page.locator('[role="dialog"], [role="menu"], [data-state="open"]').first()
  const ok = await popover.isVisible({ timeout: 3_000 }).catch(() => false)
  record(ok ? 'PASS' : 'SOFT', phase, ok ? `Pop-Over geöffnet: ${label}` : `Pop-Over hat sich nicht geöffnet: ${label}`, 'popover')
  return ok
}

/** Schließt aktive Pop-Overs/Modale via Escape. */
export async function closePopover(page) {
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(200)
}

// ─── Fixture-IDs ───────────────────────────────────────────────────────────

const FIXTURES_PATH = join(projectRoot, 'tmp', 'e2e-fixture-ids.json')

export function loadFixtureIds() {
  if (!existsSync(FIXTURES_PATH)) return null
  try {
    return JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'))
  } catch {
    return null
  }
}

export function saveFixtureIds(updates) {
  const cur = loadFixtureIds() ?? {}
  const merged = { ...cur, ...updates }
  if (!existsSync(dirname(FIXTURES_PATH))) mkdirSync(dirname(FIXTURES_PATH), { recursive: true })
  writeFileSync(FIXTURES_PATH, JSON.stringify(merged, null, 2), 'utf-8')
}
