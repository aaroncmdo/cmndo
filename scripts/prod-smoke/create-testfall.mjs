#!/usr/bin/env node
// Legt via /admin/faelle/anlegen (Admin-UI) einen frischen Testfall an.
// Test-Email (@claimondo.test) => istTestKunde-Guard unterdrueckt jede Zustellung.
import { chromium } from 'playwright'
import { sessionToCookies } from './cookie.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d }
const APP = 'https://app.claimondo.de'
const EMAIL = arg('email')      // eindeutige Test-Email
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }),
})
const session = await authRes.json()
if (!session?.access_token) { console.error('AUTH FAIL', session?.error_description); process.exit(1) }
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 1100 } })
await ctx.addCookies(sessionToCookies(session, { projectRef, cookieDomain: '.claimondo.de' }))
const page = await ctx.newPage()

await page.goto('/admin/faelle/anlegen', { waitUntil: 'networkidle', timeout: 60000 })
if (/\/login|\/admin$/.test(page.url())) { console.error('kein Zugriff:', page.url()); await browser.close(); process.exit(1) }

async function fill(rx, val) {
  const el = page.getByLabel(rx).first()
  await el.waitFor({ state: 'visible', timeout: 15000 })
  await el.fill(val)
}
await fill(/Vorname/i, 'SmokeSV')
await fill(/Nachname/i, 'Testkunde')
await fill(/Telefon/i, '+4915510000099')
await fill(/Email/i, EMAIL)
await fill(/Schadens-PLZ/i, '10115')

await page.getByRole('button', { name: /Fall anlegen|Anlegen/i }).first().click()
await page.waitForTimeout(5000)
console.log(JSON.stringify({ finalUrl: page.url(), bodyHint: (await page.evaluate(() => document.body.innerText)).slice(0, 300) }, null, 2))
await browser.close()
