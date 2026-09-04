// T3-S4 Regel-4-Smoke (16.07.): Der manuelle Endzustand-Flow (Fallakte -> EndzustandDropdown ->
// Modal) war auf Prod NIE funktional (NULL-NOT-IN-Guard: jede Action schlug mit "Claim ist
// bereits in einem Endzustand" fehl). S4 (#4436) fixt den Guard (operative + NULL-safe).
// Dieser Smoke setzt auf einem verwaisten Test-Claim die EINFACHE Ablehnung (non-terminal,
// nachforderbar — Claim bleibt aktiv, minimal-invasiv) und beweist damit S4 end-to-end.
// Sieht er "bereits in einem Endzustand", laeuft noch der ALTE Stand (Deploy pending) -> Fail
// mit klarer Diagnose. DB-Verifikation (operative_status/endzustand_gesetzt_am/Timeline) laeuft
// separat per execute_sql.
// Lauf: CI=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test t3-s4-endzustand-smoke
import { test, expect, type Page } from '@playwright/test'

const ADMIN = { email: 'test-admin@claimondo.de', pw: (process.env.TEST_PASSWORT ?? '') }
const TEST_CLAIM_ID = '7601328e-1a14-4ccb-8c8e-29d1e0c4fd2d' // verwaister ersterfassung-Test-Claim (kunde=null)

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', ADMIN.email)
  await page.fill('input[type="password"], input[name="password"]', ADMIN.pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test('T3-S4: Endzustand "Abgelehnt (einfach)" laeuft erstmals durch', async ({ page }) => {
  await login(page)
  await page.goto(`/faelle/${TEST_CLAIM_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')

  // Dropdown oeffnen + "Abgelehnt" waehlen
  const trigger = page.getByRole('button', { name: 'Endzustand' })
  await expect(trigger, 'Endzustand-Trigger sichtbar (FallIdentityHeader-ActionBar)').toBeVisible({ timeout: 15_000 })
  await expect(trigger, 'Trigger darf nicht disabled sein (Claim ist aktiv)').toBeEnabled()
  await trigger.click()
  await page.getByRole('button', { name: 'Abgelehnt', exact: true }).click()

  // Modal: Pflicht-Begruendung fuellen (praeziser Placeholder-Selektor — .first() auf textarea
  // traf zuvor eine Hintergrund-Textarea der Fallakte). Ablehnungsgrund-Select behaelt Default
  // 'Verjährung'; "Art der Ablehnung" bleibt auf Vorlaeufig (non-final, nachforderbar).
  const grundFeld = page.getByPlaceholder(/VS lehnt/)
  await expect(grundFeld, 'Begruendungs-Feld im Modal').toBeVisible({ timeout: 10_000 })
  await grundFeld.fill('T3-S4 Regel-4-Smoke: einfache Ablehnung (non-terminal, nachforderbar)')

  // "Kunde informieren (WhatsApp + Email)" ABWAEHLEN — Regel 4: keine Comms aus Smokes
  // (der Test-Claim hat zwar kunde=null, aber sauber ist sauber).
  const notifyCheckbox = page.getByRole('checkbox')
  if (await notifyCheckbox.count() > 0 && await notifyCheckbox.first().isChecked()) {
    await notifyCheckbox.first().uncheck()
  }

  await page.getByRole('button', { name: 'Schaden ablehnen', exact: true }).click()

  // Erfolg = KEIN Alt-Guard-Fehler. "bereits in einem Endzustand" hiesse: alter Stand
  // deployed (S4 noch nicht live) ODER Guard-Regression.
  await expect(
    page.getByText(/bereits in einem Endzustand/i),
    'Alt-Guard-Fehler darf nicht erscheinen (sonst: S4-Deploy pending oder Regression)',
  ).toHaveCount(0, { timeout: 10_000 })
  // Modal schliesst sich bei Erfolg (grund-Feld verschwindet)
  await expect(grundFeld).toBeHidden({ timeout: 15_000 })
})
