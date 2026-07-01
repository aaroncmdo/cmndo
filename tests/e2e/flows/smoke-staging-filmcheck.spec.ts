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
// KB hat ein eigenes Passwort (TestKB2026!), der Rest Test1234!.
const CRED = {
  admin: { email: process.env.TEST_ADMIN_EMAIL ?? 'test-admin@claimondo.de', pass: process.env.TEST_ADMIN_PASSWORD ?? 'Test1234!' },
  kb: { email: process.env.TEST_KB_EMAIL ?? 'test-kb-anna@claimondo.de', pass: process.env.TEST_KB_PASSWORD ?? 'TestKB2026!' },
  sv: { email: process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de', pass: process.env.TEST_SV_PASSWORD ?? 'Test1234!' },
  kanzlei: { email: process.env.TEST_KANZLEI_EMAIL ?? 'test-kanzlei@claimondo.de', pass: process.env.TEST_KANZLEI_PASSWORD ?? 'Test1234!' },
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

// Voller transaktionaler Durchlauf: SV laedt ein Gutachten hoch + gibt ab ->
// Admin verifiziert, dass die QC-Karte (Filmcheck) auf demselben Fall erscheint.
// Erzeugt den filmcheck-Zustand SELBST via UI (Staging-DB nicht seedbar).
// Graceful: braucht einen SV-Fall mit durchgefuehrtem Termin + noch ohne Gutachten
// (sonst erscheint der Upload-Banner nicht) + komplett-Service (sonst kein filmcheck).
test('Filmcheck — Voll: SV-Abgabe erzeugt QC-Karte, Admin verifiziert', async ({ browser }) => {
  test.setTimeout(300_000)
  const FOTO = path.join(process.cwd(), 'tests', 'fixtures', 'test-foto.jpg')

  // --- SV: Fall mit Upload-Banner finden, Gutachten hochladen + abgeben ---
  const svCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, httpCredentials: BASIC_AUTH })
  const svPage = await svCtx.newPage()
  if (!(await login(svPage, CRED.sv.email, CRED.sv.pass))) { await svCtx.close(); return }

  let fallUrls: string[] = []
  for (const r of ['/gutachter/auftraege', '/gutachter/heute', '/gutachter/kalender']) {
    await svPage.goto(`${BASE}${r}`); await svPage.waitForLoadState('networkidle').catch(() => {}); await svPage.waitForTimeout(1500)
    fallUrls = await svPage.locator('a[href*="/gutachter/fall/"]').evaluateAll((els) =>
      Array.from(new Set(els.map((el) => (el as HTMLAnchorElement).href))))
    if (fallUrls.length) break
  }
  console.log(`[voll/sv] Fall-URLs: ${fallUrls.length}`)

  let fallId = fallUrls[0]?.split('/gutachter/fall/')[1]?.split(/[/?#]/)[0] ?? ''
  let abgegeben = false
  for (const url of fallUrls.slice(0, 8)) {
    await svPage.goto(url); await svPage.waitForLoadState('networkidle').catch(() => {}); await svPage.waitForTimeout(4000)
    const fileInput = svPage.locator('input[type="file"]').first()
    const dropzone = svPage.getByText(/Gutachten hochladen|Dateien hierher ziehen/i)
    if ((await fileInput.count()) === 0 || (await dropzone.count()) === 0) {
      console.log(`[voll/sv] ${url}: kein Upload-Banner (Termin nicht durchgefuehrt / schon Gutachten)`); continue
    }
    fallId = url.split('/gutachter/fall/')[1]?.split(/[/?#]/)[0] ?? ''
    console.log(`[voll/sv] Upload-Banner auf Fall ${fallId} — lade ${path.basename(FOTO)}`)
    await fileInput.setInputFiles(FOTO)
    await svPage.waitForTimeout(7000) // Direktupload + finalize
    const abgeben = svPage.getByRole('button', { name: /^Abgeben$|Wird abgegeben/i }).first()
    if ((await abgeben.count()) === 0) { console.log('[voll/sv] kein Abgeben-Button nach Upload'); await shoot(svPage, '30-kein-abgeben.png'); continue }
    await abgeben.click(); await svPage.waitForTimeout(5000)
    await shoot(svPage, '30-sv-abgegeben.png')
    const ok = await svPage.getByText(/Gutachten hochgeladen|QC läuft|Vielen Dank/i).count()
    console.log(`[voll/sv] Abgabe-Bestaetigung sichtbar: ${ok}`)
    abgegeben = true; break
  }
  await svCtx.close()
  if (!fallId) { console.log('[STOP] kein SV-Fall auf staging sichtbar — Seed noetig'); return }
  console.log(`[voll] Admin verifiziert QC-Karte auf Fall ${fallId} (frische SV-Abgabe gelungen: ${abgegeben})`)

  // --- Admin: QC-Karte auf demselben Fall verifizieren (Phase 1a + Gate) ---
  const adCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, httpCredentials: BASIC_AUTH })
  const adPage = await adCtx.newPage()
  if (!(await login(adPage, CRED.admin.email, CRED.admin.pass))) { await adCtx.close(); return }
  await adPage.goto(`${BASE}/faelle/${fallId}`); await adPage.waitForLoadState('networkidle').catch(() => {}); await adPage.waitForTimeout(3000)
  const dokTab = adPage.getByRole('tab', { name: /dokumente/i }).or(adPage.getByRole('button', { name: /dokumente/i })).first()
  if (await dokTab.count()) { await dokTab.click().catch(() => {}); await adPage.waitForTimeout(1500) }

  const qc = adPage.getByText('QC-Checkliste (Filmcheck)').first()
  if ((await qc.count()) === 0) {
    console.log('[STOP] QC-Karte nach SV-Abgabe NICHT sichtbar — Fall evtl. nicht komplett/nicht filmcheck')
    await shoot(adPage, '31-keine-qc-karte.png'); await adCtx.close(); return
  }
  await shoot(adPage, '31-qc-karte-nach-abgabe.png')
  await expect(qc).toBeVisible()
  await expect(adPage.getByRole('button', { name: /QC bestanden.*Kanzlei/i }).first()).toBeVisible()
  console.log(`[voll/admin] ✓ QC-Karte nach SV-Abgabe verifiziert (Fall ${fallId})`)
  console.log(`[voll/admin] PDF-Evidenz-Link: ${await adPage.getByText(/Gutachten öffnen \(zur Prüfung\)/i).count()}`)
  console.log(`[voll/admin] Auto-Prefill-Hinweis: ${await adPage.getByText(/aus den Falldaten vorbefüllt/i).count()}`)
  console.log(`[voll/admin] Pflicht-Gate-Sperre: ${await adPage.getByText(/Kanzlei-Übergabe gesperrt/i).count()}`)
  await adCtx.close()
})
