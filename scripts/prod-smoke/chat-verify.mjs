#!/usr/bin/env node
// READ-ONLY: oeffnet den Claim-Chat und prueft, ob erwartete Marker sichtbar werden.
// Sendet NICHTS. Misst, WANN der Marker erscheint (Ladezeit vs. "erst nach Reload").
import { chromium } from 'playwright'
import { sessionToCookies } from './cookie.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d }
const APP = process.env.SMOKE_APP_URL ?? 'https://app.claimondo.de'
const PATH = arg('path')
const TAB = arg('tab')
const EXPECT = (arg('expect') ?? '').split('|').filter(Boolean)
const SHOT = arg('shot', '/tmp/chat-verify.png')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }),
})
const session = await authRes.json()
if (!session?.access_token) { console.error('AUTH FAIL'); process.exit(1) }

const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 1100 } })
await ctx.addCookies(sessionToCookies(session, { projectRef, cookieDomain: '.claimondo.de' }))
const page = await ctx.newPage()
const failedReqs = []
page.on('response', (r) => { if (r.status() === 401 || r.status() === 403) failedReqs.push(`${r.status()} ${r.url().slice(0, 90)}`) })

const out = { user: process.env.SMOKE_EMAIL, path: PATH }
await page.goto(PATH, { waitUntil: 'networkidle', timeout: 60000 })
if (TAB) { try { await page.getByRole('button', { name: TAB }).first().click({ timeout: 15000 }) } catch {} }

// Polling: wann werden die Marker sichtbar? (ohne Reload, ohne Senden)
const seen = {}
const t0 = Date.now()
for (let i = 0; i < 24; i++) {           // bis 24s
  const html = await page.content()
  for (const m of EXPECT) if (!seen[m] && html.includes(m)) seen[m] = `${((Date.now() - t0) / 1000).toFixed(1)}s`
  if (EXPECT.every((m) => seen[m])) break
  await page.waitForTimeout(1000)
}
out.markerSichtbarNach = EXPECT.reduce((a, m) => ({ ...a, [m]: seen[m] ?? 'NICHT SICHTBAR (24s)' }), {})
out.auth401_403 = [...new Set(failedReqs)].slice(0, 5)
out.finalUrl = page.url()
out.body = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 420)
await page.screenshot({ path: SHOT, fullPage: true })
console.log(JSON.stringify(out, null, 2))
await browser.close()
