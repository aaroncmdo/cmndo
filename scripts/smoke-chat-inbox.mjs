// P1 Chat-Inbox-Smoke (02.06.2026): loggt je Rolle ein, oeffnet die repointete
// Inbox-Page, screenshotet + sammelt Console/Page-Errors. Gegen den lokalen
// Worktree-Dev-Server (SMOKE_BASE_URL, default :3011) = MEIN Branch.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3011'
const PASS = process.env.SMOKE_PASS ?? 'Test1234!'
const OUT = path.resolve('docs/02.06.2026/smoke-chat-inbox')
fs.mkdirSync(OUT, { recursive: true })

const TARGETS = [
  { role: 'admin', email: 'test-admin@claimondo.de', path: '/admin/nachrichten', name: '01-admin-nachrichten' },
  { role: 'sv', email: 'test-sv@claimondo.de', path: '/gutachter/posteingang', name: '02-sv-posteingang' },
  { role: 'kunde', email: 'test-kunde@claimondo.de', path: '/kunde/chat', name: '03-kunde-chat' },
]

async function login(page, email) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {})
}

const results = []
const browser = await chromium.launch()
for (const t of TARGETS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)))
  try {
    await login(page, t.email)
    const afterLogin = page.url()
    await page.goto(BASE + t.path, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForTimeout(4000) // Chat-Liste rendern lassen
    const shot = path.join(OUT, t.name + '.png')
    await page.screenshot({ path: shot, fullPage: true })
    const bodyText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
    const hasError = /Application error|Unhandled Runtime|client-side exception|Internal Server Error/i.test(bodyText)
    results.push({ role: t.role, path: t.path, afterLogin, finalUrl: page.url(), shot, hasError, consoleErrors: errors.slice(0, 6), bodyPreview: bodyText })
  } catch (e) {
    results.push({ role: t.role, path: t.path, fatal: String(e), consoleErrors: errors.slice(0, 6) })
  }
  await ctx.close()
}
await browser.close()
console.log('SMOKE_RESULT_JSON_START')
console.log(JSON.stringify(results, null, 2))
console.log('SMOKE_RESULT_JSON_END')
