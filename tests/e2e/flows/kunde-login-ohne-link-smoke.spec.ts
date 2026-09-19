// Journey J2 Schritt 2b — Kunde kommt ohne FlowLink in sein Konto (Weg 2: E-Mail).
// Soll: memory/abnahmen/2026-09-19-kunde-kommt-ohne-link-ins-konto.md (1c, Weg 2)
// Seed + DB-Beweis: scripts/smoke/kunde-login-ohne-link-seed.mjs (Ablauf im Kopf des Scripts).
//
// Zwei Laeufe: Lauf 1 faehrt Test A (Link anfordern) und skippt B; nach `--link` faehrt Lauf 2
// nur B (A skippt, sobald magicLinkUrl in der Seed-Datei steht — ein erneutes Anfordern wuerde
// den Token der Mail ersetzen). Der Negativfall laeuft in beiden Laeufen.
//
// Run: PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test kunde-login-ohne-link-smoke --project=chromium
import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Seed = { leadId: string; email: string; negativEmail: string; magicLinkUrl?: string }
const SEED = join(process.cwd(), 'scripts/smoke/.kunde-login-ohne-link-seed.json')
const RESULT = join(process.cwd(), 'scripts/smoke/.kunde-login-ohne-link-result.json')
// Seed-Read IM try (E2E-Toplevel-FS-Gate): fehlt die Datei, skippen die Tests statt die Collection zu brechen.
let seed: Seed | null = null
try {
  seed = JSON.parse(readFileSync(SEED, 'utf8'))
} catch {
  /* nicht geseedet -> test.skip im Test-Body */
}

const NEUTRALER_SATZ = /Falls zu dieser Adresse ein Vorgang bei uns existiert/

test('A · Weg 2 Schritt 1-2: bekannter Lead ohne Konto fordert den Anmelde-Link an', async ({ page }) => {
  test.skip(!seed, 'Seed-Fixture fehlt — local-only Prod-Smoke (kunde-login-ohne-link-seed.mjs)')
  test.skip(!!seed?.magicLinkUrl, 'Schritt 1-2 lief im ersten Lauf; erneutes Anfordern ersetzt den Mail-Token')
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  // E-Mail-Tab ist der Standard-Tab; das Feld wird getippt, kein Passwort noetig.
  await page.locator('input[name="email"]').first().fill(seed!.email)
  await page.getByRole('button', { name: /Anmelde-Link per E-Mail senden/ }).click()
  // Soll: neutraler Satz — derselbe wie fuer eine unbekannte Adresse (Enumeration-Schutz).
  await expect(page.getByText(NEUTRALER_SATZ)).toBeVisible({ timeout: 20_000 })
})

test('B · Weg 2 Schritt 3-6: Link oeffnen -> bestaetigen -> Portal -> offene Meldung fortsetzen', async ({ page }) => {
  test.skip(!seed, 'Seed-Fixture fehlt — local-only Prod-Smoke (kunde-login-ohne-link-seed.mjs)')
  test.skip(!seed?.magicLinkUrl, 'magicLinkUrl fehlt — nach Test A `kunde-login-ohne-link-seed.mjs --link` fahren')
  await page.goto(seed!.magicLinkUrl!, { waitUntil: 'domcontentloaded' })
  // /auth/bestaetigen loest beim GET nichts ein (Prefetch-Haertung) — erst der Klick.
  await page.getByRole('button', { name: /Bestätigen/ }).click()
  await page.waitForURL(/\/kunde/, { timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  // Soll Schritt 5: der offene Lead ist als Karte sichtbar (kein Claim -> keine Fallakte, keine Onboarding-Sperre).
  await expect(page.getByText(/Ihre Schadenmeldung vom/)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /Jetzt fortsetzen/ }).click()
  await page.waitForURL(/\/flow\//, { timeout: 30_000 })
  const flowUrl = page.url()
  expect(flowUrl).toMatch(/\/flow\/[A-Za-z0-9_-]+/)
  // Fuer die DB-Gegenprobe (--verify): der Token der URL muss zum Seed-Lead gehoeren.
  writeFileSync(RESULT, JSON.stringify({ flowUrl, gemessenAm: new Date().toISOString() }, null, 2))
})

test('N · Weg 2: unbekannte Adresse sieht denselben neutralen Satz', async ({ page }) => {
  test.skip(!seed, 'Seed-Fixture fehlt — local-only Prod-Smoke (kunde-login-ohne-link-seed.mjs)')
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="email"]').first().fill(seed!.negativEmail)
  await page.getByRole('button', { name: /Anmelde-Link per E-Mail senden/ }).click()
  await expect(page.getByText(NEUTRALER_SATZ)).toBeVisible({ timeout: 20_000 })
  // Dass dabei KEIN Konto entsteht, prueft `--verify` (auth.users fuer negativEmail = 0).
})

test.skip('S · Weg 2 (SMS): bekannter Lead mit Mobilnummer -> Code -> Portal', () => {
  // NICHT NACHGEWIESEN, bewusst: braucht eine Test-Mobilnummer, deren SMS-Code der Smoke lesen
  // kann — existiert nicht (vgl. 2fa-hardening: SMOKE_2FA_* fehlt ueberall). Ausserdem gehen an
  // eine echte Nummer echte SMS (Regel 4: telefon = NULL auf Test-Leads). Status im Soll-Blatt
  // Abschnitt 9: "verdrahtet, nicht gelaufen". Manuell mit einem Geraet nachzuholen.
})
