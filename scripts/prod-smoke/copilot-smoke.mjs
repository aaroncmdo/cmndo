#!/usr/bin/env node
// AI-Copilot-Prod-Smoke: stellt dem Claim-Copiloten (ClaimAiPanel -> /api/admin/claim-copilot)
// eine Frage und prueft, ob eine gestreamte Antwort ankommt und nach Reload erhalten bleibt.
// Admin-only (Route-Guard). DB-Beweis (persistierter Thread) separat per execute_sql.
import { chromium } from 'playwright'
import { sessionToCookies } from './cookie.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d }
const APP = process.env.SMOKE_APP_URL ?? 'https://app.claimondo.de'
const PATH = arg('path')
const FRAGE = arg('frage', 'Fasse den Stand dieses Falls in einem Satz zusammen.')
const SHOT = arg('shot', '/tmp/copilot.png')
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
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 1200 } })
await ctx.addCookies(sessionToCookies(session, { projectRef, cookieDomain: '.claimondo.de' }))
const page = await ctx.newPage()

const api = []
page.on('response', (r) => { if (r.url().includes('claim-copilot')) api.push(`${r.status()} ${r.url().split('/').pop()}`) })

const out = { user: process.env.SMOKE_EMAIL, frage: FRAGE }
await page.goto(PATH, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)

const ta = page.locator('textarea[placeholder*="Fragen Sie den Assistenten"]').first()
try { await ta.waitFor({ state: 'visible', timeout: 20000 }) } catch {
  out.error = 'Copilot-Textarea nicht gefunden'
  out.body = (await page.evaluate(() => document.body.innerText)).slice(0, 400)
  await page.screenshot({ path: SHOT, fullPage: true })
  console.log(JSON.stringify(out, null, 2)); await browser.close(); process.exit(1)
}

const vorher = (await page.evaluate(() => document.body.innerText)).length
await ta.click()
await ta.pressSequentially(FRAGE, { delay: 10 })
await page.waitForTimeout(300)
await ta.press('Enter')

// Streaming abwarten: Text muss wachsen
let gewachsen = 0
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000)
  const jetzt = (await page.evaluate(() => document.body.innerText)).length
  if (jetzt > vorher + 80) { gewachsen = jetzt - vorher; break }
}
out.apiCalls = [...new Set(api)]
out.antwortGewachsenUmZeichen = gewachsen
out.frageSichtbar = (await page.content()).includes(FRAGE.slice(0, 30))
await page.screenshot({ path: SHOT, fullPage: true })

// Persistenz: nach Reload muss der Verlauf noch da sein (Thread wird persistiert)
await page.reload({ waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(4000)
out.frageNachReloadSichtbar = (await page.content()).includes(FRAGE.slice(0, 30))
await page.screenshot({ path: SHOT.replace('.png', '-reload.png'), fullPage: true })

out.PASS = gewachsen > 0
console.log(JSON.stringify(out, null, 2))
await browser.close()
