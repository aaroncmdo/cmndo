// Fokus-Smoke: ChatThreadStream auf der Kunde-Fall-Detailseite (KundeKbChat-Wrapper).
// Laengerer Wait, um an den Loading-Skeletons vorbei die Chat-Cards zu rendern.
import { chromium } from 'playwright'
import path from 'node:path'

const BASE = 'http://localhost:3011'
const PASS = 'Test1234!'
const OUT = path.resolve('docs/02.06.2026/smoke-chat-thread')
const FALL = process.env.KUNDE_FALL ?? 'cccc5555-0000-4000-8000-000000000050'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 160)))

await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
await page.fill('input[type="email"], input[name="email"]', 'test-kunde@claimondo.de')
await page.fill('input[type="password"], input[name="password"]', PASS)
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 }).catch(() => {})

await page.goto(BASE + '/kunde/faelle/' + FALL, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {})
await page.waitForTimeout(10000)
// "Chat"-Tab (Uebersicht/Dokumente/Chat) -> mountet KundeKbChat -> ChatThreadStream inline
const chatTab = page.getByText('Chat', { exact: true }).first()
if (await chatTab.count().catch(() => 0)) { await chatTab.click().catch(() => {}); await page.waitForTimeout(4500) }
await page.screenshot({ path: path.join(OUT, '05c-kunde-stream-tab.png'), fullPage: true })
const body2 = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400)
console.log('AFTER_CHAT_TAB:', JSON.stringify({ url: page.url(), body2 }))
const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600)
console.log(JSON.stringify({ finalUrl: page.url(), errors: errors.slice(0, 8), body }, null, 2))
await browser.close()
