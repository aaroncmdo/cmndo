#!/usr/bin/env node
// Generischer UI-Inspektor: navigiert (Cookie-Injection-Login) zu --path und dumpt
// Buttons/Links/Inputs, um Selektoren/Trigger zu finden. Read-only.
import { chromium } from 'playwright'
import { sessionToCookies } from './cookie.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d }
const APP = 'https://app.claimondo.de'
const PATH = arg('path', '/admin')
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
await page.goto(PATH, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(2500)
const clickText = arg('click')
if (clickText) { try { await page.getByRole('button', { name: new RegExp(clickText, 'i') }).first().click({ timeout: 8000 }); await page.waitForTimeout(1500) } catch (e) { console.log('click fail:', String(e.message).slice(0, 60)) } }
const info = await page.evaluate(() => {
  const t = (el) => (el.innerText || el.textContent || '').trim().slice(0, 45)
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  return {
    url: location.pathname,
    visibleButtons: [...document.querySelectorAll('button,a[role=button]')].filter(vis).map(t).filter(Boolean).slice(0, 40),
    buttons: [...document.querySelectorAll('button,a[role=button],[role=tab]')].map(t).filter(Boolean).slice(0, 40),
    links: [...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href')).filter((h, i, arr) => h && arr.indexOf(h) === i).slice(0, 40),
    inputs: [...document.querySelectorAll('input,textarea,select')].map((i) => `${i.tagName}[name=${i.name || '?'} label=${(i.labels?.[0]?.innerText || i.placeholder || '').slice(0, 25)}]`).slice(0, 25),
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
