import { test, expect } from '@playwright/test'

// GEO-P2 SP2 (NPS-Capture) — Regression-Guard für den Middleware-Fix #5035.
// Assertion: die anon NPS-Response-Route ist OHNE Login erreichbar (kein 307 -> /login) und
// rendert die Seite (Error-Card bei ungültigem Token, kein Crash). Vor #5035 leitete die
// Auth-Middleware /kunde-nps/* auf /login um -> der Kunde konnte nicht bewerten.
// Der Submit-Pfad selbst ist unit-getestet (src/lib/nps/nps.test.ts) + manuell prod-gesmoked
// (08.08.: rating=9 in kunde_feedback via echtem Cron-Token). Ein voller e2e-Submit bräuchte
// einen frisch geseedeten Token (Cron/DB) — bewusst nicht in diesem Guard.

test('SP2: /kunde-nps/[token] ist anon erreichbar (kein /login-Redirect) + rendert', async ({ page }) => {
  const path = '/kunde-nps/invalid-token-regression-guard'
  const resp = await page.goto(path, { waitUntil: 'domcontentloaded' })

  // NICHT auf /login umgeleitet (das war der #5035-Bug):
  expect(new URL(page.url()).pathname).toBe(path)
  expect(resp?.status()).toBe(200)
  // Error-Card (ungültiger Token) — Seite rendert sauber, kein 500:
  await expect(page.getByText(/ungültig|abgelaufen|nicht mehr gültig/i).first()).toBeVisible()
})
