// P2 Chat-Thread-Smoke (02.06.2026): alle erreichbaren Surfaces der neuen Shells
// (ChatThreadTabs / ChatThreadTimeline / ChatThreadStream). Loggt je Rolle ein,
// oeffnet die Surface, screenshotet + sammelt Console/Page-Errors. Gegen den
// lokalen Worktree-Dev-Server (:3011) = P2-Branch.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3011'
const PASS = process.env.SMOKE_PASS ?? 'Test1234!'
const FALL_ID = process.env.SMOKE_FALL_ID ?? '82297a0f-8a46-4703-b0af-1a27dc860e24'
const OUT = path.resolve('docs/02.06.2026/smoke-chat-thread')
fs.mkdirSync(OUT, { recursive: true })

const TARGETS = [
  { role: 'admin', email: 'test-admin@claimondo.de', path: '/admin/nachrichten', name: '01-admin-nachrichten-Tabs' },
  { role: 'kb', email: 'test-kb@claimondo.de', path: '/mitarbeiter/nachrichten', name: '02-kb-nachrichten-Timeline' },
  { role: 'sv', email: 'test-sv@claimondo.de', path: '/gutachter/posteingang', name: '03-sv-posteingang-Tabs' },
  { role: 'kunde', email: 'test-kunde@claimondo.de', path: '/kunde/chat', name: '04-kunde-chat-Tabs' },
  { role: 'kunde', email: 'test-kunde@claimondo.de', path: '/kunde', name: '05-kunde-home-Stream' },
  { role: 'admin', email: 'test-admin@claimondo.de', path: `/faelle/${FALL_ID}`, name: '06-fallakte-kommunikation-Tabs', tab: 'Kommunikation' },
  { role: 'makler', email: 'test-makler@claimondo.de', path: '/makler/akten', name: '07-makler-akten-Stream' },
  { role: 'sv', email: 'test-sv@claimondo.de', path: '/gutachter/feldmodus', name: '08-sv-feldmodus-Fokus' },
]

async function login(page, email) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 }).catch(() => {})
}

const results = []
const browser = await chromium.launch()
for (const t of TARGETS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)))
  let clickedTab = false
  try {
    await login(page, t.email)
    await page.goto(BASE + t.path, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForTimeout(3500)
    if (t.tab) {
      const tab = page.getByText(t.tab, { exact: false }).first()
      if (await tab.count().catch(() => 0)) {
        await tab.click().catch(() => {})
        clickedTab = true
        await page.waitForTimeout(3000)
      }
    }
    const shot = path.join(OUT, t.name + '.png')
    await page.screenshot({ path: shot, fullPage: true })
    const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400)
    const hasError = /Application error|Unhandled Runtime|client-side exception|Internal Server Error|something went wrong/i.test(body)
    results.push({ role: t.role, path: t.path, tab: t.tab ?? null, clickedTab, finalUrl: page.url(), hasError, consoleErrors: errors.slice(0, 8), bodyPreview: body })
  } catch (e) {
    results.push({ role: t.role, path: t.path, fatal: String(e).slice(0, 200), consoleErrors: errors.slice(0, 8) })
  }
  await ctx.close()
}
await browser.close()
console.log('SMOKE_RESULT_JSON_START')
console.log(JSON.stringify(results, null, 2))
console.log('SMOKE_RESULT_JSON_END')
