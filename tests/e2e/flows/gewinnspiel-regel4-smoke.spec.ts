import { test, expect } from '@playwright/test'

// Regel-4-Smoke fuer das taegliche Gewinnspiel (#5561, #5584).
//
// OPERATIVES SOLL (aus der Fachlogik hergeleitet, nicht aus dem Code gelesen) —
// vollstaendig in docs/superpowers/plans/2026-08-23-gewinnspiel-operatives-soll.md:
//
//  A. Ein Admin legt eine Kampagne an, aktiviert sie und pflegt Praemien. Ohne
//     aktive Kampagne entstehen keine Teilnahmen und es wird nirgends geworben.
//  B. Wer einen unverschuldeten Unfall meldet und eine Mobilnummer hinterlaesst,
//     wird Teilnehmer UND bleibt ein ganz normaler Lead im Dispatch.
//  C. Erst die bestaetigte Mobilnummer bringt ihn in den Lostopf.
//  D. Taeglich zieht der Admin BIS ZU drei Gewinner — bei weniger Teilnehmern
//     entsprechend weniger. Wer gewonnen hat, kommt nicht erneut in den Topf.
//  E. Der Gewinner oeffnet SEINEN Link OHNE Login, waehlt ggf. die Praemie und
//     laedt einen Nachweis hoch.
//  F. Der Admin sieht Name, Kontakt und den Nachweis, entscheidet und traegt den
//     Gutschein-Code ein.
//
// WAS DIESE SPEC PRUEFT und was bewusst NICHT:
//
// Geprueft wird, was auf prod ohne Seiteneffekte pruefbar ist — die Erreichbarkeit
// und das Rendern der drei neuen Oberflaechen plus die oeffentliche Kampagnen-API.
// Das deckt genau die Fehlerklasse ab, die diese Lane zweimal getroffen hat:
// eine Route, die kompiliert und im Manifest steht, aber im echten Request nicht
// ausgeliefert wird (Middleware-Rewrite bei der LP, fehlender publicPaths-Eintrag
// bei /gewinn). Build, tsc und Unit-Tests waren dabei jedes Mal gruen.
//
// NICHT geprueft wird der schreibende Teil (Kampagne anlegen, ziehen, bestaetigen).
// Der wuerde auf prod echte Zeilen erzeugen: eine aktive Kampagne macht JEDEN
// echten Lead zum Teilnehmer, und "Willkommen senden" verschickt echte WhatsApp.
// Dieser Teil wurde lokal gegen dieselbe Datenbank durchgeklickt (24.08., mit
// inaktiver Kampagne, Vorher/Nachher-Zaehlung: kein echter Teilnehmer entstanden)
// und ist im Marker dokumentiert. Ihn hier zu automatisieren hiesse, auf prod
// Muell zu erzeugen, den anschliessend jemand aufraeumen muss — Smoke-Residue in
// Arbeitslisten ist ein bekanntes, wiederkehrendes Problem.

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
// Die Landingpage lebt im Marketing-Build auf der Hauptdomain, nicht in der App.
const MARKETING = process.env.PLAYWRIGHT_MARKETING_URL ?? 'https://claimondo.de'

async function login(page: import('@playwright/test').Page, email: string, passwort: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(passwort)
  await page.getByRole('button', { name: /anmelden|einloggen/i }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test('Admin-Oberflaeche rendert samt Kennzahlen und Kampagnen-Formular', async ({ page }) => {
  const fehler: string[] = []
  page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') fehler.push(`console: ${m.text()}`)
  })

  await login(page, 'test-admin@claimondo.de', (process.env.TEST_PASSWORT ?? ''))
  await page.goto(`${BASE}/admin/marketing/gewinnspiel`)

  // Die Seite faehrt vier Count-Queries, zwei Kontakt-Joins und erzeugt
  // signierte Storage-URLs. Ein Fehler darin zeigt sich als leerer Bereich oder
  // Fehlerscreen, nicht im HTTP-Status.
  await expect(page.getByRole('heading', { name: /Gewinnspiel/i }).first()).toBeVisible()
  await expect(page.getByText(/Heute/).first()).toBeVisible()
  await expect(page.getByText(/Kampagne/).first()).toBeVisible()

  expect(fehler, `Seitenfehler auf der Admin-Oberflaeche:\n${fehler.join('\n')}`).toEqual([])
})

test('Gewinnspiel ist ueber die Marketing-Kachel erreichbar (UI-Einstieg)', async ({ page }) => {
  await login(page, 'test-admin@claimondo.de', (process.env.TEST_PASSWORT ?? ''))
  await page.goto(`${BASE}/admin/marketing`)

  // Audit-Punkt 2: ein Feature ohne sichtbaren Einstieg existiert praktisch nicht.
  const kachel = page.getByRole('link', { name: /Gewinnspiel/i }).first()
  await expect(kachel).toBeVisible()
  await kachel.click()
  await page.waitForURL(/\/admin\/marketing\/gewinnspiel/, { timeout: 30_000 })
})

test('Kampagnen-API antwortet oeffentlich und formgerecht', async ({ request }) => {
  // Speist Praemien-Auswahl, Faecher und spaeter die Topbar in SIEBEN Builds.
  // Faellt sie aus, rendern die Consumer ohne Kampagne weiter — genau deshalb
  // muss sie auch ohne aktive Kampagne 200 liefern, nicht 404 oder 500.
  const res = await request.get(`${BASE}/api/kampagne/aktiv`)
  expect(res.status()).toBe(200)

  const body = await res.json()
  expect(body).toHaveProperty('aktiv')
  expect(typeof body.aktiv).toBe('boolean')
  if (body.aktiv) {
    expect(Array.isArray(body.praemien)).toBe(true)
    expect(body.topbar).toBeDefined()
  }
})

test('Gewinnerseite ist OHNE Login erreichbar (der eigentliche Regressionsfall)', async ({
  browser,
}) => {
  // #5584: /gewinn/[token] fehlte in publicPaths -> 307 auf /login. Der Gewinner
  // kommt aus einer WhatsApp und ist NIE eingeloggt; die Einloese-Strecke war
  // damit tot. Ein eingeloggter Lauf haette das NICHT gezeigt — deshalb hier
  // bewusst ein frischer Kontext ohne jede Session.
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  const res = await page.goto(`${BASE}/gewinn/regel4-smoke-ungueltiges-token`)

  // Kein Redirect auf /login: das ist die Aussage dieses Tests.
  expect(page.url(), 'Gewinnerseite darf nicht auf /login umleiten').not.toContain('/login')
  // Ein ungueltiges Token zeigt die Not-Found-Seite. Der Status darf 404 oder
  // 200 sein — Next liefert bei notFound() je nach Build-Modus unterschiedlich;
  // die Aussage hier ist die ERREICHBARKEIT, nicht der Statuscode.
  expect([200, 404]).toContain(res?.status() ?? 0)

  await ctx.close()
})

test('Gewinnspiel-Landingpage ist oeffentlich erreichbar und traegt das Formular', async ({
  browser,
}) => {
  // Lag zuerst ausserhalb von app/[locale]/ und waere 404 gelaufen, obwohl Build,
  // tsc und Routen-Manifest gruen waren (die Middleware rewritet auf /de/<pfad>).
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  const res = await page.goto(`${MARKETING}/gewinnspiel`)
  expect(res?.status(), 'LP muss anonym 200 liefern').toBe(200)

  await expect(page.getByRole('heading', { name: /gewinnen/i }).first()).toBeVisible()
  // Pflichtangaben aus Spec 6.1/6.3: getrennte Telefon-Einwilligung + Hinweis auf
  // die Teilnahmebedingungen. Fehlen sie, ist die Seite rechtlich nicht startklar.
  await expect(page.getByText(/telefonisch/i).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /Teilnahmebedingungen/i }).first()).toBeVisible()

  await ctx.close()
})

test('Teilnahmebedingungen sind erreichbar und nennen die Pflichtangaben', async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  const res = await page.goto(`${MARKETING}/gewinnspiel/teilnahmebedingungen`)
  expect(res?.status()).toBe(200)

  const text = await page.locator('body').innerText()
  // "bis zu" ist die entscheidende Formulierung: bei weniger Teilnehmern als
  // Preisen waere eine Zusage von genau drei Gewinnern nicht erfuellbar.
  expect(text).toMatch(/bis zu drei/i)
  expect(text).toMatch(/Rechtsweg/i)
  expect(text).toMatch(/Meta|TikTok/i)

  await ctx.close()
})
