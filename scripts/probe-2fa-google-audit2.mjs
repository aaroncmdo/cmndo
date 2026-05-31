/**
 * Round-2 Audit-Probe — Ground-Truth fuer:
 *  A2) Was rendert /login/2fa fuer einen 2FA-OFF User dessen
 *      claimondo_2fa_verified-Cookie fehlt? (Status + Body-Text + innerText)
 *  B2) Ist Supabase' Google-Provider ueberhaupt aktiv? (direkter Hit auf
 *      .../auth/v1/authorize?provider=google) + sauberer UI-Klick auf
 *      "Mit Google anmelden" inkl. Console/Nav-Capture.
 *
 * READ-ONLY. Kein OAuth-Callback. (Ein Email-OTP an test-admin@ kann durch
 * das Auto-Send der 2FA-Page ausgeloest werden — akzeptiert, Test-Adresse.)
 */
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
function loadEnv() {
  const p = join(ROOT, '.env.local'); if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i < 0) continue
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnv()
const BASE = process.env.SMOKE_STAGING_BASE ?? 'https://app.staging.claimondo.de'
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const BA_USER = process.env.STAGING_BASIC_AUTH_USER ?? 'aaroncmdo'
const BA_PASS = process.env.STAGING_BASIC_AUTH_PASS ?? ''
const PW = 'Test1234!'
const ADMIN_EMAIL = 'test-admin@claimondo.de'
if (!BA_PASS) { console.error('STAGING_BASIC_AUTH_PASS fehlt'); process.exit(2) }
const BASIC = 'Basic ' + Buffer.from(`${BA_USER}:${BA_PASS}`).toString('base64')
const OUT = join(ROOT, 'docs/31.05.2026/2fa-google-audit')
mkdirSync(OUT, { recursive: true })
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const out = { ts: new Date().toISOString(), base: BASE }

const browser = await chromium.launch()

// ── A2: /login/2fa Render fuer 2FA-OFF User ohne Cookie ─────────────────────
{
  const ctx = await browser.newContext({ httpCredentials: { username: BA_USER, password: BA_PASS }, locale: 'de-DE', viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()
  const A = {}
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(700)
    await page.fill('input[name="email"], #email', ADMIN_EMAIL)
    await page.fill('input[name="password"], #password', PW)
    await page.click('button:has-text("Einloggen")')
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 })
    await ctx.clearCookies({ name: 'claimondo_2fa_verified' })

    // Raw HTTP: /admin (Middleware) + /login/2fa (Page)
    const rAdmin = await ctx.request.get(`${BASE}/admin`, { headers: { Authorization: BASIC }, maxRedirects: 0 })
    A.admin = { status: rAdmin.status(), location: rAdmin.headers()['location'] ?? null }

    const r2fa = await ctx.request.get(`${BASE}/login/2fa`, { headers: { Authorization: BASIC }, maxRedirects: 0 })
    const body = await r2fa.text()
    A.login2fa = {
      status: r2fa.status(),
      location: r2fa.headers()['location'] ?? null,
      bodyLen: body.length,
      hasTwoFaHeading: /Zwei-Faktor/i.test(body),
      hasWeiterleitung: /Weiterleitung/i.test(body),
      bodyExcerpt: strip(body).slice(0, 500),
    }

    // Browser-Render
    await page.goto(`${BASE}/login/2fa`, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => { A.gotoErr = String(e.message).split('\n')[0] })
    await page.waitForTimeout(1500)
    A.browserFinalPath = new URL(page.url()).pathname
    A.innerText = (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 400)
    await page.screenshot({ path: join(OUT, 'A2-login2fa-render.png'), fullPage: true }).catch(() => {})
  } catch (e) { A.error = String(e.message).slice(0, 200) }
  out.A2 = A
  await ctx.close()
}

// ── B2: Supabase Google-Provider aktiv? + sauberer UI-Klick ─────────────────
{
  const ctx = await browser.newContext({ httpCredentials: { username: BA_USER, password: BA_PASS }, locale: 'de-DE', viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()
  const B = {}
  // direkter Hit auf Supabase authorize (kein Basic-Auth noetig, eigene Domain)
  try {
    const reqCtx = ctx.request
    const authorizeUrl = `${SUPA}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(BASE + '/api/auth/callback')}`
    const ra = await reqCtx.get(authorizeUrl, { maxRedirects: 0 })
    const loc = ra.headers()['location'] ?? null
    B.supabaseAuthorize = {
      status: ra.status(),
      location: loc ? loc.slice(0, 300) : null,
      reachesGoogle: !!loc && loc.includes('accounts.google.com'),
      providerError: !!loc && /error=|provider.*not.*enabled|unsupported/i.test(loc),
    }
  } catch (e) { B.supabaseAuthorizeErr = String(e.message).slice(0, 200) }

  // UI-Klick mit robusten Selektoren + Capture
  const consoleErrs = []
  const navs = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 160)) })
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url().slice(0, 200)) })
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(700)
    // Google-Tab (3. Tab) via Rolle
    const tab = page.getByRole('button', { name: 'Google', exact: true })
    if (await tab.count()) await tab.first().click()
    await page.waitForTimeout(500)
    const btn = page.getByRole('button', { name: /Mit Google anmelden/i })
    B.googleBtnVisible = (await btn.count()) > 0
    if (B.googleBtnVisible) {
      await Promise.race([
        btn.first().click().catch(() => {}),
        page.waitForTimeout(500),
      ])
      await page.waitForTimeout(4000)
    }
    B.finalUrl = page.url().slice(0, 250)
    B.navChain = navs
    B.consoleErrs = consoleErrs
    await page.screenshot({ path: join(OUT, 'B2-google-login.png'), fullPage: true }).catch(() => {})
  } catch (e) { B.error = String(e.message).slice(0, 200); B.navChain = navs; B.consoleErrs = consoleErrs }
  out.B2 = B
  await ctx.close()
}

await browser.close()
writeFileSync(join(OUT, 'findings2.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
console.log('\nDONE round-2 —', OUT)
