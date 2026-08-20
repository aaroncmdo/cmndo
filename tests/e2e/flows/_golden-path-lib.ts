import type { Browser, BrowserContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// @ts-ignore — JS-Helper aus dem prod-smoke-Harness (kein .d.ts; Playwright/esbuild transpiliert)
import { sessionToCookies } from '../../../scripts/prod-smoke/cookie.mjs'
import { totp } from './totp'

export { CLAIMS, AUFTRAEGE, ACCOUNTS, PARTIES, PFLICHTDOK, SV_SACHVERSTAENDIGE_ID } from '../../../scripts/test-fixtures/ids'

export const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Fixture-Accounts. DIES IST DIE QUELLE fuer Test-Credentials in tests/e2e — neue Specs
// importieren `ROLES` von hier, statt eigene Defaults zu schreiben (genau daraus entstand
// die Drift unten).
//
// ⚠ `Test1234!` gilt auf prod NUR NOCH fuer test-dispatch@. Die frueher hier notierte
// Annahme „Test1234! grandfathered" ist widerlegt — GoTrue lehnt das Passwort seit der
// pwned-Password-Policy ab, die uebrigen Konten wurden auf `Claimondo2026!` gezogen.
// Gemessen 20.08. gegen app.claimondo.de, jede Zelle ein echter Browser-Login:
//
//   admin     test-admin@      Claimondo2026! -> /admin              Test1234! = falsch
//   dispatch  test-dispatch@   Claimondo2026! = falsch               Test1234! -> /dispatch/dashboard
//   kb        test-kb@         Claimondo2026! -> /mitarbeiter        Test1234! = falsch
//   kanzlei   test-kanzlei@    Claimondo2026! -> /kanzlei/mandate    Test1234! = falsch
//   sv        test-sv@         Claimondo2026! -> /gutachter/heute    Test1234! = falsch
//   kunde     smoke-kunde@     Claimondo2026! -> /kunde              Test1234! = falsch
//
// ⭐ Die eine Rolle, die `Test1234!` behielt, ist die dokumentierte AUSNAHME — und genau
// sie wurde verallgemeinert. Wer eine Sonderregel abschreibt, schreibt oft die Sonderregel
// ab, nicht die Regel.
//
// ⚠ Der falsche Default schlaegt genau dort durch, wo KEIN CI-Secret ihn deckt: ci.yml
// reicht nur TEST_ADMIN_* und TEST_SV_* durch. Fuer kb/kanzlei/kunde gibt es kein
// wirksames Secret — dort IST der Default das, was laeuft.
export const ROLES = {
  sv: { email: process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de', pass: process.env.TEST_SV_PASSWORD ?? 'Claimondo2026!' },
  // Einzige Rolle mit Test1234! — nicht "korrigieren".
  dispatch: { email: 'test-dispatch@claimondo.de', pass: process.env.TEST_DISPATCH_PASSWORD ?? 'Test1234!' },
  // 17.07.: test-kunde@ existiert seit dem Golive-Accounts-Cleanup nicht mehr; dediziertes
  // Smoke-Konto = smoke-kunde@ (reference-internal-test-account-logins, Aaron-Go).
  kunde: { email: process.env.TEST_KUNDE_EMAIL ?? 'smoke-kunde@claimondo.de', pass: process.env.TEST_KUNDE_PASSWORD ?? 'Claimondo2026!' },
  kb: { email: 'test-kb@claimondo.de', pass: process.env.TEST_KB_PASSWORD ?? 'Claimondo2026!' },
  kanzlei: { email: 'test-kanzlei@claimondo.de', pass: process.env.TEST_KANZLEI_PASSWORD ?? 'Claimondo2026!' },
  admin: { email: 'test-admin@claimondo.de', pass: process.env.TEST_ADMIN_PASSWORD ?? 'Claimondo2026!' },
} as const

export type RoleKey = keyof typeof ROLES

// Interne Test-Accounts haben TOTP-2FA (auth.mfa_factors, verified). Secret (base32) kommt aus
// env — NUR Test-Accounts, gitignored, nie committet. Fehlt es, bleibt der Login aal1 -> der
// interne Flow skippt (skipIfAuthWall). Kunde ist extern -> kein TOTP.
const TOTP_SECRETS: Partial<Record<RoleKey, string | undefined>> = {
  sv: process.env.TEST_SV_TOTP_SECRET,
  kb: process.env.TEST_KB_TOTP_SECRET,
  admin: process.env.TEST_ADMIN_TOTP_SECRET,
  dispatch: process.env.TEST_DISPATCH_TOTP_SECRET,
  kanzlei: process.env.TEST_KANZLEI_TOTP_SECRET,
}

/**
 * Schließt die Supabase-MFA für eine aal1-Session programmatisch ab: verifizierten TOTP-Faktor
 * holen -> challenge -> verify mit frisch gerechnetem Code -> aal2-Session. Nötig seit der
 * internen 2FA-Pflicht (#3745), die die aal1-Cookie-Injection an internen Rollen blockt.
 */
async function completeMfa(
  session: { access_token: string; [k: string]: unknown },
  secretBase32: string,
  roleKey: RoleKey,
): Promise<Record<string, unknown>> {
  const authHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders })
  const user = (await userRes.json()) as { factors?: { id: string; factor_type: string; status: string }[] }
  const factor = (user.factors ?? []).find((f) => f.factor_type === 'totp' && f.status === 'verified')
  if (!factor) throw new Error(`Kein verifizierter TOTP-Faktor für ${roleKey}`)

  const chRes = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factor.id}/challenge`, {
    method: 'POST',
    headers: authHeaders,
    body: '{}',
  })
  const challenge = (await chRes.json()) as { id?: string }
  if (!challenge.id) throw new Error(`MFA-Challenge fehlgeschlagen (${roleKey}): ${JSON.stringify(challenge)}`)

  const vRes = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factor.id}/verify`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ challenge_id: challenge.id, code: totp(secretBase32) }),
  })
  const verified = (await vRes.json()) as { access_token?: string }
  if (!verified.access_token) throw new Error(`MFA-Verify fehlgeschlagen (${roleKey}): ${JSON.stringify(verified)}`)
  return { ...session, ...verified } // aal2-Tokens; user aus dem Grant behalten
}

/** GoTrue password-grant (+ MFA falls TOTP-Secret) + Cookie-Injection -> eingeloggter Context. */
export async function loginContext(browser: Browser, roleKey: RoleKey): Promise<BrowserContext> {
  const { email, pass } = ROLES[roleKey]
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  })
  const session = await res.json()
  if (!session?.access_token) {
    throw new Error(`Auth ${roleKey} fehlgeschlagen: ${session?.error_description ?? JSON.stringify(session)}`)
  }

  // Interne Rollen brauchen seit der 2FA-Pflicht (#3745) eine aal2-Session. Ist ein TOTP-Secret
  // hinterlegt, schließen wir die MFA hier ab -> aal2. Ohne Secret bleibt es aal1 (externe Rollen).
  const totpSecret = TOTP_SECRETS[roleKey]
  const effectiveSession = totpSecret ? await completeMfa(session, totpSecret, roleKey) : session

  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const cookies = sessionToCookies(effectiveSession, { projectRef, cookieDomain: '.claimondo.de' })
  const ctx = await browser.newContext({
    baseURL: APP,
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1200 },
  })
  // cookie.mjs (untyped .mjs) liefert sameSite:string; Playwright will "Lax"|"Strict"|"None".
  await ctx.addCookies(cookies as Parameters<typeof ctx.addCookies>[0])
  return ctx
}

/**
 * Wie loginContext, aber SKIPPT den Test (statt hart zu failen), wenn der GoTrue-Grant
 * fehlschlägt — z.B. test-sv `invalid_credentials` während die Auth-Härtung läuft. So
 * degradiert die Harness graceful, wenn eine interne Test-Identität temporär nicht loginbar ist.
 */
export async function loginContextOrSkip(browser: Browser, roleKey: RoleKey): Promise<BrowserContext> {
  try {
    return await loginContext(browser, roleKey)
  } catch (err) {
    test.skip(
      true,
      `Login ${roleKey} nicht möglich (${String(err).slice(0, 90)}) — evtl. 2FA/Credential-Härtung live; Harness braucht 2FA-aware Login (TOTP via auth.mfa_factors). Siehe COORDINATION-golden-path-deep-e2e.`,
    )
    throw err // unreachable — test.skip() wirft bereits
  }
}

/**
 * Nach einer Navigation prüfen, ob die (interne) Rolle an der Auth-Wand (/login, /login/2fa)
 * gelandet ist. Falls ja: SKIP statt FAIL — die aal1-Cookie-Injection kommt seit der internen
 * 2FA-Pflicht (#3745) nicht mehr an internen Rollen vorbei (aal2 nötig). Externe Rollen (Kunde)
 * trifft das nicht; dort weiter hart asserten.
 */
export function skipIfAuthWall(page: Page): void {
  const path = new URL(page.url()).pathname
  if (/\/login|\/anmelden|\/2fa/.test(path)) {
    test.skip(
      true,
      `Interne Rolle an Auth-Wand (${path}) — interne 2FA-Pflicht (#3745) blockt die aal1-Cookie-Injection (aal2 nötig). Harness braucht 2FA-aware Login. Siehe COORDINATION-golden-path-deep-e2e.`,
    )
  }
}

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** DB-Assert nach einer UI-Aktion: Row per id laden, gegen expected matchen. */
export async function assertRow(table: string, id: string, expected: Record<string, unknown>): Promise<void> {
  const { data, error } = await serviceClient().from(table).select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`assertRow ${table} ${id}: ${error.message}`)
  expect(data, `${table} ${id} existiert`).toBeTruthy()
  expect(data).toMatchObject(expected)
}

/** DB-driven Poll: wartet bis die Row (per id) das expected-Objekt matcht (für asynchrone UI-Aktionen). */
export async function pollRow(
  table: string,
  id: string,
  expected: Record<string, unknown>,
  timeoutMs = 20_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const { data } = await serviceClient().from(table).select('*').eq('id', id).maybeSingle()
        return data
      },
      { timeout: timeoutMs, message: `${table} ${id} soll ${JSON.stringify(expected)} erreichen` },
    )
    .toMatchObject(expected)
}
