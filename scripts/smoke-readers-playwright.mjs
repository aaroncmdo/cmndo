// §A7 Reader-Repoint UI-Smoke (#2131). Server :3942. Login als smoke-admin,
// rendert /admin/team (aggregiert die repointeten Active-Filter) + versucht die
// 3 Mitarbeiter-Seiten (zeigt ob admin sie sieht oder Redirect). Trackt
// console.error + pageerror = Render-Crash-Signal.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:3942'
const PW = 'Cl@imondoSmoke939Xz'
const SHOT = 'docs/31.05.2026/smoke-fallstatus-repoint'
mkdirSync(SHOT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const errs = []

async function login(page, email) {
  await page.goto(`${BASE}/login`)
  await page.waitForLoadState('networkidle')
  const emailTab = page.getByRole('button', { name: /E-Mail/i })
  if (await emailTab.count()) { try { await emailTab.first().click() } catch {} }
  await page.fill('input[name=email]', email)
  await page.fill('input[name=password]', PW)
  await page.getByRole('button', { name: /Einloggen/i }).click()
  try {
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2500)
    return true
  } catch { return false }
}

function track(page, label) {
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`[${label}][console] ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => errs.push(`[${label}][pageerror] ${e.message.slice(0, 300)}`))
}

async function shoot(page, path, name) {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true })
  const nullLinks = await page.locator('a[href*="/faelle/null"]').count()
  const redirected = !page.url().includes(path)
  console.log(`SHOT ${name} url=${page.url()} redirected=${redirected} faelle-null-links=${nullLinks}`)
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1700 } })
const page = await ctx.newPage(); track(page, 'admin')
const ok = await login(page, 'smoke-admin@claimondo.test')
console.log('LOGIN admin:', ok, '->', page.url())
if (ok) {
  await shoot(page, '/admin/team', '04-admin-team')
  await shoot(page, '/admin/team/' + 'aa000001-0000-0000-0000-000000000001', '05-admin-team-kb')
  await shoot(page, '/mitarbeiter', '01-mitarbeiter')
  await shoot(page, '/mitarbeiter/performance', '02-performance')
  await shoot(page, '/mitarbeiter/isochrone', '03-isochrone')
} else {
  await page.screenshot({ path: `${SHOT}/00-admin-loginfail.png`, fullPage: true })
}
await ctx.close()
await browser.close()
console.log('=== CONSOLE/PAGE ERRORS ===')
console.log(errs.length ? errs.join('\n') : 'NONE')
console.log('DONE')
