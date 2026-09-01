import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// Onboarding + Pflichtdokumente — Layer-2 Lifecycle/Rollen-Smoke (26.06.2026).
//
// Deckt ab: (1) Public-Wizard /gutachter-finden -> SMOKE-Lead (Entry-to-Lead,
// service_typ=nur_gutachter um Kanzlei-Push-Spam zu vermeiden), (2) alle
// Rollen-Portale erreichbar + fehlerfrei (Kunde/SV/KB/Dispatch/Kanzlei/Admin).
//
// Die Pflichtdokument-KORREKTHEIT (welche Docs je nach Eingabe) wird
// deterministisch in Layer 1 geprueft:
//   src/lib/dokumente/pflichtdok-konsistenz.test.ts
// weil die Conditional-Flags (Leasing/Personenschaden) ueber mehrere
// Onboarding-Schritte/Rollen eingegeben werden — ein reiner UI-E2E pro
// Conditional waere bruechig. Dieser Layer-2 prueft den Lifecycle + Rollen.
//
// Run (staging):
//   PLAYWRIGHT_BASE_URL=https://app.staging.claimondo.de \
//     STAGING_BASIC_USER=aaroncmdo STAGING_BASIC_PASS='<pass>' \
//     npx playwright test onboarding-pflichtdok --workers=1
//
// Schreibt einen gestellten SMOKE-Lead auf die geteilte DB (Aaron-sanktioniert).

const SCREENSHOT_DIR = path.resolve(
  __dirname, '..', '..', '..', 'docs', '26.06.2026', 'onboarding-pflichtdok-smoke', 'screens',
)
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const BASIC_USER = process.env.STAGING_BASIC_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_PASS ?? ''
const IS_LOCAL = BASE.startsWith('http://localhost') || BASE.startsWith('http://127.')
// Nur STAGING liegt hinter nginx-Basic-Auth. Der Skip unten hing bis 23.08. an
// `!IS_LOCAL` und behandelte damit PROD wie staging: wer diese Spec lokal gegen
// app.claimondo.de fuhr — also genau den Lauf, den Regel 4 vorschreibt — bekam einen
// STILLEN Skip statt eines Ergebnisses. In CI faellt das nicht auf, weil dort
// STAGING_BASIC_PASS gesetzt ist. Gemessen 23.08.: mit gesetzter Variable lief der
// Test gegen prod in 7,4 s durch (1 passed) — es fehlte also nur das Gate, nicht die
// Lauffaehigkeit. Gleiche Klasse wie der webServer-Fix in #5512: die Bedingung prueft
// jetzt, ob das ZIEL Basic-Auth braucht, statt ob es "nicht localhost" ist.
const BRAUCHT_BASIC_AUTH = /staging/i.test(BASE)
const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)

let stepIdx = 0
async function shot(page: Page, name: string) {
  stepIdx += 1
  const f = `${String(stepIdx).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, f), fullPage: true }).catch(() => {})
  console.log(`[SHOT] ${f}`)
}

// Gate nur auf pageerror (uncaught JS-Exceptions = echte Defekte). Resource-404
// console.errors (Favicon/Beacon/optionale Assets) werden geloggt, gaten aber nicht.
function wireConsole(page: Page, tag: string) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (e) => { pageErrors.push(e.message); console.log(`[${tag} pageerror] ${e.message}`) })
  page.on('console', (msg) => { if (msg.type() === 'error') { consoleErrors.push(msg.text()); console.log(`[${tag} console.error] ${msg.text()}`) } })
  return { pageErrors, consoleErrors }
}

async function dismissCookie(page: Page) {
  await page.locator('.CookieConsent button, [class*="CookieConsent"] button').first()
    .click({ timeout: 4_000 }).catch(() => {})
}

async function login(page: Page, email: string, password: string): Promise<boolean> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {})
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(password)
  await page.locator('button[type="submit"]').first().click()
  return page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
    .then(() => true).catch(() => false)
}

test.use({
  baseURL: BASE,
  httpCredentials: BASIC_PASS && !IS_LOCAL ? { username: BASIC_USER, password: BASIC_PASS } : undefined,
  viewport: { width: 1400, height: 900 },
})

function field(page: Page, key: string) {
  return page.locator(`[data-testid="feld-${key}"]:visible`).first()
}

test('Phase 1: Public /gutachter-finden lädt + Wizard-Einstieg + fehlerfrei', async ({ page }) => {
  test.setTimeout(90_000)
  if (BRAUCHT_BASIC_AUTH && !BASIC_PASS) test.skip(true, 'STAGING_BASIC_PASS nicht gesetzt (Ziel = staging)')
  const { pageErrors, consoleErrors } = wireConsole(page, 'gf')

  await page.goto('/gutachter-finden', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(2500)
  await shot(page, 'gf-initial')

  // Wizard öffnen (location-first Overhaul; Event-getrieben). Best-effort —
  // der volle Submit-Flow ist Map/Geo-abhängig und in smoke-vollstrecke abgedeckt.
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('claimondo:open-wizard', { detail: {} })),
  ).catch(() => {})
  await page.waitForTimeout(1500)

  const wizardDa = await field(page, 'besichtigungsort')
    .isVisible({ timeout: 25_000 }).catch(() => false)
  await shot(page, wizardDa ? 'wizard-offen' : 'wizard-nicht-auto-sichtbar')
  console.log(`[1] Wizard-Einstieg (besichtigungsort) sichtbar: ${wizardDa}`)

  // Hard-Gate: keine uncaught JS-Exceptions. Resource-404s (benign) nur loggen.
  console.log(`[1] console.errors (benign, z.B. Resource-404): ${consoleErrors.length}`)
  expect(pageErrors, `Uncaught JS-Errors auf /gutachter-finden:\n${pageErrors.join('\n')}`).toHaveLength(0)
  if (!wizardDa) {
    console.log('[1] HINWEIS: Wizard-Einstieg nicht auto-sichtbar — Map/Geo-Interaktion nötig (manueller/Phase-1-Voll-Smoke via smoke-vollstrecke).')
  }
})

// Rollen-Portal-Erreichbarkeit: jede Rolle einloggen + Portal lädt fehlerfrei.
// ⚠ Die Defaults waren fuer 3 von 4 Rollen FALSCH — nachgemessen 20.08. gegen prod:
//   SV       <PASSWORT: GitHub-Secret>            -> richtig <PASSWORT: GitHub-Secret>   (Login -> /gutachter/heute)
//   KB       test-kb-anna@ + TestKB2026!  -> der Account EXISTIERT NICHT; richtig ist
//            test-kb@claimondo.de + <PASSWORT: GitHub-Secret>            (Login -> /mitarbeiter)
//   Kanzlei  <PASSWORT: GitHub-Secret>            -> richtig <PASSWORT: GitHub-Secret>   (Login -> /kanzlei/mandate)
//   Dispatch <PASSWORT: GitHub-Secret>            -> war als einziges korrekt
// Konvention (memory/reference-internal-test-account-logins.md): test-*@ = <PASSWORT: GitHub-Secret>,
// AUSNAHME test-dispatch = <PASSWORT: GitHub-Secret>. Genau diese Ausnahme wurde offenbar verallgemeinert.
// Folge: die betroffenen Rollen loggten nie ein, der Test uebersprang sich (siehe unten)
// und war deshalb GRUEN — er hat die Portale seit jeher nicht geprueft.
// ENV-Override bleibt vorrangig; fuer SV existiert ein CI-Secret (ci.yml), fuer KB/Kanzlei nicht.
const ROLLEN: Array<{ name: string; email: string; pass: string; pfad: string; marker: RegExp }> = [
  { name: 'SV', email: process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de', pass: process.env.TEST_SV_PASSWORD ?? '', pfad: '/gutachter', marker: /gutachter|fälle|aufträge|termine/i },
  { name: 'KB', email: process.env.TEST_KB_EMAIL ?? 'test-kb@claimondo.de', pass: process.env.TEST_KB_PASSWORD ?? '', pfad: '/mitarbeiter', marker: /dashboard|fälle|aufgaben/i },
  { name: 'Dispatch', email: process.env.TEST_DISPATCH_EMAIL ?? 'test-dispatch@claimondo.de', pass: process.env.TEST_DISPATCH_PASSWORD ?? '', pfad: '/dispatch', marker: /leads|kalender|karte|gutachter/i },
  { name: 'Kanzlei', email: process.env.TEST_KANZLEI_EMAIL ?? 'test-kanzlei@claimondo.de', pass: process.env.TEST_KANZLEI_PASSWORD ?? '', pfad: '/kanzlei', marker: /fälle|mandat|kanzlei/i },
]

// ⚠ Browser-Zeitzone FEST auf UTC — das ist kein Detail, sondern die Bedingung, unter der
// diese Portal-Pruefung ueberhaupt etwas sieht.
//
// Der prod-Node laeuft mit `TZ=Europe/Berlin` (pm2 id 862), GitHub-Runner laufen in UTC.
// Jede Client-Component, die ein Datum ohne `timeZone` formatiert, rendert dadurch
// server-seitig zwei Stunden anders als im CI-Browser → React-#418-Hydration-Fehler.
// Genau das faerbte den nightly seit dem 06.08. rot (EmbedBKlaerungCard: Server
// „Mi., 05.08., 10:00" gegen Client „08:00").
//
// ⭐⭐ Warum es so lange dauerte: Ein Entwickler-Browser steht in Europe/Berlin und rendert
// damit dasselbe wie der Server — der Fehler ist lokal UNSICHTBAR. Vier gezielte
// prod-Laeufe waren gruen und galten als Gegenbeweis; in Wahrheit war die Messung blind.
// Mit fester UTC-Zone reproduziert JEDER Lauf die CI-Bedingung, auch lokal.
//
// Der Test prueft nur URL + uncaught Errors, keine Zeitangaben — die feste Zone kann hier
// also nichts anderes kaputtmachen.
test.use({ timezoneId: 'UTC' })

for (const rolle of ROLLEN) {
  test(`Rolle ${rolle.name}: Login + Portal ${rolle.pfad} erreichbar + fehlerfrei`, async ({ page }) => {
    test.setTimeout(120_000)
    if (BRAUCHT_BASIC_AUTH && !BASIC_PASS) test.skip(true, 'STAGING_BASIC_PASS nicht gesetzt (Ziel = staging)')
    const { pageErrors, consoleErrors } = wireConsole(page, rolle.name)

    const ok = await login(page, rolle.email, rolle.pass)
    if (!ok) {
      await shot(page, `${rolle.name.toLowerCase()}-login-fehlgeschlagen`)
      // ⚠ FRUEHER: test.skip() — der Test war damit GRUEN und hat nie etwas geprueft.
      // Genau so blieben SV/KB/Kanzlei ueber Wochen unbemerkt ungetestet (falsche
      // Default-Credentials, s. o.). Die urspruengliche Annahme „Account fehlt auf staging"
      // ist widerlegt: alle vier Konten existieren auf prod, sind bestaetigt und ohne MFA
      // (20.08. gegen auth.users gemessen + je ein echter Login im Browser).
      // Ein fehlgeschlagener Rollen-Login ist deshalb ein BEFUND, kein Grund zum Ueberspringen.
      // Der Job laeuft nightly und gatet nichts — ein rotes Ergebnis blockiert keinen PR.
      expect(
        ok,
        `${rolle.name}-Login fehlgeschlagen (${rolle.email}). Konto existiert? Passwort aktuell? ` +
          `Konvention: test-*@ = <PASSWORT: GitHub-Secret>, AUSNAHME test-dispatch = <PASSWORT: GitHub-Secret>. ` +
          `Override via TEST_${rolle.name.toUpperCase()}_EMAIL / _PASSWORD.`,
      ).toBe(true)
      return
    }
    await page.goto(rolle.pfad, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(1200)
    await shot(page, `${rolle.name.toLowerCase()}-portal`)

    // Portal darf nicht auf /login zurückwerfen + keine uncaught JS-Exceptions.
    console.log(`[${rolle.name}] console.errors (benign): ${consoleErrors.length}`)
    expect(page.url(), `${rolle.name} wurde auf Login zurückgeworfen`).not.toContain('/login')
    expect(pageErrors, `Uncaught JS-Errors im ${rolle.name}-Portal:\n${pageErrors.join('\n')}`).toHaveLength(0)
  })
}
