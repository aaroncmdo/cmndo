#!/usr/bin/env node
// Authenticated prod/staging smoke via real Chromium + @supabase/ssr cookie
// injection. Logs in as a TEST account (GoTrue password-grant), injects the
// session cookie, and renders authenticated pages — real SSR, layout, markers,
// screenshots — without the login/2FA UI. See ./README.md.
//
// Run with the app env loaded, e.g.:
//   node --env-file=.env.local scripts/prod-smoke/smoke.mjs \
//     --app-url https://app.claimondo.de \
//     --email test-dispatch@claimondo.de --password (process.env.TEST_PASSWORT ?? '') \
//     --checks '[{"label":"dash","path":"/dispatch/dashboard","markers":["Abmelden"]}]'
import { chromium } from 'playwright'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync } from 'node:fs'
import { sessionToCookies } from './cookie.mjs'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const flag = (name) => process.argv.includes(`--${name}`)
const fail = (msg) => { console.error(`[prod-smoke] ${msg}`); process.exit(1) }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const appUrl = arg('app-url', process.env.SMOKE_APP_URL)
const email = arg('email', process.env.SMOKE_EMAIL)
const password = arg('password', process.env.SMOKE_PASSWORD)
const outDir = arg('out', join(tmpdir(), 'prod-smoke'))

if (!supabaseUrl || !anonKey) fail('NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY fehlen — mit `node --env-file=.env.local ...` starten.')
if (!appUrl) fail('--app-url (oder $SMOKE_APP_URL) fehlt.')
if (!email || !password) fail('--email + --password (oder $SMOKE_EMAIL/$SMOKE_PASSWORD) fehlen.')

let checksRaw = arg('checks', '[]')
if (checksRaw.startsWith('@')) checksRaw = readFileSync(checksRaw.slice(1), 'utf8')
let checks
try { checks = JSON.parse(checksRaw) } catch { fail('--checks ist kein gültiges JSON.') }
if (!Array.isArray(checks) || checks.length === 0) fail('--checks: nicht-leeres JSON-Array erwartet.')

const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
const appHost = new URL(appUrl).hostname
const parts = appHost.split('.')
const cookieDomain = arg('cookie-domain', parts.length >= 2 ? '.' + parts.slice(-2).join('.') : appHost)

;(async () => {
  // 1. Auth — GoTrue password grant (test account only).
  const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = await authRes.json()
  if (!session?.access_token) fail(`Auth fehlgeschlagen: ${session?.error_description || session?.msg || JSON.stringify(session)}`)

  const cookies = sessionToCookies(session, { projectRef, cookieDomain })
  mkdirSync(outDir, { recursive: true })

  // 2. Real Chromium with the injected session.
  const browser = await chromium.launch({ headless: !flag('headed') })
  const ctx = await browser.newContext({ baseURL: appUrl, viewport: { width: 1440, height: 1200 } })
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()

  const results = []
  for (const chk of checks) {
    let status = 'no-resp'
    try {
      const resp = await page.goto(chk.path, { waitUntil: 'networkidle', timeout: 45000 })
      status = resp ? resp.status() : 'no-resp'
    } catch (e) { status = 'nav-err:' + String(e.message).slice(0, 40) }
    await page.waitForTimeout(1000)
    const finalUrl = page.url()
    const html = await page.content()
    const markers = {}
    for (const m of chk.markers ?? []) markers[m] = html.includes(m)
    const shot = join(outDir, `shot-${chk.label ?? 'check'}.png`)
    try { await page.screenshot({ path: shot, fullPage: true }) } catch {}
    results.push({
      label: chk.label,
      path: chk.path,
      status,
      finalUrl,
      redirectedToLogin: /\/login|\/anmelden/.test(finalUrl),
      markers,
      shot,
    })
  }
  await browser.close()
  console.log(JSON.stringify(results, null, 2))
})().catch((e) => fail(String(e?.stack || e?.message || e)))
