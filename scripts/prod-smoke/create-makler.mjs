#!/usr/bin/env node
// Legt via Admin-UI (/admin/vertrieb -> Tab Makler -> "Makler anlegen"-Drawer) einen Test-Makler an.
// Test-Email (@claimondo.test) -> Welcome-Mail geht ins Leere. Kein SMS (enablePhoneLogin phone_confirm).
import { chromium } from 'playwright'
import { sessionToCookies } from './cookie.mjs'
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d }
const APP = 'https://app.claimondo.de'
const EMAIL = arg('email')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const s = await (await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }) })).json()
if (!s?.access_token) { console.error('AUTH FAIL'); process.exit(1) }
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 1100 } })
await ctx.addCookies(sessionToCookies(s, { projectRef, cookieDomain: '.claimondo.de' }))
const page = await ctx.newPage()
await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(2000)
await page.getByRole('button', { name: /^Makler$/ }).first().click(); await page.waitForTimeout(1000)
await page.getByRole('button', { name: /Makler anlegen/i }).first().click(); await page.waitForTimeout(1500)
async function fill(name, val) { const el = page.locator(`input[name="${name}"]`).first(); await el.waitFor({ state: 'visible', timeout: 10000 }); await el.fill(val) }
await fill('firma', 'SMOKE Testmakler GmbH')
await fill('email', EMAIL)
await fill('ansprechpartner_vorname', 'Smoke')
await fill('ansprechpartner_nachname', 'Makler')
await page.getByRole('button', { name: /^Anlegen$/ }).first().click()
await page.waitForTimeout(4000)
const body = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 300)
console.log(JSON.stringify({ url: page.url(), bodyHint: body }, null, 2))
await browser.close()
