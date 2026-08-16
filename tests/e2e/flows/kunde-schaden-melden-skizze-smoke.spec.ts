// Regel-4-Smoke fuer #5249 — Unfallskizze im KUNDEN-Einstieg.
//
// SOLL (aus der Fachlogik, nicht aus dem Code): Schildert ein Kunde bei der Schadenmeldung
// den Unfallhergang, entsteht daraus automatisch eine Unfallskizze — ohne manuellen Anstoss
// im Dispatch. Die Skizze ist spaeter Grundlage fuer Gutachten und Regulierung.
//
// WARUM DIESER SMOKE: Der Skizzen-Generator war gebaut und TOT — 18 Leads mit Hergang,
// 0 mit Skizze. #5238 haengte ihn an den Dispatch-Weg, #5249 an `createLead` (den
// dokumentierten Funnel, den auch `/kunde/schaden-melden` nutzt).
//
// Der Regel-4-Nachweis dafuer wurde am 13.08. bereits per Hand gefuehrt (936-Byte-Skizze,
// ein Wizard-Durchgang, 0 Residue). Diese Spec macht ihn WIEDERHOLBAR — der Handlauf war
// ad hoc und hinterliess nichts, womit sich eine Regression spaeter fangen liesse.
//
// ⚠ Lehrreich: Am Bestand ist der Fix NICHT ablesbar — seit dem 13.08. steht prod bei
// 0 Leads mit Hergang, gerade WEIL jener Smoke sauber aufgeraeumt hat. Ein leeres
// Zeitfenster ist kein Befund; wer daraus "ungeprueft" liest, misst das Aufraeumen.
//
// ⚠ Der Skizzen-Lauf ist FIRE-AND-FORGET (Claude-Call, 5–15 s). Die UI ist deshalb
// schon fertig, bevor die Skizze steht — der Beweis liegt im DB-Zustand, nicht im Toast.
// Die Assertion hier deckt den UI-Teil ab; die Skizze wird nach dem Lauf per SQL geprueft
// (Kennzeichen-Marker unten macht den Lead eindeutig auffindbar).
//
// Opt-in, damit der CI-e2e-Job nicht bei jedem Push einen echten Claude-Call ausloest:
//   PLAYWRIGHT_BASE_URL=https://app.claimondo.de RUN_SKIZZE_SMOKE=1 \
//     npx playwright test kunde-schaden-melden-skizze --workers=1

import { test, expect } from '@playwright/test'

const KUNDE_EMAIL = 'smoke-kunde@claimondo.de'
const KUNDE_PW = 'Claimondo2026!'

// Eindeutiger Marker: macht den Lead in der DB auffindbar und beim Aufraeumen
// unverwechselbar. `SMOKE-D2` folgt der Praefix-Konvention der uebrigen Seeds.
const MARKER = `SMOKE-D2 ${Date.now().toString().slice(-6)}`

// Klassischer Auffahrunfall — gut skizzierbar und lang genug fuer die Mindestlaenge,
// die erzeugeSkizzeFuerLead prueft.
const HERGANG =
  'Ich stand an einer roten Ampel auf der Aachener Straße in Köln. ' +
  'Der Fahrer hinter mir bremste zu spät und fuhr auf mein Heck auf. ' +
  'Beide Fahrzeuge waren danach noch fahrbereit, die Polizei kam nicht dazu.'

// Eine Korrektur, die die Skizze inhaltlich veraendern MUSS — sonst beweist der Lauf nur,
// dass ein Formular absendbar ist, nicht dass die Korrektur wirkt.
const KORREKTUR = 'Der andere Wagen kam von rechts aus einer Seitenstraße, nicht von hinten.'

test('Kunde meldet Schaden mit Hergang — Meldung geht durch', async ({ page }) => {
  test.skip(!process.env.RUN_SKIZZE_SMOKE, 'Opt-in: RUN_SKIZZE_SMOKE=1 (loest einen echten Claude-Call aus)')

  // Login-Muster wie in reparatur-weg-e2e-smoke.spec.ts. `button[type=submit]` ist HIER
  // sicher (auf /login existiert die Abmelden-Form der Navigation noch nicht) — auf einer
  // eingeloggten Seite waere `.first()` dagegen der Abmelden-Button.
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', KUNDE_EMAIL)
  await page.fill('input[type="password"], input[name="password"]', KUNDE_PW)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })

  await page.goto('/kunde/schaden-melden')
  await expect(page.locator('#hergang')).toBeVisible({ timeout: 20_000 })

  await page.getByLabel('Kennzeichen').fill(MARKER)
  await page.getByLabel('PLZ des Schadenorts').fill('50667')
  await page.locator('#hergang').fill(HERGANG)

  await page.getByRole('button', { name: 'Schaden melden' }).click()

  // Erfolg = die Meldung ist angenommen. Der Kunde verlaesst das Formular; welche
  // Zielseite genau folgt, ist fuer das Soll unerheblich — entscheidend ist, dass
  // das Formular nicht stehen bleibt.
  await expect(page.locator('#hergang')).toBeHidden({ timeout: 30_000 })

  console.log(`[skizze-smoke] Lead angelegt mit Kennzeichen-Marker: ${MARKER}`)
})

// D2 (#5311): Der Kunde MUSS die Skizze in seiner Fallakte sehen — als Entwurf, mit
// Korrekturmoeglichkeit. Bis 16.08. sah sie nur Dispatch.
//
// Warum die Claim-Id per ENV und nicht ueber die Fall-Liste erklickt: Die Skizze entsteht
// asynchron (5-15 s nach der Meldung), der vorige Test kann also nicht direkt weiterlaufen.
// Die Id kommt aus der DB-Pruefung dazwischen — genau die Stelle, an der man ohnehin
// verifiziert, dass die Skizze den CLAIM erreicht hat (und nicht nur den Lead).
//   SKIZZE_CLAIM_ID=<uuid> RUN_SKIZZE_SMOKE=1 npx playwright test kunde-schaden-melden-skizze
test('Kunde sieht die Unfallskizze als Entwurf in seiner Fallakte', async ({ page }) => {
  test.skip(!process.env.RUN_SKIZZE_SMOKE, 'Opt-in: RUN_SKIZZE_SMOKE=1')
  const claimId = process.env.SKIZZE_CLAIM_ID
  test.skip(!claimId, 'SKIZZE_CLAIM_ID fehlt — Id des Claims mit Skizze aus der DB setzen')

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', KUNDE_EMAIL)
  await page.fill('input[type="password"], input[name="password"]', KUNDE_PW)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })

  await page.goto(`/kunde/faelle/${claimId}`)

  // Die Card traegt die Ueberschrift; das SVG selbst wird inline gerendert.
  await expect(page.getByText('Unfallskizze', { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  })
  // Der Entwurfs-Charakter MUSS erkennbar sein — eine ungepruefte KI-Zeichnung, die wie
  // eine amtliche Feststellung aussieht, waere schlimmer als keine.
  await expect(page.getByText(/Entwurf/i).first()).toBeVisible({ timeout: 10_000 })
  // Und der Widerspruchsweg muss offenstehen.
  await expect(page.getByRole('button', { name: /stimmt nicht/i })).toBeVisible({ timeout: 10_000 })

  console.log('[skizze-smoke] Fallakte zeigt Skizze + Entwurfs-Hinweis + Korrektur-Button')

  // Zweiter Teil des Solls: Der Widerspruch muss ANKOMMEN. Gemessen wird am DB-Zustand
  // (neue `unfallskizze_generiert_am` + Dispatch-Aufgabe), nicht am Toast — Toasts sind
  // fluechtig und ein Body-Poll auf „Unfallskizze" ist sofort erfuellt (so heisst die Card).
  await page.getByRole('button', { name: /stimmt nicht/i }).click()
  await page.locator('#skizze-korrektur').fill(KORREKTUR)
  await page.getByRole('button', { name: /Korrektur senden/i }).click()

  // Die Neugenerierung laeuft im Request (Sprachmodell, 5-15 s) — der Button bleibt
  // solange im Lade-Zustand. Erfolg = das Formular schliesst sich wieder.
  await expect(page.locator('#skizze-korrektur')).toBeHidden({ timeout: 60_000 })
  console.log('[skizze-smoke] Korrektur gesendet — DB-Gegenprobe: neue skizze_generiert_am + Task')
})
