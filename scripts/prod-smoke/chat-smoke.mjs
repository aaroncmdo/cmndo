#!/usr/bin/env node
// Chat-Prod-Smoke: sendet eine Nachricht als $SMOKE_EMAIL in den Claim-Chat und prueft
//   1) ANKUNFT   — Marker erscheint nach dem Senden im Thread
//   2) PERSISTENZ — Marker ist nach RELOAD immer noch da (=> aus der DB nachgeladen,
//                   kein optimistisches Client-State)
//   3) CROSS-USER — Marker anderer Sender sind sichtbar (--expect "<text>")
// Der eigentliche Beweis (DB-Zeile) laeuft separat per execute_sql (READ) — siehe README.
//
//   SMOKE_EMAIL=... SMOKE_PASSWORD=... node --env-file=.env.local \
//     scripts/prod-smoke/chat-smoke.mjs --claim <uuid> --text "SMOKE-x" [--expect "andere-marker"]
import { chromium } from 'playwright'
import { sessionToCookies } from './cookie.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d }
const APP = process.env.SMOKE_APP_URL ?? 'https://app.claimondo.de'
const CLAIM = arg('claim')
const TEXT = arg('text')
const EXPECT = arg('expect')
const SHOT = arg('shot', '/tmp/chat-smoke.png')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const EMAIL = process.env.SMOKE_EMAIL
const PW = process.env.SMOKE_PASSWORD
if (!CLAIM || !TEXT) { console.error('--claim + --text noetig'); process.exit(1) }

const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PW }),
})
const session = await authRes.json()
if (!session?.access_token) { console.error('AUTH FAIL', session?.error_description ?? session); process.exit(1) }

const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
const cookies = sessionToCookies(session, { projectRef, cookieDomain: '.claimondo.de' })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 1100 } })
await ctx.addCookies(cookies)
const page = await ctx.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })

const PATH = arg('path', `/admin/chat/${CLAIM}`)   // KB/Admin via Fallakte: /faelle/<fallId>
const TAB = arg('tab')                              // z.B. "Kommunikation" (Fallakte-Tab klicken)
const out = { user: EMAIL, claim: CLAIM, path: PATH, text: TEXT }

await page.goto(PATH, { waitUntil: 'networkidle', timeout: 60000 })
out.finalUrl = page.url()
if (/\/login/.test(page.url())) { out.error = 'auf /login umgeleitet'; console.log(JSON.stringify(out, null, 2)); await browser.close(); process.exit(1) }
if (!page.url().includes(PATH.split('?')[0])) { out.error = `weggeleitet nach ${page.url()} (kein Zugriff auf diese Route/den Fall)`; console.log(JSON.stringify(out, null, 2)); await browser.close(); process.exit(1) }
await page.waitForTimeout(2000)

if (TAB) {
  const tab = page.getByRole('button', { name: TAB }).first()
  try { await tab.click({ timeout: 15000 }); out.tabClicked = TAB } catch { out.tabClicked = `FEHLT: ${TAB}` }
  await page.waitForTimeout(2500)
}

// 3) CROSS-USER: sieht dieser User die Nachricht des anderen (VOR dem eigenen Senden)?
if (EXPECT) out.sawOtherBeforeSend = (await page.content()).includes(EXPECT)

// Senden
const ta = page.locator('textarea[placeholder="Nachricht schreiben…"]').first()
try {
  await ta.waitFor({ state: 'visible', timeout: 20000 })
} catch {
  // Diagnose statt Absturz: was ist stattdessen da?
  out.error = 'Chat-Textarea nicht gefunden'
  out.diag = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter(Boolean).slice(0, 25),
    textareas: [...document.querySelectorAll('textarea')].map((t) => t.placeholder).slice(0, 5),
    body: (document.body.innerText || '').slice(0, 700),
  }))
  await page.screenshot({ path: SHOT, fullPage: true })
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
  process.exit(1)
}
// Echte Keystrokes statt fill(): der Senden-Button haengt an React-State
// (disabled={!text.trim()}) — fill() setzt nur den DOM-Wert und der Button kann
// disabled bleiben. Enter (ohne Shift) sendet (ClaimThreadChat onKeyDown).
await ta.click()
await ta.pressSequentially(TEXT, { delay: 12 })
await page.waitForTimeout(400)
await ta.press('Enter')
await page.waitForTimeout(3500)

// 1) ANKUNFT
out.sentVisible = (await page.content()).includes(TEXT)
await page.screenshot({ path: SHOT, fullPage: true })

// 2) PERSISTENZ — harter Reload, Inhalt muss aus der DB kommen
await page.reload({ waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(3000)
const afterReload = await page.content()
out.persistedAfterReload = afterReload.includes(TEXT)
if (EXPECT) out.sawOtherAfterReload = afterReload.includes(EXPECT)
await page.screenshot({ path: SHOT.replace('.png', '-reload.png'), fullPage: true })

out.browserErrors = errs.slice(0, 3)
out.PASS = out.sentVisible === true && out.persistedAfterReload === true
console.log(JSON.stringify(out, null, 2))
await browser.close()
