import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AI-Orchestrator Admin-Oberflaechen-Smoke gegen Prod (/admin/ai-vorschlaege).
//
// Opt-in (NIE in CI): RUN_ORCHESTRATOR_SMOKE=1 — laeuft echt gegen Prod. Klickt "Verwerfen"
// auf einem ECHTEN Orchestrator-Vorschlag (setzt dessen status='verworfen'). Sicherheits-
// leitplanke: NIEMALS "Annehmen" (erzeugt echten Task + notifiziert echte Rolle KB/SV).
//
// Run:
//   RUN_ORCHESTRATOR_SMOKE=1 TEST_ADMIN_PASSWORD='<pw>' \
//     npx playwright test tests/e2e/flows/smoke-orchestrator-prod.spec.ts \
//     --project=chromium --reporter=list --workers=1

const APP = 'https://app.claimondo.de'

const CRED = {
  email: process.env.TEST_ADMIN_EMAIL ?? 'test-admin@claimondo.de',
  // Interner Test-Account (0 Faktoren -> Direkt-Login, Stand 08.07.); Prod-only, kein Produktiv-Secret.
  pass: process.env.TEST_ADMIN_PASSWORD ?? '',
}

const OUT_DIR = path.join(process.cwd(), 'test-results', 'orchestrator-smoke')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true })
  console.log(`[SHOT] ${name}`)
}

async function login(page: Page) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  // Warte bis Form-Hydration abgeschlossen (Email-Tab-Form sichtbar)
  await page.waitForSelector('#email', { timeout: 15_000 })
  await page.locator('#email').fill(CRED.email)
  // PasswordInput rendert ein <input> als Kind — nicht type="password" am wrapper
  await page.locator('input[type="password"], input[name="password"]').first().fill(CRED.pass)
  // Warte kurz damit React-State settled
  await page.waitForTimeout(500)
  await page.locator('button[type="submit"]').first().click()
  // Warte 8s (Supabase-Auth-Round-Trip + moegliche 2FA-Weiterleitung)
  await page.waitForTimeout(8_000)
  const loginUrl = page.url()
  console.log(`[login] URL nach waitForTimeout: ${loginUrl}`)
  // Falls auf /login/2fa -> das ist eine 2FA-Challenge-Page (kein Fehler)
  if (loginUrl.includes('/login')) {
    // Screenshot fuer Diagnose
    await page.screenshot({ path: path.join(OUT_DIR, '00-login-state.png'), fullPage: true })
    throw new Error(`Login fehlgeschlagen oder auf Login-Seite stecken: ${loginUrl}`)
  }
  await page.waitForLoadState('networkidle').catch(() => {})
  console.log(`[login] Post-Login URL: ${page.url()}`)
}

// Opt-in-Gate: skippt die gesamte Datei ausser RUN_ORCHESTRATOR_SMOKE=1 ist gesetzt.
// Muster wie golden-path-*-prod.spec.ts / 2fa-hardening-smoke.spec.ts (nie in CI).
test.skip(
  !process.env.RUN_ORCHESTRATOR_SMOKE,
  'set RUN_ORCHESTRATOR_SMOKE=1 (läuft echt gegen Prod)',
)

test.describe.configure({ mode: 'serial' })

test('Orchestrator-Smoke: /admin/ai-vorschlaege rendert + Vorschlaege sichtbar + Verwerfen', async ({ browser }) => {
  test.setTimeout(90_000)

  // Frischer isolierter Context — kein storageState, serviceWorkers geblockt.
  // Entspricht dem "frischer SW-freier Browser"-Standard aus BROADCAST-prod-smokes.
  const ctx = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 900 },
  })
  const page = await ctx.newPage()

  page.on('pageerror', (e) => console.error(`[BROWSER pageerror] ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') console.error(`[BROWSER console.error] ${m.text()}`)
  })

  try {
    // ── Step 1: Einloggen als test-admin ──────────────────────────────────
    await login(page)

    // ── Step 2: /admin/ai-vorschlaege aufrufen ───────────────────────────
    await page.goto(`${APP}/admin/ai-vorschlaege`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2_000) // React-hydration
    await shot(page, '01-ai-vorschlaege-initial.png')

    // Assert: kein Login-Redirect + kein 500
    const currentUrl = page.url()
    console.log(`[smoke] URL nach goto: ${currentUrl}`)
    expect(currentUrl, 'Darf nicht auf /login redirected haben').not.toContain('/login')

    // Assert: 308-Redirect ai-vorschlaege -> aufgaben/vorschlaege ist gelandet
    // (Die KI-Vorschlaege-Inbox lebt jetzt als Pill unter /admin/aufgaben.)
    expect(currentUrl, 'Muss auf /admin/aufgaben/vorschlaege redirected haben').toContain('/admin/aufgaben/vorschlaege')

    // Assert: KI-Vorschlaege-Pill sichtbar. Headerless — es gibt kein <h1> mehr,
    // die aktive Pill (ein <Link>) traegt den Titel.
    const pill = page.getByRole('link', { name: /KI-Vorschläge/i }).first()
    await expect(pill, 'KI-Vorschlaege-Pill muss sichtbar sein').toBeVisible({ timeout: 15_000 })
    console.log('[smoke] ✓ KI-Vorschlaege-Pill sichtbar')

    // ── Step 3: Vorschlaege zaehlen ──────────────────────────────────────
    // Jede Karte hat "Annehmen" + "Verwerfen" Buttons. Verwende "Verwerfen" als Proxy.
    // (Die Buttons sind innerhalb einer SectionCard.)
    const verwerfenButtons = page.getByRole('button', { name: /Verwerfen/i })
    const anzahl = await verwerfenButtons.count()
    console.log(`[smoke] Anzahl Vorschlags-Karten: ${anzahl}`)

    if (anzahl === 0) {
      // Keine offenen Vorschlaege — kein Fehler, nur dokumentieren.
      // Pruefen ob "Keine offenen KI-Vorschlaege" angezeigt wird.
      const leerText = await page.getByText(/Keine offenen KI-Vorschläge/i).count()
      console.log(`[smoke] Kein Vorschlag-Empty-State: ${leerText > 0 ? 'sichtbar (ok)' : 'UNBEKANNT'}`)
      await shot(page, '02-keine-vorschlaege.png')
    } else {
      // Assert: mindestens 1 Karte mit Begruendungstext + Buttons
      await expect(verwerfenButtons.first(), 'Verwerfen-Button muss sichtbar sein').toBeVisible()

      // Annehmen-Button ist VORHANDEN — wir klicken ihn NICHT.
      const annehmenButtons = page.getByRole('button', { name: /Annehmen/i })
      const annehmenAnzahl = await annehmenButtons.count()
      console.log(`[smoke] Annehmen-Buttons sichtbar: ${annehmenAnzahl} — werden NICHT angeklickt (Sicherheitsleitplanke)`)

      // Begründungstext der ersten Karte pruefen (text-body-sm Element)
      const ersteKarte = page.locator('[class*="SectionCard"], [data-testid="section-card"]').first()
      const karteText = await ersteKarte.textContent().catch(() => '')
      console.log(`[smoke] Erste Karte (Auszug): ${karteText?.slice(0, 200)}`)
      await shot(page, '02-vorschlaege-sichtbar.png')

      // ── Step 4: Verwerfen-Test (side-effect-frei) ─────────────────────
      // Klicke "Verwerfen" auf der ERSTEN Karte.
      // Erwartet: sonner-Toast "Vorschlag verworfen" ODER Karte verschwindet (Anzahl sinkt).
      console.log('[smoke] Klicke "Verwerfen" auf erster Karte...')

      // SICHERHEITS-CHECK: stelle sicher, dass wir den VERWERFEN- und nicht den ANNEHMEN-Button klicken.
      // "Verwerfen" ist der ghost-variant Button, "Annehmen" ist navy. Explizit nach "Verwerfen" text suchen.
      const erstesVerwerfen = page.getByRole('button', { name: /^Verwerfen$/ }).first()
      await expect(erstesVerwerfen, 'Verwerfen-Button muss vor dem Klick sichtbar sein').toBeVisible()
      const btnText = await erstesVerwerfen.textContent()
      console.log(`[smoke] Button-Text vor Klick: "${btnText?.trim()}" — NICHT "Annehmen"`)
      expect(btnText?.trim(), 'Gesicherter Button darf NICHT "Annehmen" heissen').not.toMatch(/^Annehmen$/i)

      await erstesVerwerfen.click()
      console.log('[smoke] Verwerfen geklickt, warte auf Toast oder Karten-Update...')

      // Warte auf sonner-Toast ODER Karten-Update (Anzahl sinkt um 1)
      let verwerfenBestaetigt = false

      // Option A: sonner-Toast mit "verworfen"-Text
      try {
        await page.waitForSelector(
          '[data-sonner-toast], [class*="sonner"], [data-testid="sonner-toast"]',
          { timeout: 6_000 },
        )
        const toastText = await page.locator('[data-sonner-toast], [class*="sonner"]').first().textContent()
        console.log(`[smoke] Toast sichtbar: "${toastText?.trim()}"`)
        if (/verworfen/i.test(toastText ?? '')) {
          verwerfenBestaetigt = true
          console.log('[smoke] ✓ Toast "Vorschlag verworfen" bestaetigt')
        }
      } catch {
        console.log('[smoke] Kein sonner-Toast innerhalb 6s — pruefe Karten-Anzahl')
      }

      // Option B: Karten-Anzahl gesunken
      await page.waitForTimeout(2_000)
      const anzahlNachVerwerfen = await page.getByRole('button', { name: /Verwerfen/i }).count()
      console.log(`[smoke] Verwerfen-Buttons nach Klick: ${anzahlNachVerwerfen} (vorher: ${anzahl})`)

      if (anzahlNachVerwerfen < anzahl) {
        verwerfenBestaetigt = true
        console.log('[smoke] ✓ Karte verschwunden (Anzahl gesunken) — Verwerfen bestaetigt')
      }

      await shot(page, '03-nach-verwerfen.png')

      expect(
        verwerfenBestaetigt,
        'Verwerfen muss durch Toast ODER durch sinkende Karten-Anzahl bestaetigt werden',
      ).toBe(true)
    }

    console.log('[smoke] ✅ Orchestrator-Smoke abgeschlossen')
    console.log('[smoke] BESTAETIGUNG: "Annehmen" wurde zu keinem Zeitpunkt geklickt.')
  } finally {
    await ctx.close()
  }
})
