#!/usr/bin/env node
// Legt via Admin-UI (/admin/team -> "Neuer Mitarbeiter"-Modal) einen internen Nutzer
// mit waehlbarer Rolle an (kundenbetreuer/dispatch/admin/kanzlei). Fuer Portal-Smoke
// der kanzlei-Rolle. Test-Email (@claimondo.test) -> Einladungs-Mail geht ins Leere.
import { chromium } from 'playwright'
import { sessionToCookies } from './cookie.mjs'
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d }
const APP = 'https://app.claimondo.de'
const EMAIL = arg('email'); const ROLLE = arg('rolle', 'kanzlei')
const VORNAME = arg('vorname', 'Smoke'); const NACHNAME = arg('nachname', 'Kanzlei')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const s = await (await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }) })).json()
if (!s?.access_token) { console.error('AUTH FAIL'); process.exit(1) }
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 1100 } })
await ctx.addCookies(sessionToCookies(s, { projectRef, cookieDomain: '.claimondo.de' }))
const page = await ctx.newPage()
const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 80)) })
await page.goto('/admin/team', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(2000)
await page.getByRole('button', { name: /Neuer Mitarbeiter/i }).first().click()
await page.waitForTimeout(1200)
async function fill(name, val) { const el = page.locator(`input[name="${name}"]:visible`).first(); await el.waitFor({ state: 'visible', timeout: 10000 }); await el.fill(String(val)) }
await fill('vorname', VORNAME)
await fill('nachname', NACHNAME)
await fill('email', EMAIL)
await page.locator('select[name="rolle"]:visible').first().selectOption(ROLLE)
await page.getByRole('button', { name: /^Erstellen$/ }).first().click({ timeout: 20000 })
await page.waitForTimeout(4500)
console.log(JSON.stringify({ url: page.url(), body: (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 220), errs: errs.slice(0, 2) }, null, 2))
await browser.close()
