// KI-Task-Executor Prod-Smoke.
// Laeuft NICHT lokal (Feature-Branch nicht deployt) — erst NACH Deploy + Kill-Switch an.
// Run (post-deploy, nach TASK_EXECUTOR_ENABLED=true auf dem Server):
//   PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/ki-task-executor-smoke.spec.ts --headed
// Test-Konto (NIE echte Kunden): test-admin@claimondo.de / Claimondo2026!  (Admin-Kanban /admin/tasks)
// ⚠ 21.08. korrigiert: hier stand test-dispatch@. Diese Rolle kommt gar nicht auf das
// Admin-Kanban — /admin/tasks leitet sie auf /dispatch/dashboard um. Gemessen auf prod:
//   dispatch -> /dispatch/dashboard    "Per KI erledigen"-Buttons: 0
//   admin    -> /admin/aufgaben/alle   "Per KI erledigen"-Buttons: 222
// Der Test haette also selbst nach dem Selektor-Fix nur noch still geskippt („kein
// KI-faehiger Task sichtbar") statt zu pruefen.
//
// Erwartetes Verhalten: Auf einer KI-faehigen Task (typ in {sa_ausstehend, allgemein,
// erster-kontakt, sla_breach} mit claim_id) erscheint der Footer-Button "Per KI erledigen".
// Klick -> entweder direkte Erledigung (reiner Safe-Plan) ODER Confirm-Modal (consequential).
// Sicherheits-Hinweis: Der Test bestaetigt KEINEN consequential-Plan (kein echter Kunden-Send);
// er verifiziert nur, dass Plan/Confirm-Modal erscheint. Fuer einen End-to-End-Send-Smoke
// bewusst einen Test-Claim mit telefon=NULL nutzen.
import { test, expect } from '@playwright/test'

test('KI-Executor: Button auf KI-faehiger Task erzeugt Plan/Confirm', async ({ page }) => {
  // ⚠ Der Default von 30 s reicht fuer diesen Test NICHT: UI-Login (~10 s) + Navigation
  // + Redirect /admin/tasks -> /admin/aufgaben/alle + Klick + bis zu 20 s Warten auf das
  // Plan-Modal summieren sich darueber hinaus. Gemessen 26.08.: der Lauf starb mit
  // „locator.click: Test timeout of 30000ms exceeded" — also im GESAMT-Timeout, nicht am
  // Button. Ein Waechter, der aus Zeitmangel rot wird, ist so wertlos wie ein stiller.
  test.setTimeout(90_000)

  // --- Login (App nutzt @supabase/ssr Cookie; hier UI-Login) ---
  await page.goto('/login')
  // ⚠ NICHT getByLabel(/passwort/i): das trifft ZWEI Elemente — das Eingabefeld UND den
  // Toggle-Button des PasswordInput, der `aria-label="Passwort anzeigen"` traegt. Playwright
  // wirft darauf eine strict-mode-violation, und der Test stirbt vor dem eigentlichen
  // Pruefgegenstand (gemessen 21.08. auf prod: 2 Treffer, davon [1] = <button>).
  // `input[type=...]`/`name=...` trifft jeweils genau eins — dasselbe Muster wie in
  // tests/e2e/fixtures.ts und onboarding-pflichtdok.
  await page.locator('input[type="email"], input[name="email"]').first().fill('test-admin@claimondo.de')
  await page.locator('input[type="password"], input[name="password"]').first().fill('Claimondo2026!')
  await page.getByRole('button', { name: /anmelden|einloggen|login/i }).click()
  await page.waitForURL(/\/(admin|dispatch|faelle)/, { timeout: 20000 }).catch(() => {})

  await page.goto('/admin/tasks') // 308 -> /admin/aufgaben/alle

  // ⚠ 26.08.: Der Login-`waitForURL` schluckt sein Timeout (`.catch`). Schlaegt die
  // Anmeldung fehl, landet der Test auf /login — dort gibt es naturgemaess 0
  // „Per KI erledigen"-Buttons, und der Skip unten erklaerte einen AUTH-Fehler zum
  // „keine KI-faehige Task". Deshalb hier eine harte Zusicherung, BEVOR gezaehlt wird:
  // nur so unterscheidet der Skip weiter unten echten Datenmangel von „gar nicht drin".
  await expect(page, 'Login fehlgeschlagen — nicht auf der Admin-Aufgabenliste gelandet').toHaveURL(
    /\/admin\/aufgaben/,
    { timeout: 20000 },
  )

  const kiButton = page.getByRole('button', { name: /Per KI erledigen/i }).first()
  // Erst JETZT ist ein Zaehlerstand von 0 aussagekraeftig: eingeloggt, richtige Seite,
  // trotzdem kein Button -> Kill-Switch aus oder keine KI-faehige Task im Board.
  if ((await kiButton.count()) === 0) {
    test.skip(true, 'Kein "Per KI erledigen"-Button sichtbar (Kill-Switch aus oder keine KI-faehige Task im Board)')
    return
  }

  await kiButton.click()

  // Entweder Confirm-Modal (consequential) oder direkte Erledigung/Refresh (reiner Safe-Plan).
  const confirmHeading = page.getByRole('heading', { name: /KI-Plan bestätigen/i })
  const fehler = page.getByText(/deaktiviert|nicht KI-ausfuehrbar/i)
  // ⚠ Wenn hier NICHTS erscheint, ist der haeufigste Grund NICHT der Selektor (der wurde
  // am 21.08. schon einmal korrigiert), sondern eine tote Anthropic-API: ohne Guthaben
  // entsteht kein Plan, also kein Modal, also Timeout. Gegenprobe in einer Zeile:
  //   curl https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" \
  //     -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  //     -d '{"model":"claude-haiku-4-5","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
  // HTTP 400 „credit balance is too low" -> Guthaben aufladen, nicht am Test schrauben.
  await expect(
    confirmHeading.or(fehler),
    'Kein KI-Plan/Confirm-Modal nach Klick. Zuerst das Anthropic-Guthaben pruefen (Probe-Call im Kommentar oben) — ohne API entsteht kein Plan.',
  ).toBeVisible({ timeout: 20000 })

  // Falls das Confirm-Modal offen ist: NICHT bestaetigen (kein echter Send) — abbrechen.
  if (await confirmHeading.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /Abbrechen/i }).click()
    await expect(confirmHeading).toBeHidden({ timeout: 10000 })
  }
})
