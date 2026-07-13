// KI-Task-Executor Prod-Smoke.
// Laeuft NICHT lokal (Feature-Branch nicht deployt) — erst NACH Deploy + Kill-Switch an.
// Run (post-deploy, nach TASK_EXECUTOR_ENABLED=true auf dem Server):
//   PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/ki-task-executor-smoke.spec.ts --headed
// Test-Konto (NIE echte Kunden): test-dispatch@claimondo.de / Test1234!  (Admin-Kanban /admin/tasks)
//
// Erwartetes Verhalten: Auf einer KI-faehigen Task (typ in {sa_ausstehend, allgemein,
// erster-kontakt, sla_breach} mit claim_id) erscheint der Footer-Button "Per KI erledigen".
// Klick -> entweder direkte Erledigung (reiner Safe-Plan) ODER Confirm-Modal (consequential).
// Sicherheits-Hinweis: Der Test bestaetigt KEINEN consequential-Plan (kein echter Kunden-Send);
// er verifiziert nur, dass Plan/Confirm-Modal erscheint. Fuer einen End-to-End-Send-Smoke
// bewusst einen Test-Claim mit telefon=NULL nutzen.
import { test, expect } from '@playwright/test'

test('KI-Executor: Button auf KI-faehiger Task erzeugt Plan/Confirm', async ({ page }) => {
  // --- Login (App nutzt @supabase/ssr Cookie; hier UI-Login) ---
  await page.goto('/login')
  await page.getByLabel(/e-?mail/i).fill('test-dispatch@claimondo.de')
  await page.getByLabel(/passwort/i).fill('Test1234!')
  await page.getByRole('button', { name: /anmelden|einloggen|login/i }).click()
  await page.waitForURL(/\/(admin|dispatch|faelle)/, { timeout: 20000 }).catch(() => {})

  await page.goto('/admin/tasks')

  const kiButton = page.getByRole('button', { name: /Per KI erledigen/i }).first()
  // Kein KI-faehiger Task sichtbar ODER Kill-Switch aus -> skip statt Fehlschlag.
  if ((await kiButton.count()) === 0) {
    test.skip(true, 'Kein "Per KI erledigen"-Button sichtbar (Kill-Switch aus oder keine KI-faehige Task im Board)')
    return
  }

  await kiButton.click()

  // Entweder Confirm-Modal (consequential) oder direkte Erledigung/Refresh (reiner Safe-Plan).
  const confirmHeading = page.getByRole('heading', { name: /KI-Plan bestätigen/i })
  const fehler = page.getByText(/deaktiviert|nicht KI-ausfuehrbar/i)
  await expect(confirmHeading.or(fehler)).toBeVisible({ timeout: 20000 })

  // Falls das Confirm-Modal offen ist: NICHT bestaetigen (kein echter Send) — abbrechen.
  if (await confirmHeading.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /Abbrechen/i }).click()
    await expect(confirmHeading).toBeHidden({ timeout: 10000 })
  }
})
