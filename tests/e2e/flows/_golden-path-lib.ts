import type { Browser, BrowserContext } from '@playwright/test'
import { expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// @ts-ignore — JS-Helper aus dem prod-smoke-Harness (kein .d.ts; Playwright/esbuild transpiliert)
import { sessionToCookies } from '../../../scripts/prod-smoke/cookie.mjs'

export { CLAIMS, AUFTRAEGE, ACCOUNTS, PARTIES, PFLICHTDOK, SV_SACHVERSTAENDIGE_ID } from '../../../scripts/test-fixtures/ids'

export const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Fixture-Accounts (Passwörter: Test1234! grandfathered, sv per env).
export const ROLES = {
  sv: { email: process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de', pass: process.env.TEST_SV_PASSWORD ?? '' },
  dispatch: { email: 'test-dispatch@claimondo.de', pass: process.env.TEST_DISPATCH_PASSWORD ?? 'Test1234!' },
  kunde: { email: 'test-kunde@claimondo.de', pass: process.env.TEST_KUNDE_PASSWORD ?? 'Test1234!' },
  kb: { email: 'test-kb@claimondo.de', pass: process.env.TEST_KB_PASSWORD ?? 'Test1234!' },
  kanzlei: { email: 'test-kanzlei@claimondo.de', pass: process.env.TEST_KANZLEI_PASSWORD ?? 'Test1234!' },
  admin: { email: 'test-admin@claimondo.de', pass: process.env.TEST_ADMIN_PASSWORD ?? 'Test1234!' },
} as const

export type RoleKey = keyof typeof ROLES

/** GoTrue password-grant + Cookie-Injection -> isolierter, SW-blockierter, eingeloggter Context. */
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

  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const cookies = sessionToCookies(session, { projectRef, cookieDomain: '.claimondo.de' })
  const ctx = await browser.newContext({
    baseURL: APP,
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1200 },
  })
  await ctx.addCookies(cookies)
  return ctx
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
