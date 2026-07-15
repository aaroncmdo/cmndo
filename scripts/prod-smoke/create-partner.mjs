#!/usr/bin/env node
// Generischer Partner-Anleger via Admin-UI-Drawer (/admin/vertrieb): --tab <Tab> --trigger <Btn>
// --fields '{"name":"val",...}'. Test-Email (@claimondo.test) -> keine echte Mail, kein SMS.
import { chromium } from 'playwright'
import { sessionToCookies } from './cookie.mjs'
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d }
const APP = 'https://app.claimondo.de'
const TAB = arg('tab'); const TRIGGER = arg('trigger'); const FIELDS = JSON.parse(arg('fields', '{}'))
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const s = await (await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }) })).json()
if (!s?.access_token) { console.error('AUTH FAIL'); process.exit(1) }
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 1100 } })
await ctx.addCookies(sessionToCookies(s, { projectRef, cookieDomain: '.claimondo.de' }))
const page = await ctx.newPage()
const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 80)) })
await page.goto(arg('path', '/admin/vertrieb'), { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(2000)
// button:visible (CSS-Pseudo, versionsunabhaengig): Drawer-Inhalte sind oft vorgerendert
// (hidden) -> versteckte Zweit-Instanz; ohne :visible waehlt .first() sie -> Timeout.
// JS-.click() im Browser umgeht Playwrights "receives-events"-Check: ein vorgerenderter,
// transparenter Drawer-Backdrop verdeckt die Aktionsleiste-Buttons -> Playwright-.click()
// laeuft in Timeout, JS-.click() feuert trotzdem. offsetParent!=null = sichtbar (kein Twin).
async function jsClick(txt) {
  return await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, [role=button], [role=tab]')]
      .filter((e) => e.offsetParent !== null && (e.innerText || e.textContent || '').trim().toLowerCase().includes(t.toLowerCase()))
    if (els.length) { els[0].click(); return (els[0].innerText || '').trim().slice(0, 40) }
    return null
  }, txt)
}
if (TAB) { const r = await jsClick(TAB); console.log('tab-click:', r ?? 'NICHT GEFUNDEN'); await page.waitForTimeout(1800) }
const tr = await jsClick(TRIGGER); console.log('trigger-click:', tr ?? 'NICHT GEFUNDEN'); await page.waitForTimeout(1800)
async function fillV(name, val) { const el = page.locator(`input[name="${name}"]:visible, textarea[name="${name}"]:visible`).first(); await el.waitFor({ state: 'visible', timeout: 10000 }); await el.fill(String(val)) }
for (const [name, val] of Object.entries(FIELDS)) {
  try { await fillV(name, val) } catch { console.log(`  field ${name}: FEHLT`) }
}
// Google-Places-Autocomplete (z.B. Werkstatt-Standort): tippen -> .pac-item waehlen -> place_changed
// setzt lat/lng (sonst bleibt der Submit disabled). --address "Strasse Nr, Stadt".
const ADDRESS = arg('address')
if (ADDRESS) {
  const addr = page.locator('input[placeholder*="Adresse"]:visible, input[placeholder*="Standort"]:visible').first()
  await addr.click(); await addr.pressSequentially(ADDRESS, { delay: 80 })
  await page.waitForTimeout(3000)
  const pac = page.locator('.pac-item').first()
  if (await pac.count()) { await pac.click(); console.log('address: pac-item geklickt') }
  else { await addr.press('ArrowDown'); await addr.press('Enter'); console.log('address: keyboard-select') }
  await page.waitForTimeout(1500)
}
await page.locator('button:visible', { hasText: /^(Anlegen|Speichern|Erstellen)$/ }).first().click({ timeout: 20000 })
await page.waitForTimeout(4500)
console.log(JSON.stringify({ url: page.url(), body: (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 220), errs: errs.slice(0, 2) }, null, 2))
await browser.close()
