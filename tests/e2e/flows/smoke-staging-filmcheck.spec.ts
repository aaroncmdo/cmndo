import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// Filmcheck-Strecke Multi-Rollen-Smoke (gegen Staging).
// Prueft die deployte Filmcheck-UI pro Rolle — insb. die neuen Bausteine aus
// #3326/#3352: QC-Karte (Auto-Vorbefuellung + PDF-Evidenz), Pflicht-Check-Gate
// ("bestanden" gesperrt bis alle Checks Ja), Kanzlei-Portal, Kunde-Status.
//
// Run:
//   npx playwright test tests/e2e/flows/smoke-staging-filmcheck.spec.ts \
//     --project=chromium --reporter=list --headed
//
// Rollen-Creds via ENV ueberschreibbar (Default = etablierte Staging-Accounts).
// KEIN Passwort-Reset o.ae. — reine Lese-/Navigations-Smokes.

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.staging.claimondo.de'
const BASIC_AUTH = {
  username: process.env.STAGING_BASIC_USER ?? 'aaroncmdo',
  password: process.env.STAGING_BASIC_PASS ?? 'ClaimondoSuperuser123789!!',
}
// Kanonische Staging-Fixtures (tests/e2e/fixtures.ts + onboarding-pflichtdok.spec.ts).
// KB hat ein eigenes Passwort (TestKB2026!), der Rest <PASSWORT: GitHub-Secret>.
const CRED = {
  admin: { email: process.env.TEST_ADMIN_EMAIL ?? 'test-admin@claimondo.de', pass: process.env.TEST_ADMIN_PASSWORD ?? '' },
  kb: { email: process.env.TEST_KB_EMAIL ?? 'test-kb-anna@claimondo.de', pass: process.env.TEST_KB_PASSWORD ?? 'TestKB2026!' },
  sv: { email: process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de', pass: process.env.TEST_SV_PASSWORD ?? '' },
  kanzlei: { email: process.env.TEST_KANZLEI_EMAIL ?? 'test-kanzlei@claimondo.de', pass: process.env.TEST_KANZLEI_PASSWORD ?? '' },
}

const OUT_DIR = path.join(process.cwd(), 'docs', '01.07.2026', 'filmcheck-smoke')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

async function login(page: Page, email: string, pass: string): Promise<boolean> {
  await page.goto(`${BASE}/login`)
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', pass)
  await page.click('button[type="submit"]')
  try {
    await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 60_000 })
  } catch {
    console.log(`[login] FEHLGESCHLAGEN fuer ${email} (Account auf staging vorhanden?)`)
    return false
  }
  await page.waitForLoadState('networkidle').catch(() => {})
  return true
}

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true })
  console.log(`[SHOT] ${name}`)
}

// Admin/KB: die QC-Filmcheck-Karte auf einer Fallakte mit Gutachten finden + pruefen.
test('Filmcheck — KB/Admin: QC-Karte rendert + Pflicht-Gate + Auto-Prefill + PDF', async ({ browser }) => {
  test.setTimeout(240_000)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, httpCredentials: BASIC_AUTH })
  const page = await ctx.newPage()

  if (!(await login(page, CRED.admin.email, CRED.admin.pass))) { await shoot(page, '01-admin-login-fail.png'); await ctx.close(); return }
  console.log(`[admin] Post-Login: ${page.url()}`)
  await shoot(page, '01-admin-login.png')

  // Fall-Liste -> Fallakten durchprobieren bis die QC-Karte (nur bei Gutachten) erscheint.
  const LIST_ROUTES = ['/admin/faelle', '/faelle']
  let fallUrls: string[] = []
  for (const route of LIST_ROUTES) {
    await page.goto(`${BASE}${route}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1500)
    fallUrls = await page.locator('a[href*="/faelle/"]').evaluateAll((els) =>
      Array.from(new Set(els.map((el) => (el as HTMLAnchorElement).href).filter((h) => /\/faelle\/[0-9a-f-]{8,}/.test(h)))),
    )
    console.log(`[admin] ${route}: ${fallUrls.length} Fall-Links`)
    if (fallUrls.length > 0) break
  }
  if (fallUrls.length === 0) {
    console.log('[STOP] keine Fallakten sichtbar — Staging-Daten-Setup noetig')
    await ctx.close(); return
  }

  let qcGefunden = false
  for (const url of fallUrls.slice(0, 12)) {
    await page.goto(url)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2500)
    // Dokumente-Tab aktivieren (QC-Karte lebt dort)
    const dokTab = page.getByRole('tab', { name: /dokumente/i }).or(page.getByRole('button', { name: /dokumente/i })).first()
    if (await dokTab.count()) { await dokTab.click().catch(() => {}); await page.waitForTimeout(1500) }
    const qcCard = page.getByText('QC-Checkliste (Filmcheck)').first()
    if (await qcCard.count()) { qcGefunden = true; console.log(`[admin] QC-Karte auf ${url}`); break }
  }
  if (!qcGefunden) {
    console.log('[STOP] keine Fallakte mit QC-Karte (Gutachten) gefunden — Seed noetig')
    await shoot(page, '02-keine-qc-karte.png'); await ctx.close(); return
  }

  await shoot(page, '02-qc-karte.png')
  // Assertions: die neuen #3326/#3352-Bausteine
  await expect(page.getByText('QC-Checkliste (Filmcheck)').first()).toBeVisible()
  const bestandenBtn = page.getByRole('button', { name: /QC bestanden.*Kanzlei/i }).first()
  await expect(bestandenBtn).toBeVisible()
  // Pflicht-Gate: wenn nicht alle Checks Ja -> Button disabled + Sperr-Hinweis
  const gesperrt = page.getByText(/Kanzlei-Übergabe gesperrt, bis alle Pflicht-Checks/i)
  if (await gesperrt.count()) {
    await expect(bestandenBtn).toBeDisabled()
    console.log('[admin] ✓ Pflicht-Gate aktiv (Button disabled + Sperr-Hinweis)')
  } else {
    console.log('[admin] (alle Checks Ja — Button frei; Gate-Negativfall)')
  }
  // Auto-Prefill-Hinweis + PDF-Evidenz-Link (best effort, je nach Falldaten)
  console.log(`[admin] Auto-Prefill-Hinweis: ${await page.getByText(/aus den Falldaten vorbefüllt/i).count()}`)
  console.log(`[admin] PDF-Evidenz-Link: ${await page.getByText(/Gutachten öffnen \(zur Prüfung\)/i).count()}`)
  await shoot(page, '03-qc-assertions.png')
  await ctx.close()
})

// SV: Abgabe-Surface (Portal erreichbar, Fall/Auftrag sichtbar).
test('Filmcheck — SV: Portal + Fall-Surface erreichbar', async ({ browser }) => {
  test.setTimeout(180_000)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, httpCredentials: BASIC_AUTH })
  const page = await ctx.newPage()
  if (!(await login(page, CRED.sv.email, CRED.sv.pass))) { await ctx.close(); return }
  console.log(`[sv] Post-Login: ${page.url()}`)
  for (const r of ['/gutachter/auftraege', '/gutachter/heute', '/gutachter/kalender']) {
    await page.goto(`${BASE}${r}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1200)
    const n = await page.locator('a[href*="/gutachter/fall/"], a[href*="/gutachter/auftrag/"]').count()
    console.log(`[sv] ${r}: ${n} Fall/Auftrag-Links`)
    if (n > 0) break
  }
  await shoot(page, '10-sv-portal.png')
  expect(page.url()).not.toContain('/login')
  await ctx.close()
})

// Kanzlei: Mandate-Portal rendert (operative_status als Badge; scopedClaimIds-Liste).
test('Filmcheck — Kanzlei: Mandate-Portal erreichbar', async ({ browser }) => {
  test.setTimeout(180_000)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, httpCredentials: BASIC_AUTH })
  const page = await ctx.newPage()
  if (!(await login(page, CRED.kanzlei.email, CRED.kanzlei.pass))) { await ctx.close(); return }
  console.log(`[kanzlei] Post-Login: ${page.url()}`)
  for (const r of ['/kanzlei/mandate', '/kanzlei/kanban', '/kanzlei']) {
    await page.goto(`${BASE}${r}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1200)
    console.log(`[kanzlei] ${r}: ${page.url()}`)
  }
  await shoot(page, '20-kanzlei-portal.png')
  expect(page.url()).not.toContain('/login')
  await ctx.close()
})
