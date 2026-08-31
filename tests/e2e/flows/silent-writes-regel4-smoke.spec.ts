import { test, expect } from '@playwright/test'

// Regel-4-Smoke fuer die Stille-Write-Serie (#5320 → #5373).
//
// OPERATIVES SOLL (aus der Fachlogik, nicht aus dem Code):
//  1. Ein Gutachter oeffnet sein Profil. Er sieht seine Stammdaten und — sofern
//     vorhanden — offene Terminanfragen mit Zusage/Absage. Nichts an der Seite
//     bricht; eine fehlgeschlagene Zusage wuerde ihm gemeldet, statt als Erfolg
//     durchzugehen.
//  2. Ein Kunde oeffnet sein Portal. Die Startseite zeigt seine Vorgaenge. War er
//     zuvor "kalt", gilt er danach als reaktiviert — und das Team erfaehrt das
//     EINMALIG, nicht bei jedem Aufruf erneut.
//
// Warum genau diese zwei Seiten: Sie tragen die einzigen Aenderungen der Serie mit
// Laufzeit-Risiko jenseits reiner Fehlerpfade — ein neuer `sonner`-Import in einer
// Client-Komponente (Profil) und ein `continue` in einer Server-Component-Schleife
// (Kunde-Portal). Die uebrigen Aenderungen greifen ausschliesslich, wenn ein Write
// fehlschlaegt; auf prod nachgemessen passiert das praktisch nie.
//
// Test-Konten mit telefon = NULL -> es gehen keine echten Nachrichten raus.

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'

async function login(page: import('@playwright/test').Page, email: string, passwort: string) {
  await page.goto(`${BASE}/login`)
  // `.first()` haette hier gereicht, ist aber nur so lange richtig, wie der Toggle-Button
  // des PasswordInput (aria-label="Passwort anzeigen") im DOM NACH dem Feld steht — er
  // matcht /passwort/i ebenfalls. Eindeutiger Selektor statt Reihenfolge-Annahme.
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(passwort)
  await page.getByRole('button', { name: /anmelden|einloggen/i }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test('Gutachter-Profil rendert samt Terminanfrage-Bereich (neuer sonner-Import)', async ({ page }) => {
  const fehler: string[] = []
  page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') fehler.push(`console: ${m.text()}`)
  })

  await login(page, 'test-sv@claimondo.de', (process.env.TEST_PASSWORT ?? ''))
  await page.goto(`${BASE}/gutachter/profil`)
  // ⚠ 23.08.: `waitForLoadState('networkidle')` hier ENTFERNT — es war der Grund, warum
  // dieser Test im nightly rot lief ("Test timeout of 30000ms exceeded" beim Warten).
  // Im eingeloggten Portal wird das Netz NIE still (Realtime-Subscriptions + Polling),
  // `networkidle` ist dort strukturell unerreichbar. Der Page-Snapshot des Fehlschlags
  // zeigte die Seite vollstaendig gerendert — es hing nur das Warten.
  // Playwright raet von `networkidle` ohnehin ab; die Bereitschaft prueft die Assertion
  // unten mit eigenem Timeout, und `page.goto()` wartet bereits auf `load`.

  // Die Seite muss echten Inhalt zeigen, keine leere Shell (Redirect-Stub-Klasse).
  await expect(page.locator('body')).toContainText(/profil|stammdaten|gutachter/i, { timeout: 20_000 })

  // Ein fehlender/kaputter Import wuerde hier als pageerror auflaufen.
  const echteFehler = fehler.filter((f) => !/favicon|third-party|net::ERR_/i.test(f))
  expect(echteFehler, `Laufzeitfehler auf /gutachter/profil:\n${echteFehler.join('\n')}`).toHaveLength(0)
})

test('Gutachter bestaetigt eine Terminanfrage — die Zusage wirkt (RLS-Row-Check)', async ({ page }) => {
  const fehler: string[] = []
  page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`))

  await login(page, 'test-sv@claimondo.de', (process.env.TEST_PASSWORT ?? ''))
  await page.goto(`${BASE}/gutachter/profil`)
  // `networkidle` entfernt (Begruendung s. Test oben). ⚠ Hier ist der Ersatz NICHT
  // optional: das `isVisible()` unten wartet NICHT. Ohne eine vorgelagerte
  // Bereitschafts-Assertion waere es auf einer noch ladenden Seite `false` — der Test
  // wuerde dann still skippen ("keine Anfrage da") statt zu pruefen. Genau die Sorte
  // Skip, die wie ein Erfolg aussieht.
  await expect(page.locator('body')).toContainText(/profil|stammdaten|gutachter/i, { timeout: 20_000 })

  // Ausgangszustand: der geseedete Termin steht als Anfrage da. Ohne Seed gibt es
  // nichts zu bestaetigen -> sauber skippen statt rot laufen (der e2e-Job laeuft
  // sequenziell; eine rote Spec reisst die uebrigen Journey-Smokes mit).
  const bestaetigen = page.getByRole('button', { name: 'Bestätigen' }).first()
  const hatAnfrage = await bestaetigen.isVisible().catch(() => false)
  test.skip(
    !hatAnfrage,
    'Keine offene Terminanfrage — vorher scripts/smoke/silent-writes-terminzusage-seed.mjs laufen lassen (local-only Prod-Smoke)',
  )

  await bestaetigen.click()

  // Soll: Nach der Zusage ist die Anfrage verschwunden (sie ist bestaetigt, also nicht
  // mehr "pending"). Bliebe sie stehen, haette der Row-Check faelschlich Fehler gemeldet
  // — genau das Risiko des neu angehaengten .select().
  await expect(page.getByRole('button', { name: 'Bestätigen' })).toHaveCount(0, { timeout: 20_000 })

  expect(fehler, `Laufzeitfehler bei der Zusage:\n${fehler.join('\n')}`).toHaveLength(0)
})

test('Kunde-Portal rendert (Reaktivierungs-Schleife mit continue)', async ({ page }) => {
  const fehler: string[] = []
  page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`))

  await login(page, 'smoke-kunde@claimondo.de', (process.env.TEST_PASSWORT ?? ''))
  await page.goto(`${BASE}/kunde`)
  // `networkidle` entfernt (Begruendung s. erster Test) — die Assertion unten prueft
  // die Bereitschaft mit eigenem Timeout.

  await expect(page.locator('body')).toContainText(/fall|vorgang|schaden|willkommen/i, { timeout: 20_000 })
  expect(fehler, `Laufzeitfehler auf /kunde:\n${fehler.join('\n')}`).toHaveLength(0)
})
