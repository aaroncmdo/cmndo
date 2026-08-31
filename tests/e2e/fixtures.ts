import { test as base, type Browser, type Page } from '@playwright/test'
import path from 'path'
import { computeTotp } from './lib/totp.mjs'

// KFZ-185: Test fixtures with auth-state caching.

/**
 * Rollen-Stammdaten an EINER Stelle.
 *
 * ⚠ Die Passwoerter sind gemessen, nicht angenommen: Konvention ist `test-*@` =
 * `<PASSWORT: GitHub-Secret>` mit der EINEN Ausnahme `test-dispatch` = `<PASSWORT: GitHub-Secret>`
 * (memory/reference-internal-test-account-logins.md). Genau diese Ausnahme stand hier
 * frueher als Default fuer ALLE Rollen und liess die Logins scheitern — die Portale
 * waren dadurch ungeprueft, ohne dass ein Test rot wurde.
 *
 * ⚠ Der Kunde heisst `smoke-kunde@`, NICHT `test-kunde@` — letzteren hat der
 * Golive-Accounts-Cleanup (13.07.) geloescht.
 */
const ROLLEN = {
  admin: { datei: 'admin.json', emailVar: 'TEST_ADMIN_EMAIL', email: 'test-admin@claimondo.de', passVar: 'TEST_ADMIN_PASSWORD', pass: (process.env.TEST_PASSWORT ?? ''), totpVar: 'TEST_ADMIN_TOTP_SECRET' },
  sv: { datei: 'sv.json', emailVar: 'TEST_SV_EMAIL', email: 'test-sv@claimondo.de', passVar: 'TEST_SV_PASSWORD', pass: (process.env.TEST_PASSWORT ?? ''), totpVar: 'TEST_SV_TOTP_SECRET' },
  dispatch: { datei: 'dispatch.json', emailVar: 'TEST_DISPATCH_EMAIL', email: 'test-dispatch@claimondo.de', passVar: 'TEST_DISPATCH_PASSWORD', pass: (process.env.TEST_PASSWORT ?? ''), totpVar: 'TEST_DISPATCH_TOTP_SECRET' },
  kb: { datei: 'kb.json', emailVar: 'TEST_KB_EMAIL', email: 'test-kb@claimondo.de', passVar: 'TEST_KB_PASSWORD', pass: (process.env.TEST_PASSWORT ?? ''), totpVar: 'TEST_KB_TOTP_SECRET' },
  kunde: { datei: 'kunde.json', emailVar: 'TEST_KUNDE_EMAIL', email: 'smoke-kunde@claimondo.de', passVar: 'TEST_KUNDE_PASSWORD', pass: (process.env.TEST_PASSWORT ?? ''), totpVar: 'TEST_KUNDE_TOTP_SECRET' },
  kanzlei: { datei: 'kanzlei.json', emailVar: 'TEST_KANZLEI_EMAIL', email: 'test-kanzlei@claimondo.de', passVar: 'TEST_KANZLEI_PASSWORD', pass: (process.env.TEST_PASSWORT ?? ''), totpVar: 'TEST_KANZLEI_TOTP_SECRET' },
} as const

async function login(
  page: Page,
  email: string,
  password: string,
  storageFile: string,
  totpSecret?: string,
) {
  await page.goto('/login')
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.click('button[type="submit"]')
  // Login-Formular verlassen — entweder direkt ins Portal ODER auf den 2FA-Challenge
  // (F3-Pflicht interne Rollen / F2 SV-mit-Faktor). `/login/2fa` enthaelt `/login`,
  // darum hier nur die reine `/login`-Seite ausschliessen, nicht jeden `/login`-Praefix.
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15_000 })
  if (page.url().includes('/login/2fa')) {
    if (!totpSecret) {
      throw new Error(
        `${email}: 2FA-Challenge, aber kein TOTP-Secret. scripts/seed-test-2fa.mjs laufen lassen + Secret als env setzen (TEST_*_TOTP_SECRET).`,
      )
    }
    await page.fill('input[autocomplete="one-time-code"]', computeTotp(totpSecret))
    await page.getByRole('button', { name: /Bestätigen/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 })
  }
  await page.context().storageState({ path: storageFile })
}

/**
 * Env-Wert mit Fallback — bewusst NICHT `??`.
 *
 * ⚠ `??` faengt keine leere Zeichenkette. Ein in GitHub **nicht konfiguriertes** Secret
 * setzt die Variable trotzdem: auf `''`. `process.env.X ?? 'default'` liefert dann `''`,
 * und der Login laeuft mit leerem Passwort ins Timeout — der „sichere Default" greift in
 * CI also genau dann nicht, wenn man ihn braucht.
 *
 * Zusaetzlich wird der Zustand GEMELDET, statt ihn zu verschlucken: ein gesetztes, aber
 * leeres Secret ist im Log sonst nicht von einem gesetzten, aber FALSCHEN zu unterscheiden
 * — beide enden im selben stummen Timeout. Genau daran haben die 8 `Gutachter Routes` in
 * routes.spec.ts zwei Naechte lang gehangen (zuletzt Lauf 32445807331, 21.08.), obwohl der
 * Default nachweislich stimmt (per echtem Login gegen prod gemessen).
 */
function envOderDefault(name: string, fallback: string): string {
  const wert = process.env[name]
  if (wert && wert.trim() !== '') return wert
  if (wert !== undefined) {
    console.warn(
      `[fixtures] ${name} ist gesetzt, aber LEER — nutze den Default. ` +
        `In CI heisst das: das Secret existiert nicht (oder ist leer gepflegt).`,
    )
  }
  return fallback
}

// Fixtures that provide pre-authenticated pages.
//
// 23.08.: als Factory gebaut statt sechsmal kopiert. Vorher gab es die Logik nur fuer
// admin + sv — die uebrigen vier Portale (dispatch/mitarbeiter/kunde/kanzlei, zusammen
// ~47 Seiten) hatten GAR KEINE Fixture und wurden vom Routen-Smoke deshalb nie erfasst.
function rollenSeite(rolle: keyof typeof ROLLEN) {
  const k = ROLLEN[rolle]
  const speicher = path.join(__dirname, '../../playwright/.auth/', k.datei)
  return async ({ browser }: { browser: Browser }, use: (p: Page) => Promise<void>) => {
    const email = envOderDefault(k.emailVar, k.email)
    const password = envOderDefault(k.passVar, k.pass)
    const ctx = await browser.newContext({ storageState: speicher }).catch(async () => {
      // Erster Lauf — noch kein gespeicherter Zustand, also frisch einloggen.
      const frisch = await browser.newContext()
      const seite = await frisch.newPage()
      await login(seite, email, password, speicher, process.env[k.totpVar])
      await seite.close()
      await frisch.close()
      return browser.newContext({ storageState: speicher })
    })
    const seite = await ctx.newPage()
    await use(seite)
    await ctx.close()
  }
}

export const test = base.extend<{
  adminPage: Page
  svPage: Page
  dispatchPage: Page
  kbPage: Page
  kundePage: Page
  kanzleiPage: Page
}>({
  adminPage: rollenSeite('admin'),
  svPage: rollenSeite('sv'),
  dispatchPage: rollenSeite('dispatch'),
  kbPage: rollenSeite('kb'),
  kundePage: rollenSeite('kunde'),
  kanzleiPage: rollenSeite('kanzlei'),
})

export { expect } from '@playwright/test'
